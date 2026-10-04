// Ports of the concrete buffs in actors/buffs/. Classes from higher layers (items, blobs, mobs) are reached
// through `lazy` to keep module loading acyclic.
import { Assets } from '../../../content/generated/Assets';
import { Dungeon, ResultDescriptions } from '../../Dungeon';
import type { Blob } from '../../actors/blobs/Blob';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { isA, lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import type { Item } from '../../items/Item';
import { observe } from '../../observe';
import { TICK } from '../Actor';
import type { Char } from '../Char';
import type { Hero } from '../hero/Hero';
import { Buff, BuffIndicator, FlavourBuff } from './Buff';

const isHero = (ch: Char): ch is Hero => ch === Dungeon.hero;

/** RingOfElements.Resistance shortens elemental effects. */
function resistanceFactor(ch: Char): number {
  const Resistance = lazy<abstract new () => Buff & { durationFactor(): number }>('RingOfElements.Resistance');
  const r = ch.buff(Resistance);
  return r ? r.durationFactor() : 1;
}

function itemClass<T>(name: string): new () => T {
  return lazy<new () => T>(name);
}

export class Hunger extends Buff {
  private static readonly STEP = 10;
  static readonly HUNGRY = 260;
  static readonly STARVING = 360;

  private level = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('level', this.level);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.level = bundle.getFloat('level');
  }

  protected act(): boolean {
    if (this.target.isAlive()) {
      const hero = this.target as Hero;
      if (this.isStarving()) {
        if (Random.Float() < 0.3 && (this.target.HP > 1 || !this.target.paralysed)) {
          GLog.n('You are starving!');
          hero.damage(1, this);
          hero.interrupt();
        }
      } else {
        let bonus = 0;
        for (const buff of this.target.buffsOf(
          lazy<abstract new () => Buff & { level: number }>('RingOfSatiety.Satiety'),
        )) {
          bonus += buff.level;
        }
        const newLevel = this.level + Hunger.STEP - bonus;
        if (newLevel >= Hunger.STARVING) {
          GLog.n('You are starving!');
          hero.interrupt();
        } else if (newLevel >= Hunger.HUNGRY && this.level < Hunger.HUNGRY) {
          GLog.w('You are hungry.');
        }
        this.level = newLevel;
      }
      const step = hero.heroClass === 'ROGUE' ? Hunger.STEP * 1.2 : Hunger.STEP;
      this.spend(this.target.buff(Shadows) === null ? step : step * 1.5);
    } else {
      this.diactivate();
    }
    return true;
  }

  satisfy(energy: number): void {
    this.level -= energy;
    if (this.level < 0) this.level = 0;
    else if (this.level > Hunger.STARVING) this.level = Hunger.STARVING;
  }

  isStarving(): boolean {
    return this.level >= Hunger.STARVING;
  }

  get hungerLevel(): number {
    return this.level;
  }

  icon(): number {
    if (this.level < Hunger.HUNGRY) return BuffIndicator.NONE;
    if (this.level < Hunger.STARVING) return BuffIndicator.HUNGER;
    return BuffIndicator.STARVATION;
  }

  toString(): string {
    return this.level < Hunger.STARVING ? 'Hungry' : 'Starving';
  }

  onDeath(): void {
    Dungeon.fail(ResultDescriptions.HUNGER(Dungeon.depth));
    GLog.n('You starved to death...');
  }
}

export class Regeneration extends Buff {
  private static readonly REGENERATION_DELAY = 10;

  protected act(): boolean {
    if (this.target.isAlive()) {
      if (this.target.HP < this.target.HT && !(this.target as Hero).isStarving()) this.target.heal(1);
      let bonus = 0;
      for (const buff of this.target.buffsOf(
        lazy<abstract new () => Buff & { level: number }>('RingOfMending.Rejuvenation'),
      )) {
        bonus += buff.level;
      }
      this.spend(Regeneration.REGENERATION_DELAY / Math.pow(1.2, bonus));
    } else {
      this.diactivate();
    }
    return true;
  }
}

export class Poison extends Buff {
  protected left = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('left', this.left);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.left = bundle.getFloat('left');
  }

  set(duration: number): void {
    this.left = duration;
  }

  icon(): number {
    return BuffIndicator.POISON;
  }

  toString(): string {
    return 'Poisoned';
  }

  protected act(): boolean {
    if (this.target.isAlive()) {
      this.target.damage(Math.trunc(this.left / 3) + 1, this);
      this.spend(TICK);
      if ((this.left -= TICK) <= 0) this.detach();
    } else {
      this.detach();
    }
    return true;
  }

  static durationFactor(ch: Char): number {
    return resistanceFactor(ch);
  }

  onDeath(): void {
    Dungeon.fail(ResultDescriptions.POISON(Dungeon.depth));
    GLog.n('You died from poison...');
  }
}

export class Burning extends Buff {
  private static readonly DURATION = 8;
  private left = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('left', this.left);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.left = bundle.getFloat('left');
  }

  protected act(): boolean {
    const target = this.target;
    if (target.isAlive()) {
      if (isHero(target)) Buff.prolong(target, Light, TICK * 1.01);
      target.damage(Random.Int(1, 5), this);

      if (isHero(target)) {
        let item: Item | null = target.belongings.randomUnequipped();
        if (item && isA(item, 'Scroll')) {
          item = item.detach(target.belongings.backpack)!;
          GLog.w(`${item.toString()} burns up!`);
          burnFX(target.pos);
        } else if (item && isA(item, 'MysteryMeat')) {
          item = item.detach(target.belongings.backpack)!;
          const steak = new (itemClass<Item>('ChargrilledMeat'))();
          if (!steak.collect(target.belongings.backpack)) Dungeon.level.drop(steak, target.pos).dropFX(target.pos);
          GLog.w(`${item.toString()} burns up!`);
          burnFX(target.pos);
        }
      } else if (isA(target, 'Thief')) {
        const thief = target as Char & { item: Item | null };
        if (thief.item && isA(thief.item, 'Scroll')) {
          thief.item = null;
          Fx.burst('ElmoParticle', { id: target.id() }, 6);
        }
      }
    } else {
      this.detach();
    }

    if (Dungeon.level.flamable[target.pos]) {
      const FireBlob = lazy<typeof Blob>('Fire');
      Dungeon.level.addBlob(FireBlob.seed(target.pos, 4, FireBlob));
    }

    this.spend(TICK);
    this.left -= TICK;
    if (
      this.left <= 0 ||
      Random.Float() > (2 + target.HP / target.HT) / 3 ||
      (Dungeon.level.water[target.pos] && !target.flying)
    ) {
      this.detach();
    }
    return true;
  }

  reignite(ch: Char): void {
    this.left = Burning.duration(ch);
  }

  icon(): number {
    return BuffIndicator.FIRE;
  }

  toString(): string {
    return 'Burning';
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Burning.DURATION;
  }

  onDeath(): void {
    Dungeon.fail(ResultDescriptions.BURNING(Dungeon.depth));
    GLog.n('You burned to death...');
  }
}

export function burnFX(pos: number): void {
  Fx.burst('ElmoParticle', { pos }, 6);
  Sample.play(Assets.SND_BURNING, pos);
}

export class Paralysis extends FlavourBuff {
  private static readonly DURATION = 10;

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      target.paralysed = true;
      return true;
    }
    return false;
  }

  detach(): void {
    super.detach();
    Paralysis.unfreeze(this.target);
  }

  icon(): number {
    return BuffIndicator.PARALYSIS;
  }

  toString(): string {
    return 'Paralysed';
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Paralysis.DURATION;
  }

  static unfreeze(ch: Char): void {
    if (ch.buff(Paralysis) === null && ch.buff(Frost) === null) ch.paralysed = false;
  }
}

export class Roots extends FlavourBuff {
  attachTo(target: Char): boolean {
    if (!target.flying && super.attachTo(target)) {
      target.rooted = true;
      return true;
    }
    return false;
  }

  detach(): void {
    this.target.rooted = false;
    super.detach();
  }

  icon(): number {
    return BuffIndicator.ROOTS;
  }

  toString(): string {
    return 'Rooted';
  }
}

export class Cripple extends FlavourBuff {
  static readonly DURATION = 10;

  icon(): number {
    return BuffIndicator.CRIPPLE;
  }

  toString(): string {
    return 'Crippled';
  }
}

export class Bleeding extends Buff {
  protected level = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('level', this.level);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.level = bundle.getInt('level');
  }

  set(level: number): void {
    this.level = level;
  }

  icon(): number {
    return BuffIndicator.BLEEDING;
  }

  toString(): string {
    return 'Bleeding';
  }

  protected act(): boolean {
    const target = this.target;
    if (target.isAlive()) {
      if ((this.level = Random.Int(Math.trunc(this.level / 2), this.level)) > 0) {
        target.damage(this.level, this);
        if (Dungeon.visible[target.pos]) Fx.blood(target.id(), Math.min(Math.trunc((10 * this.level) / target.HT), 10));
        if (target === Dungeon.hero && !target.isAlive()) {
          Dungeon.fail(ResultDescriptions.BLEEDING(Dungeon.depth));
          GLog.n('You bled to death...');
        }
        this.spend(TICK);
      } else {
        this.detach();
      }
    } else {
      this.detach();
    }
    return true;
  }
}

export class Ooze extends Buff {
  damageValue = 1;

  icon(): number {
    return BuffIndicator.OOZE;
  }

  toString(): string {
    return 'Caustic ooze';
  }

  protected act(): boolean {
    const target = this.target;
    if (target.isAlive()) {
      target.damage(this.damageValue, this);
      if (!target.isAlive() && target === Dungeon.hero) {
        Dungeon.fail(ResultDescriptions.OOZE(Dungeon.depth));
        GLog.n(`${this.toString()} killed you...`);
      }
      this.spend(TICK);
    }
    if (Dungeon.level.water[target.pos]) this.detach();
    return true;
  }
}

export class Invisibility extends FlavourBuff {
  static readonly DURATION = 15;

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      target.invisible++;
      return true;
    }
    return false;
  }

  detach(): void {
    this.target.invisible--;
    super.detach();
  }

  icon(): number {
    return BuffIndicator.INVISIBLE;
  }

  toString(): string {
    return 'Invisible';
  }

  static dispel(): void {
    const buff = Dungeon.hero.buff(Invisibility);
    if (buff !== null && Dungeon.hero.visibleEnemyCount() > 0) buff.detach();
  }
}

export class Levitation extends FlavourBuff {
  static readonly DURATION = 20;

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      target.flying = true;
      Buff.detach(target, Roots);
      return true;
    }
    return false;
  }

  detach(): void {
    this.target.flying = false;
    Dungeon.level.press(this.target.pos, this.target);
    super.detach();
  }

  icon(): number {
    return BuffIndicator.LEVITATION;
  }

  toString(): string {
    return 'Levitating';
  }
}

export class MindVision extends FlavourBuff {
  static readonly DURATION = 20;
  distance = 2;

  icon(): number {
    return BuffIndicator.MIND_VISION;
  }

  toString(): string {
    return 'Mind vision';
  }

  detach(): void {
    super.detach();
    observe();
  }
}

export class Light extends FlavourBuff {
  static readonly DURATION = 250;
  static readonly DISTANCE = 4;

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      if (Dungeon.level) {
        target.viewDistance = Math.max(Dungeon.level.viewDistance, Light.DISTANCE);
        observe();
      }
      target.setState('ILLUMINATED', true);
      return true;
    }
    return false;
  }

  detach(): void {
    this.target.viewDistance = Dungeon.level.viewDistance;
    observe();
    this.target.setState('ILLUMINATED', false);
    super.detach();
  }

  icon(): number {
    return BuffIndicator.LIGHT;
  }

  toString(): string {
    return 'Illuminated';
  }
}

export class Barkskin extends Buff {
  private levelValue = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('level', this.levelValue);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.levelValue = bundle.getInt('level');
  }

  protected act(): boolean {
    if (this.target.isAlive()) {
      this.spend(TICK);
      if (--this.levelValue <= 0) this.detach();
    } else {
      this.detach();
    }
    return true;
  }

  level(): number {
    return this.levelValue;
  }

  setLevel(value: number): void {
    if (this.levelValue < value) this.levelValue = value;
  }

  icon(): number {
    return BuffIndicator.BARKSKIN;
  }

  toString(): string {
    return 'Barkskin';
  }
}

export class Shadows extends Invisibility {
  protected left = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('left', this.left);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.left = bundle.getFloat('left');
  }

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      Sample.play(Assets.SND_MELD);
      observe();
      return true;
    }
    return false;
  }

  detach(): void {
    super.detach();
    observe();
  }

  protected act(): boolean {
    if (this.target.isAlive()) {
      this.spend(TICK * 2);
      if (--this.left <= 0 || Dungeon.hero.visibleEnemyCount() > 0) this.detach();
    } else {
      this.detach();
    }
    return true;
  }

  prolong(): void {
    this.left = 2;
  }

  icon(): number {
    return BuffIndicator.SHADOWS;
  }

  toString(): string {
    return 'Shadowmelded';
  }
}

export class Amok extends FlavourBuff {
  icon(): number {
    return BuffIndicator.AMOK;
  }

  toString(): string {
    return 'Amok';
  }
}

export class Awareness extends FlavourBuff {
  static readonly DURATION = 2;

  detach(): void {
    super.detach();
    observe();
  }
}

export class Blindness extends FlavourBuff {
  detach(): void {
    super.detach();
    observe();
  }

  icon(): number {
    return BuffIndicator.BLINDNESS;
  }

  toString(): string {
    return 'Blinded';
  }
}

export class Charm extends FlavourBuff {
  object = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('object', this.object);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.object = bundle.getInt('object');
  }

  icon(): number {
    return BuffIndicator.HEART;
  }

  toString(): string {
    return 'Charmed';
  }

  static durationFactor(ch: Char): number {
    return resistanceFactor(ch);
  }
}

export class Combo extends Buff {
  count = 0;

  icon(): number {
    return BuffIndicator.COMBO;
  }

  toString(): string {
    return 'Combo';
  }

  hit(_enemy: Char, damage: number): number {
    this.count++;
    if (this.count >= 3) {
      GLog.p(`${this.count} hit combo!`);
      this.postpone(1.41 - this.count / 10);
      return Math.trunc((damage * (this.count - 2)) / 5);
    }
    this.postpone(1.1);
    return 0;
  }

  protected act(): boolean {
    this.detach();
    return true;
  }
}

export class Frost extends FlavourBuff {
  private static readonly DURATION = 5;

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      target.paralysed = true;
      Buff.detach(target, Burning);
      if (isHero(target)) {
        let item = target.belongings.randomUnequipped();
        if (item && isA(item, 'MysteryMeat')) {
          item = item.detach(target.belongings.backpack)!;
          const carpaccio = new (itemClass<Item>('FrozenCarpaccio'))();
          if (!carpaccio.collect(target.belongings.backpack))
            Dungeon.level.drop(carpaccio, target.pos).dropFX(target.pos);
        }
      }
      return true;
    }
    return false;
  }

  detach(): void {
    super.detach();
    Paralysis.unfreeze(this.target);
  }

  icon(): number {
    return BuffIndicator.FROST;
  }

  toString(): string {
    return 'Frozen';
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Frost.DURATION;
  }
}

export class Fury extends Buff {
  static readonly LEVEL = 0.4;

  protected act(): boolean {
    if (this.target.HP > this.target.HT * Fury.LEVEL) this.detach();
    this.spend(TICK);
    return true;
  }

  icon(): number {
    return BuffIndicator.FURY;
  }

  toString(): string {
    return 'Fury';
  }
}

export class GasesImmunity extends FlavourBuff {
  static readonly DURATION = 5;

  icon(): number {
    return BuffIndicator.IMMUNITY;
  }

  toString(): string {
    return 'Immune to gases';
  }

  /** Paralysis, ToxicGas and Vertigo (filled once blobs are loaded). */
  static readonly IMMUNITIES = new Set<unknown>();
}

export class Rage extends FlavourBuff {
  icon(): number {
    return BuffIndicator.RAGE;
  }

  toString(): string {
    return 'Blinded with rage';
  }
}

export class Sleep extends FlavourBuff {
  static readonly SWS = 1.5;
}

export class Slow extends FlavourBuff {
  private static readonly DURATION = 10;

  icon(): number {
    return BuffIndicator.SLOW;
  }

  toString(): string {
    return 'Slowed';
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Slow.DURATION;
  }
}

export class SnipersMark extends FlavourBuff {
  object = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('object', this.object);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.object = bundle.getInt('object');
  }

  icon(): number {
    return BuffIndicator.MARK;
  }

  toString(): string {
    return 'Zeroed in';
  }
}

export class Speed extends FlavourBuff {
  static readonly DURATION = 10;
}

export class Terror extends FlavourBuff {
  static readonly DURATION = 10;
  object = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('object', this.object);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.object = bundle.getInt('object');
  }

  icon(): number {
    return BuffIndicator.TERROR;
  }

  toString(): string {
    return 'Terror';
  }

  static recover(target: Char): void {
    const terror = target.buff(Terror);
    if (terror !== null && terror.cooldown() < Terror.DURATION) target.remove(terror);
  }
}

export class Vertigo extends FlavourBuff {
  static readonly DURATION = 10;

  icon(): number {
    return BuffIndicator.VERTIGO;
  }

  toString(): string {
    return 'Vertigo';
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Vertigo.DURATION;
  }
}

export class Weakness extends FlavourBuff {
  private static readonly DURATION = 40;

  icon(): number {
    return BuffIndicator.WEAKNESS;
  }

  toString(): string {
    return 'Weakened';
  }

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      const hero = target as Hero;
      hero.weakened = true;
      hero.belongings.discharge();
      return true;
    }
    return false;
  }

  detach(): void {
    super.detach();
    (this.target as Hero).weakened = false;
  }

  static duration(ch: Char): number {
    return resistanceFactor(ch) * Weakness.DURATION;
  }
}

GasesImmunity.IMMUNITIES.add(Paralysis);
GasesImmunity.IMMUNITIES.add(Vertigo);

for (const [name, cls] of Object.entries({
  Hunger,
  Regeneration,
  Poison,
  Burning,
  Paralysis,
  Roots,
  Cripple,
  Bleeding,
  Ooze,
  Invisibility,
  Levitation,
  MindVision,
  Light,
  Barkskin,
  Shadows,
  Amok,
  Awareness,
  Blindness,
  Charm,
  Combo,
  Frost,
  Fury,
  GasesImmunity,
  Rage,
  Sleep,
  Slow,
  SnipersMark,
  Speed,
  Terror,
  Vertigo,
  Weakness,
})) {
  registerClass(name, cls);
}
