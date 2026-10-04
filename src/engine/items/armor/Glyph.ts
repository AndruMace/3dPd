// Port of Armor.Glyph (base). Concrete glyphs live in glyphs.ts.
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import type { Char } from '../../actors/Char';
import type { Bundlable, Bundle } from '../../core/Bundle';
import type { Glowing } from '../Item';
import type { Armor } from './Armor';

export abstract class Glyph implements Bundlable {
  abstract proc(armor: Armor, attacker: Char, defender: Char, damage: number): number;

  name(armorName: string): string {
    return armorName;
  }

  restoreFromBundle(_bundle: Bundle): void {}
  storeInBundle(_bundle: Bundle): void {}

  glowing(): Glowing {
    return 0xffffff;
  }

  checkOwner(owner: Char): boolean {
    if (!owner.isAlive() && owner === Dungeon.hero) {
      Dungeon.hero.killerGlyph = this;
      Badges.validateDeathFromGlyph();
      return true;
    }
    return false;
  }
}
