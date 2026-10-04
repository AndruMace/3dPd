// Port of actors/buffs/Buff.java and FlavourBuff.java.
import { registerClass } from '../../core/Bundle';
import { Actor } from '../Actor';
import type { Char } from '../Char';

/** BuffIndicator icon indices (buffs.png / large_buffs.png). */
export const BuffIndicator = {
  NONE: -1,
  MIND_VISION: 0,
  LEVITATION: 1,
  FIRE: 2,
  POISON: 3,
  PARALYSIS: 4,
  HUNGER: 5,
  STARVATION: 6,
  SLOW: 7,
  OOZE: 8,
  AMOK: 9,
  TERROR: 10,
  ROOTS: 11,
  INVISIBLE: 12,
  SHADOWS: 13,
  WEAKNESS: 14,
  FROST: 15,
  BLINDNESS: 16,
  COMBO: 17,
  FURY: 18,
  HEALING: 19,
  ARMOR: 20,
  HEART: 21,
  LIGHT: 22,
  CRIPPLE: 23,
  BARKSKIN: 24,
  IMMUNITY: 25,
  BLEEDING: 26,
  MARK: 27,
  DEFERRED: 28,
  VERTIGO: 29,
  RAGE: 30,
  SACRIFICE: 31,
} as const;

export type BuffClass<T extends Buff = Buff> = new () => T;

export class Buff extends Actor {
  target!: Char;

  attachTo(target: Char): boolean {
    if (target.immunities().has(this.constructor)) return false;
    this.target = target;
    target.add(this);
    return true;
  }

  detach(): void {
    this.target.remove(this);
  }

  protected act(): boolean {
    this.diactivate();
    return true;
  }

  icon(): number {
    return BuffIndicator.NONE;
  }

  /** Buffs recreated by their owning item (ring effects, wand chargers) are not saved, as in PD. */
  isTransient(): boolean {
    return false;
  }

  toString(): string {
    return '';
  }

  static append<T extends Buff>(target: Char, buffClass: BuffClass<T>, duration?: number): T {
    const buff = new buffClass();
    buff.attachTo(target);
    if (duration !== undefined) buff.spend(duration);
    return buff;
  }

  static affect<T extends Buff>(target: Char, buffClass: BuffClass<T>, duration?: number): T {
    const buff = target.buff(buffClass) ?? Buff.append(target, buffClass);
    if (duration !== undefined) buff.spend(duration);
    return buff;
  }

  static prolong<T extends Buff>(target: Char, buffClass: BuffClass<T>, duration: number): T {
    const buff = Buff.affect(target, buffClass);
    buff.postpone(duration);
    return buff;
  }

  static detach(buff: Buff | null): void;
  static detach(target: Char, cl: BuffClass): void;
  static detach(a: Buff | Char | null, cl?: BuffClass): void {
    if (a === null) return;
    if (a instanceof Buff) a.detach();
    else Buff.detach(a.buff(cl!));
  }
}

export class FlavourBuff extends Buff {
  protected act(): boolean {
    this.detach();
    return true;
  }
}

registerClass('Buff', Buff);
registerClass('FlavourBuff', FlavourBuff);
