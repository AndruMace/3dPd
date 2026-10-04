// Port of items/Generator.java: random item drops by category, with category weights that halve each time a
// category is rolled (reset per level).
import { Dungeon } from '../Dungeon';
import { STARTING_STR } from '../actors/hero/constants';
import { registerService } from '../core/lazy';
import { Random } from '../core/Random';
import * as Armors from './armor/Armor';
import { Food, MysteryMeat, Pasty } from './food';
import type { Item } from './Item';
import { Bomb, Gold, Honeypot } from './misc';
import * as P from './potions/potions';
import * as R from './rings/rings';
import * as S from './scrolls/scrolls';
import * as Seeds from '../plants/plants';
import * as W from './wands/wands';
import * as Melee from './weapon/melee';
import * as Missiles from './weapon/missiles';
import type { Weapon } from './weapon/Weapon';
import type { Armor } from './armor/Armor';

export type Category = 'WEAPON' | 'ARMOR' | 'POTION' | 'SCROLL' | 'WAND' | 'RING' | 'SEED' | 'FOOD' | 'GOLD' | 'MISC';

interface CategoryDef {
  prob: number;
  classes: (new () => Item)[];
  probs: number[];
}

const CATEGORIES: Record<Category, CategoryDef> = {
  WEAPON: {
    prob: 15,
    classes: [
      Melee.Dagger,
      Melee.Knuckles,
      Melee.Quarterstaff,
      Melee.Spear,
      Melee.Mace,
      Melee.Sword,
      Melee.Longsword,
      Melee.BattleAxe,
      Melee.WarHammer,
      Melee.Glaive,
      Melee.ShortSword,
      Missiles.Dart,
      Missiles.Javelin,
      Missiles.IncendiaryDart,
      Missiles.CurareDart,
      Missiles.Shuriken,
      Missiles.Boomerang,
      Missiles.Tamahawk,
    ],
    probs: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1, 1, 1, 1, 0, 1],
  },
  ARMOR: {
    prob: 10,
    classes: [Armors.ClothArmor, Armors.LeatherArmor, Armors.MailArmor, Armors.ScaleArmor, Armors.PlateArmor],
    probs: [1, 1, 1, 1, 1],
  },
  POTION: {
    prob: 50,
    classes: [
      P.PotionOfHealing,
      P.PotionOfExperience,
      P.PotionOfToxicGas,
      P.PotionOfParalyticGas,
      P.PotionOfLiquidFlame,
      P.PotionOfLevitation,
      P.PotionOfStrength,
      P.PotionOfMindVision,
      P.PotionOfPurity,
      P.PotionOfInvisibility,
      P.PotionOfMight,
      P.PotionOfFrost,
    ],
    probs: [45, 4, 15, 10, 15, 10, 0, 20, 12, 10, 0, 10],
  },
  SCROLL: {
    prob: 40,
    classes: [
      S.ScrollOfIdentify,
      S.ScrollOfTeleportation,
      S.ScrollOfRemoveCurse,
      S.ScrollOfRecharging,
      S.ScrollOfMagicMapping,
      S.ScrollOfChallenge,
      S.ScrollOfTerror,
      S.ScrollOfLullaby,
      S.ScrollOfPsionicBlast,
      S.ScrollOfMirrorImage,
      S.ScrollOfUpgrade,
      S.ScrollOfEnchantment,
    ],
    probs: [30, 10, 15, 10, 15, 12, 8, 8, 4, 6, 0, 1],
  },
  WAND: {
    prob: 4,
    classes: [
      W.WandOfTeleportation,
      W.WandOfSlowness,
      W.WandOfFirebolt,
      W.WandOfRegrowth,
      W.WandOfPoison,
      W.WandOfBlink,
      W.WandOfLightning,
      W.WandOfAmok,
      W.WandOfReach,
      W.WandOfFlock,
      W.WandOfMagicMissile,
      W.WandOfDisintegration,
      W.WandOfAvalanche,
    ],
    probs: [10, 10, 15, 6, 10, 11, 15, 10, 6, 10, 0, 5, 5],
  },
  RING: {
    prob: 2,
    classes: [
      R.RingOfMending,
      R.RingOfDetection,
      R.RingOfShadows,
      R.RingOfPower,
      R.RingOfHerbalism,
      R.RingOfAccuracy,
      R.RingOfEvasion,
      R.RingOfSatiety,
      R.RingOfHaste,
      R.RingOfElements,
      R.RingOfHaggler,
      R.RingOfThorns,
    ],
    probs: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
  },
  SEED: {
    prob: 5,
    classes: [
      Seeds.FirebloomSeed,
      Seeds.IcecapSeed,
      Seeds.SorrowmossSeed,
      Seeds.DreamweedSeed,
      Seeds.SungrassSeed,
      Seeds.EarthrootSeed,
      Seeds.FadeleafSeed,
      Seeds.RotberrySeed,
    ],
    probs: [1, 1, 1, 1, 1, 1, 1, 0],
  },
  FOOD: { prob: 0, classes: [Food, Pasty, MysteryMeat], probs: [4, 1, 0] },
  GOLD: { prob: 50, classes: [Gold], probs: [1] },
  MISC: { prob: 5, classes: [Bomb, Honeypot], probs: [2, 1] },
};

const ORDER: Category[] = ['WEAPON', 'ARMOR', 'POTION', 'SCROLL', 'WAND', 'RING', 'SEED', 'FOOD', 'GOLD', 'MISC'];
const categoryProbs = new Map<Category, number>();

export const Generator = {
  reset(): void {
    for (const cat of ORDER) categoryProbs.set(cat, CATEGORIES[cat].prob);
  },

  random(cat?: Category): Item {
    if (categoryProbs.size === 0) Generator.reset();
    if (cat === undefined) cat = Random.chancesMap(categoryProbs)!;
    categoryProbs.set(cat, categoryProbs.get(cat)! / 2);
    switch (cat) {
      case 'ARMOR':
        return Generator.randomArmor();
      case 'WEAPON':
        return Generator.randomWeapon();
      default: {
        const def = CATEGORIES[cat];
        return new def.classes[Random.chances(def.probs)]().random();
      }
    }
  },

  randomOf<T extends Item>(cl: new () => T): Item {
    return new cl().random();
  },

  randomArmor(): Armor {
    const curStr = STARTING_STR + Dungeon.potionOfStrength;
    const def = CATEGORIES.ARMOR;
    const a1 = new def.classes[Random.chances(def.probs)]() as Armor;
    const a2 = new def.classes[Random.chances(def.probs)]() as Armor;
    a1.random();
    a2.random();
    return Math.abs(curStr - a1.STR) < Math.abs(curStr - a2.STR) ? a1 : a2;
  },

  randomWeapon(): Weapon {
    const curStr = STARTING_STR + Dungeon.potionOfStrength;
    const def = CATEGORIES.WEAPON;
    const w1 = new def.classes[Random.chances(def.probs)]() as Weapon;
    const w2 = new def.classes[Random.chances(def.probs)]() as Weapon;
    w1.random();
    w2.random();
    return Math.abs(curStr - w1.STR) < Math.abs(curStr - w2.STR) ? w1 : w2;
  },
};

registerService('Generator', Generator);
