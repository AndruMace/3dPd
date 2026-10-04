// WaterOfTransmutation.affectItem: what a Well of Transmutation turns an item into.
import { registerService } from '../core/lazy';
import { Generator } from './Generator';
import type { Item } from './Item';
import { Potion } from './potions/Potion';
import { PotionOfMight, PotionOfStrength } from './potions/potions';
import { Ring } from './rings/rings';
import { Scroll } from './scrolls/Scroll';
import { ScrollOfEnchantment, ScrollOfUpgrade } from './scrolls/scrolls';
import { Wand } from './wands/Wand';
import {
  BattleAxe,
  Dagger,
  Glaive,
  Knuckles,
  Longsword,
  Mace,
  MeleeWeapon,
  Quarterstaff,
  Spear,
  Sword,
  WarHammer,
} from './weapon/melee';
import { Seed } from '../plants/plants';

const WEAPON_PAIRS: [new () => MeleeWeapon, new () => MeleeWeapon][] = [
  [Knuckles, Dagger],
  [Spear, Quarterstaff],
  [Sword, Mace],
  [Longsword, BattleAxe],
  [Glaive, WarHammer],
];

function changeWeapon(w: MeleeWeapon): MeleeWeapon | null {
  let n: MeleeWeapon | null = null;
  for (const [a, b] of WEAPON_PAIRS) {
    if (w.constructor === a) n = new b();
    else if (w.constructor === b) n = new a();
    if (n) break;
  }
  if (!n) return null;
  const level = w.level();
  if (level > 0) n.upgrade(level);
  else if (level < 0) n.degrade(-level);
  if (w.isEnchanted()) n.enchant();
  n.levelKnown = w.levelKnown;
  n.cursedKnown = w.cursedKnown;
  n.cursed = w.cursed;
  return n;
}

function changeOf<T extends Item>(item: T, cat: 'RING' | 'WAND' | 'SEED' | 'SCROLL' | 'POTION'): Item {
  let n: Item;
  do {
    n = Generator.random(cat);
  } while (n.sameKind(item));
  return n;
}

export const Transmutation = {
  transmute(item: Item): Item | null {
    if (item instanceof MeleeWeapon) return changeWeapon(item);
    if (item instanceof Scroll) {
      if (item instanceof ScrollOfUpgrade) return new ScrollOfEnchantment();
      if (item instanceof ScrollOfEnchantment) return new ScrollOfUpgrade();
      return changeOf(item, 'SCROLL');
    }
    if (item instanceof Potion) {
      if (item instanceof PotionOfMight) return new PotionOfStrength();
      if (item instanceof PotionOfStrength) return new PotionOfMight();
      return changeOf(item, 'POTION');
    }
    if (item instanceof Ring) {
      const n = changeOf(item, 'RING') as Ring;
      n.setLevel(0);
      const level = item.level();
      if (level > 0) n.upgrade(level);
      else if (level < 0) n.degrade(-level);
      n.levelKnown = item.levelKnown;
      n.cursedKnown = item.cursedKnown;
      n.cursed = item.cursed;
      return n;
    }
    if (item instanceof Wand) {
      const n = changeOf(item, 'WAND') as Wand;
      n.setLevel(0);
      n.upgrade(item.level());
      n.levelKnown = item.levelKnown;
      n.cursedKnown = item.cursedKnown;
      n.cursed = item.cursed;
      return n;
    }
    if (item instanceof Seed) return changeOf(item, 'SEED');
    return null;
  },
};

registerService('Transmutation', Transmutation);
