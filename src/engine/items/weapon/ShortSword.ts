// Port of items/weapon/melee/ShortSword.java (reforge action: M2).
import { MeleeWeapon } from './MeleeWeapon';

export class ShortSword extends MeleeWeapon {
  constructor() {
    super(1, 1, 1);
    this.name = 'short sword';
    this.image = 2; // ItemSpriteSheet.SHORT_SWORD
    this.STR = 11;
  }

  protected max0(): number {
    return 12;
  }
}
