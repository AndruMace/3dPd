// Action mode: the dungeon in real time. Characters are circles moving freely through PD's cell grid; whenever a
// body crosses into a new cell, PD's own cell logic runs for it (traps, grass, wells, field of view, passive
// search, picking up items). A fixed-step world clock drives the scheduler for everything that isn't a
// character (buffs, hunger, regeneration, blobs), so those keep PD's rules, measured in seconds. Mobs are driven
// by `brain.ts`; the hero by the player's stick, a target and the attack button.
import { Assets } from '../../content/generated/Assets';
import { Dungeon } from '../Dungeon';
import { Game } from '../Game';
import { Actor } from '../actors/Actor';
import type { Char } from '../actors/Char';
import { Hunger, Invisibility } from '../actors/buffs/buffs';
import type { Mob } from '../actors/mobs/Mob';
import { Events, GLog } from '../core/events';
import { Sample } from '../core/fx';
import { UI } from '../core/ui';
import { Amulet } from '../items/misc';
import type { Level } from '../levels/Level';
import { Terrain as T } from '../levels/Terrain';
import { WIDTH } from '../levels/constants';
import { observe } from '../observe';
import { thinkMob } from './brain';
import { moveCircle } from './collision';
import { Tuning } from './tuning';

/** A character's physical presence: position in cells (x = column, z = row), velocity and facing. */
export interface Body {
  char: Char;
  x: number;
  z: number;
  /** Position at the previous step, for render interpolation. */
  px: number;
  pz: number;
  vx: number;
  vz: number;
  /** Knockback velocity, decaying on its own. */
  kx: number;
  kz: number;
  radius: number;
  /** Direction faced, in radians (0 = east, +z is south; atan2(vz, vx)). */
  facing: number;
}

/** One step's worth of player intent, already in world space (the view converts stick/keys by camera yaw). */
export interface ActionInput {
  /** Desired move direction and strength (length 0..1). */
  moveX: number;
  moveZ: number;
  /** The attack button/key is held: fight the target, or the best enemy nearby. */
  attack?: boolean;
  /** The player tapped/clicked this enemy: target it and go for it. */
  engage?: Mob | null;
  /** Sprint is on. */
  sprint?: boolean;
}

export type Interaction = { kind: 'descend' | 'ascend'; cell: number };

const cellOf = (x: number, z: number) => Math.floor(x) + Math.floor(z) * WIDTH;

const bodies = new Map<Char, Body>();
let level: Level | null = null;
let acc = 0;
let travelled = 0;
const openedDoors = new Set<number>();

// The hero's fight.
let target: Mob | null = null;
let engaged = false;
let swing = 0;
let swingTarget: Mob | null = null;
let heroCooldown = 0;
let hitstop = 0;
let sprinting = false;

function makeBody(ch: Char): Body {
  const x = (ch.pos % WIDTH) + 0.5;
  const z = Math.floor(ch.pos / WIDTH) + 0.5;
  return { char: ch, x, z, px: x, pz: z, vx: 0, vz: 0, kx: 0, kz: 0, radius: Tuning.BODY_RADIUS, facing: 0 };
}

/** Keeps bodies in step with the engine: new level, new or dead mobs, and characters the engine moved itself. */
function reconcile(): void {
  if (Dungeon.level !== level) {
    level = Dungeon.level;
    bodies.clear();
    openedDoors.clear();
    acc = 0;
    target = swingTarget = null;
    engaged = false;
    swing = 0;
  }
  const chars: Char[] = [Dungeon.hero, ...Dungeon.level.mobs];
  const alive = new Set<Char>(chars);
  for (const ch of bodies.keys()) if (!alive.has(ch)) bodies.delete(ch);
  for (const ch of chars) {
    const b = bodies.get(ch);
    if (!b) bodies.set(ch, makeBody(ch));
    // Teleports, blinks: the engine moved the character to another cell.
    else if (cellOf(b.x, b.z) !== ch.pos) bodies.set(ch, makeBody(ch));
  }
}

/** The hero's centre crossed into `cell`: PD's Hero.move without the move itself. */
function heroEnters(cell: number): void {
  const hero = Dungeon.hero;
  const lvl = Dungeon.level;
  hero.pos = cell;
  if (!hero.flying && lvl.water[cell]) Sample.play(Assets.SND_WATER);
  if (!hero.flying) lvl.press(cell, hero);
  observe();
  hero.search(false);
  autoPickUp();
}

/** Walking over items picks them up (as many as fit). Chests and other heap types need Interact. */
function autoPickUp(): void {
  const hero = Dungeon.hero;
  for (let i = 0; i < 20; i++) {
    const heap = Dungeon.level.heaps.get(hero.pos);
    if (!heap || heap.type !== 'HEAP' || UI.pending) return;
    if (!hero.pickUpHere()) return;
  }
}

/** Doors open while a body is close to them and close again when nobody is. */
function updateDoors(): void {
  const lvl = Dungeon.level;
  const R = Tuning.DOOR_OPEN_RADIUS;
  const near = new Set<number>();
  for (const b of bodies.values()) {
    const cx = Math.floor(b.x);
    const cz = Math.floor(b.z);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        const c = cx + dx + (cz + dz) * WIDTH;
        const t = lvl.map[c];
        if (t !== T.DOOR && t !== T.OPEN_DOOR) continue;
        if (Math.hypot(b.x - (cx + dx + 0.5), b.z - (cz + dz + 0.5)) < R) near.add(c);
      }
  }
  for (const c of near) {
    if (lvl.map[c] === T.DOOR) {
      lvl.doorEnter(c);
      openedDoors.add(c);
    }
  }
  for (const c of [...openedDoors]) {
    if (near.has(c)) continue;
    if (lvl.map[c] === T.OPEN_DOOR) lvl.doorLeave(c);
    if (lvl.map[c] !== T.OPEN_DOOR) openedDoors.delete(c);
  }
}

/** A mob the hero can fight: alive, on this level, hostile and in sight. */
function fightable(m: Mob | null): m is Mob {
  return !!m && m.isAlive() && Dungeon.level.mobs.has(m) && m.hostile && !!Dungeon.visible[m.pos] && bodies.has(m);
}

/** Auto-target: the closest enemy nearby, favouring those in front of the hero. */
function bestTarget(hb: Body): Mob | null {
  let best: Mob | null = null;
  let bestScore = Infinity;
  const fx = Math.cos(hb.facing);
  const fz = Math.sin(hb.facing);
  for (const m of Dungeon.level.mobs) {
    if (!fightable(m)) continue;
    const b = bodies.get(m)!;
    const dx = b.x - hb.x;
    const dz = b.z - hb.z;
    const d = Math.hypot(dx, dz);
    if (d > Tuning.AUTO_TARGET_RANGE) continue;
    const front = d > 1e-6 ? (dx * fx + dz * fz) / d : 1;
    const score = d - front * 0.8;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Moves a body with its intended velocity plus knockback, sliding along walls. */
function moveBody(b: Body, vx: number, vz: number, dt: number): number {
  const lvl = Dungeon.level;
  const k = Math.exp(-12 * dt);
  const [nx, nz] = moveCircle(lvl.map, lvl.passable, b.x, b.z, b.radius, (vx + b.kx) * dt, (vz + b.kz) * dt);
  b.kx *= k;
  b.kz *= k;
  const moved = Math.hypot(nx - b.x, nz - b.z);
  b.x = nx;
  b.z = nz;
  b.vx = vx;
  b.vz = vz;
  return moved;
}

/** Bodies push each other apart (the hero gives way less than mobs do). */
function separate(): void {
  const lvl = Dungeon.level;
  const list = [...bodies.values()];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dz);
      const min = a.radius + b.radius;
      if (d >= min) continue;
      const nx = d > 1e-6 ? dx / d : 1;
      const nz = d > 1e-6 ? dz / d : 0;
      const push = min - d;
      const wa = a.char === Dungeon.hero ? 0.3 : b.char === Dungeon.hero ? 0.7 : 0.5;
      a.x -= nx * push * wa;
      a.z -= nz * push * wa;
      b.x += nx * push * (1 - wa);
      b.z += nz * push * (1 - wa);
    }
  }
  for (const b of list) [b.x, b.z] = moveCircle(lvl.map, lvl.passable, b.x, b.z, b.radius, 0, 0);
}

/** The hero's blow lands at the impact frame (if the target is still in reach). */
function heroStrike(hb: Body): void {
  const hero = Dungeon.hero;
  const t = swingTarget;
  swingTarget = null;
  if (!fightable(t)) return;
  const tb = bodies.get(t)!;
  const d = Math.hypot(tb.x - hb.x, tb.z - hb.z);
  if (d > Tuning.MELEE_REACH + Tuning.REACH_SLACK) {
    Sample.play(Assets.SND_MISS, t.pos);
    return;
  }
  hero.enemy = t;
  const hit = hero.attack(t);
  Invisibility.dispel();
  if (hit) {
    hitstop = Tuning.HITSTOP;
    if (d > 1e-6 && t.isAlive()) {
      tb.kx += ((tb.x - hb.x) / d) * Tuning.KNOCKBACK;
      tb.kz += ((tb.z - hb.z) / d) * Tuning.KNOCKBACK;
    }
  }
}

function tick(input: ActionInput): void {
  reconcile();
  const hero = Dungeon.hero;
  const lvl = Dungeon.level;
  const dt = Tuning.STEP;

  for (const b of bodies.values()) {
    b.px = b.x;
    b.pz = b.z;
  }

  // A solid hit freezes the world for a moment.
  if (hitstop > 0) {
    hitstop -= dt;
    return;
  }

  const hb = bodies.get(hero)!;
  const held = hero.paralysed || hero.rooted;
  let mx = held ? 0 : input.moveX;
  let mz = held ? 0 : input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }

  // ---- Targeting and swings ----
  if (input.engage && fightable(input.engage)) {
    target = input.engage;
    engaged = true;
  }
  if (input.attack) {
    if (!fightable(target)) target = bestTarget(hb);
    if (target) engaged = true;
  } else if (len > 0.1 && !input.engage) {
    // Steering away by hand ends the auto-attack (the target stays selected).
    engaged = false;
  }
  if (!fightable(target)) {
    target = null;
    engaged = false;
  }

  heroCooldown = Math.max(0, heroCooldown - dt);
  if (swing > 0) {
    swing -= dt;
    if (swing <= 0) {
      swing = 0;
      heroStrike(hb);
    }
  }
  let targetDist = Infinity;
  if (target) {
    const tb = bodies.get(target)!;
    targetDist = Math.hypot(tb.x - hb.x, tb.z - hb.z);
    if (engaged && !held && swing === 0 && heroCooldown === 0 && targetDist <= Tuning.MELEE_REACH) {
      swing = Tuning.HERO_WINDUP;
      swingTarget = target;
      heroCooldown = hero.attackDelay() * Tuning.TURN;
      hb.facing = Math.atan2(tb.z - hb.z, tb.x - hb.x);
      Events.emit({ type: 'attack', id: hero.id(), target: target.pos });
    }
    // Engaged without steering: close in on the target.
    if (engaged && len < 0.1 && !held && targetDist > Tuning.MELEE_REACH * 0.85) {
      mx = (tb.x - hb.x) / targetDist;
      mz = (tb.z - hb.z) / targetDist;
    }
  }

  // ---- Hero movement ----
  const hunger = hero.buff(Hunger);
  sprinting = !!input.sprint && len > 0.2 && swing === 0 && !held && !(hunger?.isStarving() ?? false);
  let speed = Tuning.HERO_SPEED * hero.speed();
  if (sprinting) speed *= Tuning.SPRINT_SPEED;
  if (swing > 0) speed *= Tuning.SWING_SLOWDOWN;
  const k = 1 - Math.exp(-Tuning.HERO_ACCEL * dt);
  const vx = hb.vx + (mx * speed - hb.vx) * k;
  const vz = hb.vz + (mz * speed - hb.vz) * k;
  const still = Math.hypot(vx, vz) < 0.01 && Math.hypot(mx, mz) === 0;
  const moved = moveBody(hb, still ? 0 : vx, still ? 0 : vz, dt);
  if (moved > 1e-4 && swing === 0 && Math.hypot(mx, mz) > 0.05) hb.facing = Math.atan2(mz, mx);

  if (sprinting && hunger) {
    const was = hunger.hungerLevel;
    hunger.satisfy(-Tuning.SPRINT_HUNGER * dt);
    if (was < Hunger.HUNGRY && hunger.hungerLevel >= Hunger.HUNGRY) GLog.w('You are hungry.');
  }
  if (moved > 0 && !hero.flying) {
    travelled += moved * (sprinting ? 0.8 : 1);
    if (travelled >= Tuning.FOOTSTEP_EVERY) {
      travelled = 0;
      if (!lvl.water[hero.pos]) Sample.play(Assets.SND_STEP);
    }
  }

  // ---- Mobs ----
  for (const [ch, b] of bodies) {
    if (ch === hero) continue;
    const [wx, wz] = thinkMob(ch as Mob, b, hb, dt);
    const moving = Math.hypot(wx, wz) > 0.01;
    moveBody(b, wx, wz, dt);
    if (moving) b.facing = Math.atan2(wz, wx);
  }
  separate();

  // ---- Cells: everyone's logical position follows their body ----
  const heroCell = cellOf(hb.x, hb.z);
  if (heroCell !== hero.pos) heroEnters(heroCell);
  for (const [ch, b] of bodies) {
    if (ch === hero || !ch.isAlive()) continue;
    const cell = cellOf(b.x, b.z);
    if (cell === ch.pos) continue;
    // Swimmers stay in the water: undo a push that would beach them.
    if (ch.constructor.name === 'Piranha' && !lvl.water[cell]) {
      b.x = b.px;
      b.z = b.pz;
      continue;
    }
    ch.move(cell);
  }

  updateDoors();

  // The world clock: everything that isn't a character takes its turns.
  Actor.advance(Actor.now() + dt / Tuning.TURN);
}

export const ActionGame = {
  /** Switch the engine to action mode (call before starting or loading a run). */
  enable(on = true): void {
    Game.realtime = on;
    level = null;
    bodies.clear();
    target = swingTarget = null;
    engaged = false;
    swing = heroCooldown = hitstop = 0;
  },

  get enabled(): boolean {
    return Game.realtime;
  },

  bodies(): ReadonlyMap<Char, Body> {
    reconcile();
    return bodies;
  },

  /** The enemy the hero is fighting or has selected, if any. */
  get target(): Mob | null {
    return fightable(target) ? target : null;
  },

  get sprinting(): boolean {
    return sprinting;
  },

  /**
   * Advances the world by `dt` seconds of real time in fixed steps. Returns how far the world is into the next
   * step (0..1), for interpolating positions.
   */
  update(dt: number, input: ActionInput): number {
    if (!Dungeon.hero || !Dungeon.hero.isAlive()) return 0;
    acc += Math.min(dt, 0.25);
    let first = true;
    while (acc >= Tuning.STEP) {
      acc -= Tuning.STEP;
      // A tap/click selection is used once; held buttons apply to every step.
      tick(first ? input : { ...input, engage: null });
      first = false;
      // Stop at anything that needs the player or the view: a window, a level change, death.
      if (UI.pending || Dungeon.hero.pendingTransition || !Dungeon.hero.isAlive()) {
        acc = 0;
        break;
      }
    }
    return acc / Tuning.STEP;
  },

  /** What Interact would do where the hero stands. */
  interaction(): Interaction | null {
    const hero = Dungeon.hero;
    if (!hero) return null;
    if (hero.pos === Dungeon.level.exit) return { kind: 'descend', cell: hero.pos };
    if (hero.pos === Dungeon.level.entrance) return { kind: 'ascend', cell: hero.pos };
    return null;
  },

  /** The Interact button: take the stairs (Hero.actDescend / actAscend on arrival). */
  interact(): void {
    const it = ActionGame.interaction();
    if (!it) return;
    const hero = Dungeon.hero;
    if (it.kind === 'ascend' && Dungeon.depth === 1) {
      if (hero.belongings.getItem(Amulet) === null) UI.message('One does not simply leave Pixel Dungeon.');
      else hero.pendingTransition = 'win';
      return;
    }
    const hunger = hero.buff(Hunger);
    if (hunger !== null && !hunger.isStarving()) hunger.satisfy(-Hunger.STARVING / 10);
    hero.pendingTransition = it.kind;
  },
};
