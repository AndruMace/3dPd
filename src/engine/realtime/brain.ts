// Real-time AI for mobs. PD's states and its noticing rolls (one roll per PD turn) decide what a mob wants; this
// turns that into steering for its body: walking a PD path cell by cell, closing in directly once near, and a
// telegraphed wind-up before PD's own attack roll lands, which the hero can dodge by stepping out of reach.
import { Dungeon } from '../Dungeon';
import type { Char } from '../actors/Char';
import { findPath, flee } from '../actors/pathing';
import type { Mob } from '../actors/mobs/Mob';
import { Events, GLog } from '../core/events';
import { Random } from '../core/Random';
import { distance, WIDTH } from '../levels/constants';
import { Ballistica } from '../mechanics/Ballistica';
import type { Body } from './ActionGame';
import { Tuning } from './tuning';

interface GooMove {
  kind: 'pump' | 'crouch' | 'leap';
  /** Seconds left in this stage. */
  left: number;
  /** Leap: where it lands (cells). */
  x: number;
  z: number;
}

interface Mind {
  /** Goo's slam or leap in progress. */
  goo?: GooMove | null;
  /** Seconds until Goo next considers leaping. */
  leapCheck?: number;
  /** Seconds until the next PD-turn decision (noticing rolls, waking up). */
  turn: number;
  /** Next cell on the way to `target`, or -1. */
  waypoint: number;
  /** Seconds until this mob can start another attack. */
  cooldown: number;
  /** Seconds left in the current wind-up (0: not attacking). */
  windup: number;
}

/** The parts of Mob the brain drives (PD keeps them protected for its own AI). */
interface MobInternals {
  state: Mob['state'];
  enemySeen: boolean;
  target: number;
  enemy: Char | null;
  attackDelay(): number;
  notice(): void;
  chooseEnemy(): Char | null;
  nowhereToRun(): void;
}

const minds = new WeakMap<Mob, Mind>();

function mindOf(mob: Mob): Mind {
  let m = minds.get(mob);
  if (!m) minds.set(mob, (m = { turn: Random.Float(Tuning.TURN), waypoint: -1, cooldown: 0, windup: 0 }));
  return m;
}

/** Cells per second for a mob at PD speed `speed`. */
export function mobSpeed(mob: Char): number {
  return Tuning.MOB_SPEED * (1 + (mob.speed() - 1) * Tuning.MOB_SPEED_BONUS);
}

export function windupOf(mob: Char): number {
  return Tuning.WINDUPS[mob.constructor.name] ?? Tuning.MOB_WINDUP;
}

/** The mob is winding up a blow (the view flashes it; the hero can still step away). */
export function isWindingUp(mob: Mob): boolean {
  return (minds.get(mob)?.windup ?? 0) > 0;
}

/** Where a mob may walk: piranhas only swim (PD's Piranha paths over water cells). */
function walkable(mob: Mob): Uint8Array {
  return mob.constructor.name === 'Piranha' ? Dungeon.level.water : Dungeon.level.passable;
}

const centre = (cell: number): [number, number] => [(cell % WIDTH) + 0.5, Math.floor(cell / WIDTH) + 0.5];

/** Steering towards a point at `speed`; zero once there. */
function steer(body: Body, x: number, z: number, speed: number): [number, number] {
  const dx = x - body.x;
  const dz = z - body.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.02) return [0, 0];
  const s = Math.min(speed, d / Tuning.STEP);
  return [(dx / d) * s, (dz / d) * s];
}

/** Walks the PD path towards `targetCell`, one cell centre at a time. Returns the desired velocity. */
function walkTo(mob: Mob, body: Body, mind: Mind, targetCell: number, speed: number): [number, number] {
  if (mind.waypoint !== -1) {
    const [wx, wz] = centre(mind.waypoint);
    if (Math.hypot(wx - body.x, wz - body.z) > 0.12 && mind.waypoint !== mob.pos) return steer(body, wx, wz, speed);
  }
  mind.waypoint = targetCell === mob.pos ? -1 : findPath(mob, mob.pos, targetCell, walkable(mob), Dungeon.visible);
  if (mind.waypoint === -1) {
    // Already in the target cell (or no way there): head for its centre.
    if (targetCell === mob.pos) {
      const [tx, tz] = centre(targetCell);
      return steer(body, tx, tz, speed);
    }
    return [0, 0];
  }
  const [wx, wz] = centre(mind.waypoint);
  return steer(body, wx, wz, speed);
}

/** Can `a` see `b`? The hero's field of view for anything involving the hero, a line of sight otherwise. */
function canSee(a: Char, b: Char): boolean {
  const hero = Dungeon.hero;
  if (!b.isAlive() || b.invisible > 0) return false;
  if (a === hero) return !!Dungeon.visible[b.pos];
  if (b === hero) return !!Dungeon.visible[a.pos];
  return distance(a.pos, b.pos) <= 8 && Ballistica.cast(a.pos, b.pos, false, true) === b.pos;
}

/**
 * One step of a mob's real-time behaviour. Returns the velocity it wants; the caller moves the body (with
 * collisions) and keeps `mob.pos` on the cell under it. The mob fights whoever PD's chooseEnemy() picks: the hero
 * for most, other mobs for allies (bees, mirror images) and for the amok.
 */
export function thinkMob(mob: Mob, body: Body, bodyOf: (ch: Char) => Body | undefined, dt: number): [number, number] {
  const ai = mob as unknown as MobInternals;
  const mind = mindOf(mob);
  const hero = Dungeon.hero;
  mind.cooldown = Math.max(0, mind.cooldown - dt);
  if (mob.realtimeScheduled()) return [0, 0];

  mind.turn -= dt;
  const turnTick = mind.turn <= 0;
  if (turnTick) {
    mind.turn += Tuning.TURN;
    mob.realtimeTurn();
    if (!mob.isAlive()) return [0, 0];
  }

  if (mob.paralysed) {
    mind.windup = 0;
    ai.enemySeen = false;
    return [0, 0];
  }

  // Goo mid-slam or mid-leap carries on regardless of state.
  if (mind.goo) {
    const foe0 = ai.enemy ?? hero;
    const fb = bodyOf(foe0);
    if (fb) {
      const v = gooThink(mob as GooMob, body, mind, foe0, fb, true, Math.hypot(fb.x - body.x, fb.z - body.z), dt);
      if (v) return v;
    }
  }

  const ally = !mob.hostile;
  const foe = ai.chooseEnemy();
  ai.enemy = foe;
  const foeBody = foe ? bodyOf(foe) : undefined;
  const dist = foeBody ? Math.hypot(foeBody.x - body.x, foeBody.z - body.z) : Infinity;
  const reach = Tuning.MELEE_REACH;

  // A blow being wound up lands (or misses the spot) when the wind-up ends, wherever the foe is by then.
  if (mind.windup > 0) {
    if (foeBody) body.facing = Math.atan2(foeBody.z - body.z, foeBody.x - body.x);
    mind.windup -= dt;
    if (mind.windup <= 0) {
      mind.windup = 0;
      mind.cooldown = ai.attackDelay() * Tuning.TURN;
      if (foe && foe.isAlive() && dist <= reach + Tuning.REACH_SLACK && !mob.isCharmedBy(foe)) mob.attack(foe);
    }
    return [0, 0];
  }

  const sees = !!foe && !!foeBody && canSee(mob, foe);
  const speed = mobSpeed(mob);
  const cellDist = foe ? distance(mob.pos, foe.pos) : Infinity;
  // PD's noticing roll: stealth only matters against the hero.
  const noticeRoll = (range: number) =>
    foe === hero ? Random.Int(range + hero.stealth() + (hero.flying ? 2 : 0)) === 0 : true;

  // Allies with nobody to fight stay with the hero.
  if (ally && !(sees && foe)) {
    ai.state = 'WANDERING';
    const hb = bodyOf(hero);
    if (!hb) return [0, 0];
    const dh = Math.hypot(hb.x - body.x, hb.z - body.z);
    if (dh < 0.9) return [0, 0];
    if (distance(mob.pos, hero.pos) <= 1) return steer(body, hb.x, hb.z, speed);
    return walkTo(mob, body, mind, hero.pos, speed);
  }

  switch (ai.state) {
    case 'SLEEPING':
      if (turnTick && sees && foe && noticeRoll(cellDist)) {
        ai.enemySeen = true;
        ai.notice();
        ai.state = 'HUNTING';
        ai.target = foe.pos;
        mind.turn = Tuning.TURN; // TIME_TO_WAKE_UP
      } else if (turnTick) {
        ai.enemySeen = false;
      }
      return [0, 0];

    case 'WANDERING':
      if (sees && foe && (ally || (turnTick && noticeRoll(Math.trunc(cellDist / 2))))) {
        ai.enemySeen = true;
        ai.notice();
        ai.state = 'HUNTING';
        ai.target = foe.pos;
        return [0, 0];
      }
      if (ai.target === -1 || ai.target === mob.pos) ai.target = Dungeon.level.randomDestination();
      return walkTo(mob, body, mind, ai.target, speed * 0.75);

    case 'HUNTING': {
      ai.enemySeen = sees;
      if (sees && foe) ai.target = foe.pos;
      if (mob.constructor.name === 'Goo' && foe && foeBody) {
        const v = gooThink(mob as GooMob, body, mind, foe, foeBody, sees, dist, dt);
        if (v) return v;
      }
      if (sees && foe && foeBody && dist <= reach) {
        if (mind.cooldown <= 0 && !mob.isCharmedBy(foe)) {
          mind.windup = windupOf(mob);
          body.facing = Math.atan2(foeBody.z - body.z, foeBody.x - body.x);
          Events.emit({ type: 'attack', id: mob.id(), target: foe.pos });
          Events.emit({ type: 'fx', fx: 'windup', id: mob.id(), v: mind.windup });
        }
        return [0, 0];
      }
      // Close by and in sight: go straight for the foe (paths only matter around corners). Swimmers only if the
      // foe is in the water too.
      if (sees && foe && foeBody && cellDist <= 1 && walkable(mob)[foe.pos]) {
        mind.waypoint = -1;
        const stop = reach * 0.85;
        const k = Math.max(0, (dist - stop) / Math.max(dist, 1e-6));
        return steer(body, body.x + (foeBody.x - body.x) * k, body.z + (foeBody.z - body.z) * k, speed);
      }
      if (ai.target === -1 || ai.target === mob.pos) {
        // Lost the trail: back to wandering, as PD does when a hunt leads nowhere.
        ai.state = 'WANDERING';
        ai.target = Dungeon.level.randomDestination();
        return [0, 0];
      }
      return walkTo(mob, body, mind, ai.target, speed);
    }

    case 'FLEEING': {
      ai.enemySeen = sees;
      if (sees && foe) ai.target = foe.pos;
      if (mind.waypoint === -1 || mind.waypoint === mob.pos) {
        mind.waypoint = ai.target === -1 ? -1 : flee(mob, mob.pos, ai.target, walkable(mob), Dungeon.visible);
      }
      if (mind.waypoint === -1) {
        // Cornered: PD lets the mob decide (a thief turns on you).
        if (turnTick) ai.nowhereToRun();
        return [0, 0];
      }
      const [wx, wz] = centre(mind.waypoint);
      return steer(body, wx, wz, speed);
    }

    default:
      ai.enemySeen = false;
      return [0, 0];
  }
}

type GooMob = Mob & { setPumped(pumped: boolean, jumped: boolean): void };

/** Telegraph on the ground: a red ring at (x, z) of radius `r` for `seconds`. */
function warnArea(x: number, z: number, r: number, seconds: number, id: number): void {
  Events.emit({ type: 'fx', fx: 'area', id, x, z, r, v: seconds });
}

/** Hits `foe` with Goo's pumped-up blow (PD's numbers: 5-30 damage; the leap without the accuracy bonus). */
function gooStrike(goo: GooMob, foe: Char, jumped: boolean): void {
  goo.setPumped(true, jumped);
  goo.attack(foe);
  goo.setPumped(false, false);
}

/**
 * Goo in action mode. PD's Goo sometimes "pumps itself up" before a blow, and leaps at the hero from two cells
 * away. Here the pump-up is a slam with a red ring on the floor (step out of it), and the leap a crouch, a jump to
 * where the hero stood (also marked), and a shockwave on landing. Returns a velocity, or null to fall back to the
 * normal hunting behaviour.
 */
function gooThink(
  goo: GooMob,
  body: Body,
  mind: Mind,
  foe: Char,
  foeBody: Body,
  sees: boolean,
  dist: number,
  dt: number,
): [number, number] | null {
  const move = mind.goo;
  if (move) {
    move.left -= dt;
    if (move.kind === 'pump') {
      if (move.left > 0) return [0, 0];
      mind.goo = null;
      mind.cooldown = Tuning.TURN * 2;
      if (Math.hypot(foeBody.x - body.x, foeBody.z - body.z) <= Tuning.GOO_SLAM_RADIUS) gooStrike(goo, foe, false);
      else Events.emit({ type: 'fx', fx: 'Speck.ROCK', id: goo.id(), n: 6 });
      return [0, 0];
    }
    if (move.kind === 'crouch') {
      if (move.left > 0) return [0, 0];
      move.kind = 'leap';
      move.left = Tuning.GOO_LEAP_TIME;
      Events.emit({ type: 'fx', fx: 'jump', id: goo.id(), pos: goo.pos, to: Dungeon.hero.pos });
    }
    // In the air: straight to the landing spot.
    if (move.left > 0) {
      const dx = move.x - body.x;
      const dz = move.z - body.z;
      const d = Math.hypot(dx, dz);
      const v = d / Math.max(move.left, Tuning.STEP);
      return d < 0.02 ? [0, 0] : [(dx / d) * v, (dz / d) * v];
    }
    mind.goo = null;
    mind.cooldown = Tuning.TURN * 2;
    Events.emit({ type: 'fx', fx: 'shake', v: 2, n: 0.3 });
    Events.emit({ type: 'fx', fx: 'Speck.ROCK', id: goo.id(), n: 8 });
    if (Math.hypot(foeBody.x - body.x, foeBody.z - body.z) <= Tuning.GOO_LEAP_RADIUS) gooStrike(goo, foe, true);
    return [0, 0];
  }

  if (!sees || mind.cooldown > 0 || mind.windup > 0) return null;
  // Close: one blow in three becomes a slam.
  if (dist <= Tuning.MELEE_REACH) {
    if (Random.Int(3) !== 0) return null;
    mind.goo = { kind: 'pump', left: Tuning.GOO_PUMP, x: body.x, z: body.z };
    warnArea(body.x, body.z, Tuning.GOO_SLAM_RADIUS, Tuning.GOO_PUMP, goo.id());
    Events.emit({ type: 'fx', fx: 'pumpUp', id: goo.id() });
    goo.showStatus('negative', '!!!');
    GLog.n('Goo is pumping itself up!');
    return [0, 0];
  }
  // Kept at a distance: now and then, leap at the hero.
  mind.leapCheck = (mind.leapCheck ?? Tuning.GOO_LEAP_CHECK) - dt;
  if (dist <= Tuning.GOO_LEAP_RANGE && mind.leapCheck <= 0) {
    mind.leapCheck = Tuning.GOO_LEAP_CHECK;
    if (Random.Float() < Tuning.GOO_LEAP_CHANCE && Ballistica.cast(goo.pos, foe.pos, false, false) === foe.pos) {
      mind.goo = { kind: 'crouch', left: Tuning.GOO_LEAP_WINDUP, x: foeBody.x, z: foeBody.z };
      warnArea(foeBody.x, foeBody.z, Tuning.GOO_LEAP_RADIUS, Tuning.GOO_LEAP_WINDUP + Tuning.GOO_LEAP_TIME, goo.id());
      Events.emit({ type: 'fx', fx: 'windup', id: goo.id(), v: Tuning.GOO_LEAP_WINDUP });
      return [0, 0];
    }
  }
  return null;
}
