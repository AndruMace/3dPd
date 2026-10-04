// Ports of KindOfWeapon / Weapon / MeleeWeapon damage and accuracy rules (enchantments, durability: M2).
import { Random } from '../../core/Random';
import type { Hero } from '../../actors/hero/Hero';
import { Item } from '../Item';

export abstract class MeleeWeapon extends Item {
  STR = 10;
  ACU = 1;
  DLY = 1;

  constructor(
    protected readonly tier: number,
    acu: number,
    dly: number,
  ) {
    super();
    this.ACU = acu;
    this.DLY = dly;
    this.STR = this.typicalSTR();
  }

  protected min0(): number {
    return this.tier;
  }

  protected max0(): number {
    return Math.trunc(((this.tier * this.tier - this.tier + 10) / this.ACU) * this.DLY);
  }

  min(): number {
    return this.min0() + this.level();
  }

  max(): number {
    return this.max0() + this.level() * this.tier;
  }

  typicalSTR(): number {
    return 8 + this.tier * 2;
  }

  damageRoll(hero: Hero): number {
    let damage = Random.NormalIntRange(this.min(), this.max());
    const exStr = hero.STR() - this.STR;
    if (exStr > 0 && hero.heroClass === 'WARRIOR' && hero.belongings.weapon === this) {
      damage += Random.IntRange(0, exStr);
    }
    return damage;
  }

  acuracyFactor(hero: Hero): number {
    const encumbrance = this.STR - hero.STR();
    return encumbrance > 0 ? this.ACU / Math.pow(1.5, encumbrance) : this.ACU;
  }

  speedFactor(hero: Hero): number {
    const encumbrance = this.STR - hero.STR();
    return encumbrance > 0 ? this.DLY * Math.pow(1.2, encumbrance) : this.DLY;
  }
}
