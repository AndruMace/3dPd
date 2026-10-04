// Port of actors/Actor.java: the global time-ordered scheduler.
//
// Differences from the original, by design: act() runs synchronously. Where PD returned false and waited for a
// sprite animation to call next(), the port resolves the action immediately and returns true; the view replays
// the emitted events afterwards. act() returning false now only means "the hero is waiting for input".
import { Dungeon } from '../Dungeon';
import { LENGTH } from '../levels/constants';
import type { Char } from './Char';

export const TICK = 1;

let all = new Set<Actor>();
let current: Actor | null = null;
const ids = new Map<number, Actor>();
let now = 0;
const chars: (Char | null)[] = new Array(LENGTH).fill(null);

export abstract class Actor {
  time = 0;
  private _id = 0;

  /** Act and return true to let the scheduler continue, false to stop and wait for player input. */
  protected abstract act(): boolean;

  /** Lets subclasses (Char) be recognized without importing them. */
  isChar(): this is Char {
    return false;
  }

  spend(time: number): void {
    this.time += time;
  }

  protected postpone(time: number): void {
    if (this.time < now + time) this.time = now + time;
  }

  cooldown(): number {
    return this.time - now;
  }

  protected diactivate(): void {
    this.time = Number.MAX_VALUE;
  }

  protected onAdd(): void {}
  protected onRemove(): void {}

  id(): number {
    if (this._id > 0) return this._id;
    let max = 0;
    for (const a of all) if (a._id > max) max = a._id;
    return (this._id = max + 1);
  }

  /** Releases the scheduler if this actor is the one it is waiting on. */
  next(): void {
    if (current === this) current = null;
  }

  // ---- Static scheduler ----

  static clear(): void {
    now = 0;
    chars.fill(null);
    all.clear();
    ids.clear();
    current = null;
  }

  static fixTime(): void {
    let min = Number.MAX_VALUE;
    for (const a of all) if (a.time < min) min = a.time;
    for (const a of all) a.time -= min;
    now = 0;
  }

  static init(): void {
    Actor.addDelayed(Dungeon.hero, -Number.MIN_VALUE);
    for (const mob of Dungeon.level.mobs) Actor.add(mob);
    current = null;
  }

  static occupyCell(ch: Char): void {
    chars[ch.pos] = ch;
  }

  static freeCell(pos: number): void {
    chars[pos] = null;
  }

  /**
   * Runs actors in time order until the hero needs input, the hero dies, or (when `heroTurns` is given) the hero
   * has taken that many turns of a continuing action, so the view can animate step by step and the player can
   * interrupt. Returns the number of acts performed.
   */
  static process(heroTurns = Infinity): number {
    if (current !== null) return 0;
    let acts = 0;
    let heroActs = 0;
    let doNext: boolean;
    do {
      now = Number.MAX_VALUE;
      current = null;
      chars.fill(null);
      for (const actor of all) {
        if (actor.time < now) {
          now = actor.time;
          current = actor;
        }
        if (actor.isChar()) chars[actor.pos] = actor;
      }
      if (current === null) break;
      const cur: Actor = current;
      if (cur === Dungeon.hero && heroActs >= heroTurns) {
        current = null;
        break;
      }
      if (cur === Dungeon.hero) heroActs++;
      doNext = cur.act();
      acts++;
      if (doNext && !Dungeon.hero.isAlive()) {
        doNext = false;
        current = null;
      }
      if (acts > 100000) throw new Error('Actor.process: runaway loop');
    } while (doNext);
    // The hero is waiting for input: leave it as `current` (as PD does) so process() won't run until next().
    return acts;
  }

  static add(actor: Actor): void {
    Actor.addAt(actor, now);
  }

  static addDelayed(actor: Actor, delay: number): void {
    Actor.addAt(actor, now + delay);
  }

  private static addAt(actor: Actor, time: number): void {
    if (all.has(actor)) return;
    if (actor._id > 0) ids.set(actor._id, actor);
    all.add(actor);
    actor.time += time;
    actor.onAdd();
    if (actor.isChar()) {
      chars[actor.pos] = actor;
      for (const buff of actor.buffs()) {
        all.add(buff);
        buff.onAdd();
      }
    }
  }

  static remove(actor: Actor | null): void {
    if (!actor) return;
    all.delete(actor);
    actor.onRemove();
    if (actor._id > 0) ids.delete(actor._id);
  }

  static findChar(pos: number): Char | null {
    return chars[pos];
  }

  static findById(id: number): Actor | null {
    return ids.get(id) ?? null;
  }

  static all(): Set<Actor> {
    return all;
  }

  static now(): number {
    return now;
  }

  /** Snapshot for saving/inspection. */
  static reset(set: Set<Actor>): void {
    all = set;
  }
}
