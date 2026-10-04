// Port of items/EquipableItem.java.
import { Assets } from '../../content/generated/Assets';
import { Dungeon } from '../Dungeon';
import type { Hero } from '../actors/hero/Hero';
import { GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { Item } from './Item';

export abstract class EquipableItem extends Item {
  static readonly AC_EQUIP = 'EQUIP';
  static readonly AC_UNEQUIP = 'UNEQUIP';

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === EquipableItem.AC_EQUIP) this.doEquip(hero);
    else if (action === EquipableItem.AC_UNEQUIP) this.doUnequip(hero, true);
    else super.execute(hero, action);
  }

  doDrop(hero: Hero): void {
    if (!this.isEquipped(hero) || this.doUnequip(hero, false, false)) super.doDrop(hero);
  }

  cast(user: Hero, dst: number): void {
    if (this.isEquipped(user)) {
      if (this.quantity === 1 && !this.doUnequip(user, false, false)) return;
    }
    super.cast(user, dst);
  }

  protected static equipCursed(hero: Hero): void {
    Fx.burst('ShadowParticle.CURSE', { id: hero.id() }, 6);
    Sample.play(Assets.SND_CURSED);
  }

  protected time2equip(_hero: Hero): number {
    return 1;
  }

  abstract doEquip(hero: Hero): boolean;

  doUnequip(hero: Hero, collect: boolean, single = true): boolean {
    if (this.cursed) {
      GLog.w(`You can't remove cursed ${this.name_()}!`);
      return false;
    }
    if (single) hero.spendAndNext(this.time2equip(hero));
    else hero.spend(this.time2equip(hero));
    if (collect && !this.collect(hero.belongings.backpack)) Dungeon.level.drop(this, hero.pos);
    return true;
  }
}
