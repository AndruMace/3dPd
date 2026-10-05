// Real-time AI for mobs. PD's states and its noticing rolls (one roll per PD turn) decide what a mob wants; this
// turns that into steering for its body: walking a PD path cell by cell, closing in directly once near, and a
// telegraphed wind-up before PD's own attack roll lands, which the hero can dodge by stepping out of reach.
import { Dungeon } from '../Dungeon';
import type { Char } from '../actors/Char';
import { findPath, flee } from '../actors/pathing';
import type { Mob } from '../actors/mobs/Mob';
import { Events } from '../core/events';
import { Random } from '../core/Random';
import { distance, WIDTH } from '../levels/constants';
import type { Body } from './ActionGame';
import { Tuning } from './tuning';

interface Mind {
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
  attackDelay(): number;
  notice(): void;
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

/**
 * One step of a mob's real-time behaviour. Returns the velocity it wants; the caller moves the body (with
 * collisions) and keeps `mob.pos` on the cell under it.
 */
export function thinkMob(mob: Mob, body: Body, heroBody: Body, dt: number): [number, number] {
  const ai = mob as unknown as MobInternals;
  const mind = mindOf(mob);
  const hero = Dungeon.hero;
  mind.cooldown = Math.max(0, mind.cooldown - dt);

  if (mob.paralysed) {
    mind.windup = 0;
    ai.enemySeen = false;
    return [0, 0];
  }

  const dist = Math.hypot(heroBody.x - body.x, heroBody.z - body.z);
  const reach = Tuning.MELEE_REACH;

  // A blow being wound up lands (or misses the spot) when the wind-up ends, wherever the hero is by then.
  if (mind.windup > 0) {
    body.facing = Math.atan2(heroBody.z - body.z, heroBody.x - body.x);
    mind.windup -= dt;
    if (mind.windup <= 0) {
      mind.windup = 0;
      mind.cooldown = ai.attackDelay() * Tuning.TURN;
      if (hero.isAlive() && dist <= reach + Tuning.REACH_SLACK && !mob.isCharmedBy(hero)) mob.attack(hero);
    }
    return [0, 0];
  }

  const sees = hero.isAlive() && hero.invisible <= 0 && !!Dungeon.visible[mob.pos];
  mind.turn -= dt;
  const turnTick = mind.turn <= 0;
  if (turnTick) mind.turn += Tuning.TURN;
  const speed = mobSpeed(mob);
  const cellDist = distance(mob.pos, hero.pos);

  switch (ai.state) {
    case 'SLEEPING':
      if (turnTick && sees && Random.Int(cellDist + hero.stealth() + (hero.flying ? 2 : 0)) === 0) {
        ai.enemySeen = true;
        ai.notice();
        ai.state = 'HUNTING';
        ai.target = hero.pos;
        mind.turn = Tuning.TURN; // TIME_TO_WAKE_UP
      } else if (turnTick) {
        ai.enemySeen = false;
      }
      return [0, 0];

    case 'WANDERING':
      if (turnTick && sees && Random.Int(Math.trunc(cellDist / 2) + hero.stealth()) === 0) {
        ai.enemySeen = true;
        ai.notice();
        ai.state = 'HUNTING';
        ai.target = hero.pos;
        return [0, 0];
      }
      if (ai.target === -1 || ai.target === mob.pos) ai.target = Dungeon.level.randomDestination();
      return walkTo(mob, body, mind, ai.target, speed * 0.75);

    case 'HUNTING': {
      ai.enemySeen = sees;
      if (sees) ai.target = hero.pos;
      if (sees && dist <= reach) {
        if (mind.cooldown <= 0 && !mob.isCharmedBy(hero)) {
          mind.windup = windupOf(mob);
          body.facing = Math.atan2(heroBody.z - body.z, heroBody.x - body.x);
          Events.emit({ type: 'attack', id: mob.id(), target: hero.pos });
          Events.emit({ type: 'fx', fx: 'windup', id: mob.id(), v: mind.windup });
        }
        return [0, 0];
      }
      // Close by and in sight: go straight for the hero (paths only matter around corners). Swimmers only if
      // the hero is in the water too.
      if (sees && cellDist <= 1 && walkable(mob)[hero.pos]) {
        mind.waypoint = -1;
        const stop = reach * 0.85;
        const k = Math.max(0, (dist - stop) / Math.max(dist, 1e-6));
        return steer(body, body.x + (heroBody.x - body.x) * k, body.z + (heroBody.z - body.z) * k, speed);
      }
      if (ai.target === mob.pos) {
        // Lost the trail: back to wandering, as PD does when a hunt leads nowhere.
        ai.state = 'WANDERING';
        ai.target = Dungeon.level.randomDestination();
        return [0, 0];
      }
      return walkTo(mob, body, mind, ai.target, speed);
    }

    case 'FLEEING': {
      ai.enemySeen = sees;
      if (sees) ai.target = hero.pos;
      if (mind.waypoint === -1 || mind.waypoint === mob.pos) {
        mind.waypoint = flee(mob, mob.pos, ai.target, walkable(mob), Dungeon.visible);
      }
      if (mind.waypoint === -1) return [0, 0];
      const [wx, wz] = centre(mind.waypoint);
      return steer(body, wx, wz, speed);
    }

    default:
      ai.enemySeen = false;
      return [0, 0];
  }
}
