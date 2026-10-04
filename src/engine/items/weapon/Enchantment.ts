// Port of Weapon.Enchantment (base). Concrete enchantments live in enchantments.ts.
import type { Char } from '../../actors/Char';
import type { Bundlable, Bundle } from '../../core/Bundle';
import type { Glowing } from '../Item';
import type { Weapon } from './Weapon';

export abstract class Enchantment implements Bundlable {
  abstract proc(weapon: Weapon, attacker: Char, defender: Char, damage: number): boolean;

  name(weaponName: string): string {
    return weaponName;
  }

  restoreFromBundle(_bundle: Bundle): void {}
  storeInBundle(_bundle: Bundle): void {}

  glowing(): Glowing {
    return 0xffffff;
  }
}
