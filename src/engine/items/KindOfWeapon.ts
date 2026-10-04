// Port of items/KindOfWeapon.java.
import type { Char } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import { GLog } from '../core/events';
import { Random } from '../core/Random';
import { EquipableItem } from './EquipableItem';

export abstract class KindOfWeapon extends EquipableItem {
  protected static readonly TIME_TO_EQUIP = 1;

  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    actions.push(this.isEquipped(hero) ? EquipableItem.AC_UNEQUIP : EquipableItem.AC_EQUIP);
    return actions;
  }

  isEquipped(hero: Hero): boolean {
    return hero.belongings.weapon === this;
  }

  doEquip(hero: Hero): boolean {
    this.detachAll(hero.belongings.backpack);
    if (hero.belongings.weapon === null || hero.belongings.weapon.doUnequip(hero, true)) {
      hero.belongings.weapon = this;
      this.activate(hero);
      this.cursedKnown = true;
      if (this.cursed) {
        EquipableItem.equipCursed(hero);
        GLog.n(`you wince as your grip involuntarily tightens around your ${this.name_()}`);
      }
      hero.spendAndNext(KindOfWeapon.TIME_TO_EQUIP);
      return true;
    }
    this.collect(hero.belongings.backpack);
    return false;
  }

  doUnequip(hero: Hero, collect: boolean, single = true): boolean {
    if (super.doUnequip(hero, collect, single)) {
      hero.belongings.weapon = null;
      return true;
    }
    return false;
  }

  activate(_hero: Hero): void {}

  abstract min(): number;
  abstract max(): number;

  damageRoll(_owner: Hero): number {
    return Random.NormalIntRange(this.min(), this.max());
  }

  acuracyFactor(_hero: Hero): number {
    return 1;
  }

  speedFactor(_hero: Hero): number {
    return 1;
  }

  proc(_attacker: Char, _defender: Char, _damage: number): void {}
}
