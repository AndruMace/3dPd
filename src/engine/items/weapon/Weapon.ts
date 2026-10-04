// Port of items/weapon/Weapon.java.
import { Badges } from '../../Badges';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { Random } from '../../core/Random';
import type { Glowing, Item } from '../Item';
import { KindOfWeapon } from '../KindOfWeapon';
import type { Enchantment } from './Enchantment';
import { randomEnchantment } from './enchantments';

const HITS_TO_KNOW = 20;

export type Imbue = 'NONE' | 'SPEED' | 'ACCURACY';

export abstract class Weapon extends KindOfWeapon {
  STR = 10;
  ACU = 1;
  DLY = 1;
  imbue: Imbue = 'NONE';
  private hitsToKnow = HITS_TO_KNOW;
  protected enchantment: Enchantment | null = null;

  categoryOrder(): number {
    return 0;
  }

  proc(attacker: Char, defender: Char, damage: number): void {
    this.enchantment?.proc(this, attacker, defender, damage);
    if (!this.levelKnown) {
      if (--this.hitsToKnow <= 0) {
        this.levelKnown = true;
        GLog.i(`You are now familiar enough with your ${this.name_()} to identify it. It is ${this.toString()}.`);
        Badges.validateItemLevelAquired(this);
      }
    }
    this.use();
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('unfamiliarity', this.hitsToKnow);
    bundle.put('enchantment', this.enchantment);
    bundle.put('imbue', this.imbue);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    if ((this.hitsToKnow = bundle.getInt('unfamiliarity')) === 0) this.hitsToKnow = HITS_TO_KNOW;
    this.enchantment = bundle.get<Enchantment>('enchantment');
    this.imbue = bundle.getEnum<Imbue>('imbue', 'NONE');
  }

  acuracyFactor(hero: Hero): number {
    let encumbrance = this.STR - hero.STR();
    if (this.isMissileWeapon()) {
      if (hero.heroClass === 'WARRIOR') encumbrance += 3;
      else if (hero.heroClass === 'HUNTRESS') encumbrance -= 2;
    }
    return (
      (encumbrance > 0 ? this.ACU / Math.pow(1.5, encumbrance) : this.ACU) * (this.imbue === 'ACCURACY' ? 1.5 : 1.0)
    );
  }

  speedFactor(hero: Hero): number {
    let encumbrance = this.STR - hero.STR();
    if (this.isMissileWeapon() && hero.heroClass === 'HUNTRESS') encumbrance -= 2;
    return (encumbrance > 0 ? this.DLY * Math.pow(1.2, encumbrance) : this.DLY) * (this.imbue === 'SPEED' ? 0.6 : 1.0);
  }

  damageRoll(hero: Hero): number {
    let damage = super.damageRoll(hero);
    if ((hero.rangedWeapon !== null) === (hero.heroClass === 'HUNTRESS')) {
      const exStr = hero.STR() - this.STR;
      if (exStr > 0) damage += Random.IntRange(0, exStr);
    }
    return damage;
  }

  /** Upgrade, optionally enchanting; an existing enchantment may be lost when upgrading without one. */
  upgradeWeapon(enchant: boolean): Item {
    if (this.enchantment !== null) {
      if (!enchant && Random.Int(this.level()) > 0) {
        GLog.w('Interaction of different types of magic has negated the enchantment on this weapon!');
        this.enchant(null);
      }
    } else if (enchant) {
      this.enchant();
    }
    super.upgradeOnce();
    return this;
  }

  maxDurability(lvl: number = this.level()): number {
    return 5 * (lvl < 16 ? 16 - lvl : 1);
  }

  toString(): string {
    return this.levelKnown ? `${this.isBroken() ? 'broken ' : ''}${super.toString()} :${this.STR}` : super.toString();
  }

  name_(): string {
    return this.enchantment === null ? super.name_() : this.enchantment.name(super.name_());
  }

  random(): Item {
    if (Random.Float() < 0.4) {
      let n = 1;
      if (Random.Int(3) === 0) {
        n++;
        if (Random.Int(3) === 0) n++;
      }
      if (Random.Int(2) === 0) {
        this.upgrade(n);
      } else {
        this.degrade(n);
        this.cursed = true;
      }
    }
    return this;
  }

  enchant(ench?: Enchantment | null): this {
    if (ench !== undefined) {
      this.enchantment = ench;
      return this;
    }
    const oldClass = this.enchantment?.constructor ?? null;
    let e = randomEnchantment();
    while (e.constructor === oldClass) e = randomEnchantment();
    this.enchantment = e;
    return this;
  }

  isEnchanted(): boolean {
    return this.enchantment !== null;
  }

  glowing(): Glowing {
    return this.enchantment ? this.enchantment.glowing() : null;
  }
}
registerClass('Weapon', Weapon);
