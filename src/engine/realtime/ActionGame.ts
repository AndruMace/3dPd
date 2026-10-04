// Action mode: the dungeon in real time. Characters are circles moving freely through PD's cell grid; whenever a
// body crosses into a new cell, PD's own cell logic runs for it (traps, grass, wells, field of view, passive
// search, picking up items). A fixed-step world clock drives the scheduler for everything that isn't a
// character (buffs, hunger, regeneration, blobs), so those keep PD's rules, measured in seconds.
import { Assets } from '../../content/generated/Assets';
import { Dungeon } from '../Dungeon';
import { Game } from '../Game';
import { Actor } from '../actors/Actor';
import type { Char } from '../actors/Char';
import { Hunger } from '../actors/buffs/buffs';
import { Sample } from '../core/fx';
import { UI } from '../core/ui';
import { Amulet } from '../items/misc';
import type { Level } from '../levels/Level';
import { Terrain as T } from '../levels/Terrain';
import { WIDTH } from '../levels/constants';
import { observe } from '../observe';
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
  radius: number;
  /** Direction faced, in radians (0 = east, +z is south; atan2(vz, vx)). */
  facing: number;
}

/** One step's worth of player intent, already in world space (the view converts stick/keys by camera yaw). */
export interface ActionInput {
  /** Desired move direction and strength (length 0..1). */
  moveX: number;
  moveZ: number;
}

export type Interaction = { kind: 'descend' | 'ascend'; cell: number };

const cellOf = (x: number, z: number) => Math.floor(x) + Math.floor(z) * WIDTH;

const bodies = new Map<Char, Body>();
let level: Level | null = null;
let acc = 0;
let travelled = 0;
const openedDoors = new Set<number>();

function makeBody(ch: Char): Body {
  const x = (ch.pos % WIDTH) + 0.5;
  const z = Math.floor(ch.pos / WIDTH) + 0.5;
  return { char: ch, x, z, px: x, pz: z, vx: 0, vz: 0, radius: Tuning.BODY_RADIUS, facing: 0 };
}

/** Keeps bodies in step with the engine: new level, new or dead mobs, and characters the engine moved itself. */
function reconcile(): void {
  if (Dungeon.level !== level) {
    level = Dungeon.level;
    bodies.clear();
    openedDoors.clear();
    acc = 0;
  }
  const chars: Char[] = [Dungeon.hero, ...Dungeon.level.mobs];
  const alive = new Set<Char>(chars);
  for (const ch of bodies.keys()) if (!alive.has(ch)) bodies.delete(ch);
  for (const ch of chars) {
    const b = bodies.get(ch);
    if (!b) bodies.set(ch, makeBody(ch));
    // Teleports, blinks, knockbacks: the engine moved the character to another cell.
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

function tick(input: ActionInput): void {
  reconcile();
  const hero = Dungeon.hero;
  const lvl = Dungeon.level;
  const dt = Tuning.STEP;

  for (const b of bodies.values()) {
    b.px = b.x;
    b.pz = b.z;
  }

  // Hero: velocity eases toward the stick; paralysis and roots hold the hero in place.
  const hb = bodies.get(hero)!;
  const held = hero.paralysed || hero.rooted;
  let mx = held ? 0 : input.moveX;
  let mz = held ? 0 : input.moveZ;
  const len = Math.hypot(mx, mz);
  if (len > 1) {
    mx /= len;
    mz /= len;
  }
  const speed = Tuning.HERO_SPEED * hero.speed();
  const k = 1 - Math.exp(-Tuning.HERO_ACCEL * dt);
  hb.vx += (mx * speed - hb.vx) * k;
  hb.vz += (mz * speed - hb.vz) * k;
  if (Math.hypot(hb.vx, hb.vz) < 0.01 && len === 0) hb.vx = hb.vz = 0;

  let [nx, nz] = moveCircle(lvl.map, lvl.passable, hb.x, hb.z, hb.radius, hb.vx * dt, hb.vz * dt);
  // Other characters are solid too (they don't move yet, so the hero yields).
  for (const b of bodies.values()) {
    if (b === hb) continue;
    const dx = nx - b.x;
    const dz = nz - b.z;
    const d = Math.hypot(dx, dz);
    const min = hb.radius + b.radius;
    if (d < min && d > 1e-6) {
      nx = b.x + (dx / d) * min;
      nz = b.z + (dz / d) * min;
    }
  }
  [nx, nz] = moveCircle(lvl.map, lvl.passable, nx, nz, hb.radius, 0, 0);
  const moved = Math.hypot(nx - hb.x, nz - hb.z);
  hb.x = nx;
  hb.z = nz;
  if (moved > 1e-4) hb.facing = Math.atan2(hb.vz, hb.vx);

  if (moved > 0 && !hero.flying) {
    travelled += moved;
    if (travelled >= Tuning.FOOTSTEP_EVERY) {
      travelled = 0;
      if (!lvl.water[hero.pos]) Sample.play(Assets.SND_STEP);
    }
  }

  const cell = cellOf(hb.x, hb.z);
  if (cell !== hero.pos) heroEnters(cell);

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
  },

  get enabled(): boolean {
    return Game.realtime;
  },

  bodies(): ReadonlyMap<Char, Body> {
    reconcile();
    return bodies;
  },

  /**
   * Advances the world by `dt` seconds of real time in fixed steps. Returns how far the world is into the next
   * step (0..1), for interpolating positions.
   */
  update(dt: number, input: ActionInput): number {
    if (!Dungeon.hero || !Dungeon.hero.isAlive()) return 0;
    acc += Math.min(dt, 0.25);
    while (acc >= Tuning.STEP) {
      acc -= Tuning.STEP;
      tick(input);
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
