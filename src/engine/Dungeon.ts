// Port of the run-wide state in Dungeon.java and Statistics.java. Kept as plain module-level objects (as PD's
// statics were) so ported code can say `Dungeon.hero` / `Dungeon.level`. Only type imports and core utilities
// here, so any module can import it without creating class-initialization cycles.
import type { Hero } from './actors/hero/Hero';
import { classNameOf } from './core/Bundle';
import { Random } from './core/Random';
import type { Item } from './items/Item';
import type { Level } from './levels/Level';
import { LENGTH } from './levels/constants';

export const ResultDescriptions = {
  MOB: (name: string, depth: number) => `Killed by ${name} on level ${depth}`,
  BOSS: (name: string, depth: number) => `Killed by the ${name} on level ${depth}`,
  WAND: (name: string, depth: number) => `Killed by your own ${name} on level ${depth}`,
  GLYPH: (name: string, depth: number) => `Killed by the ${name} on level ${depth}`,
  BOMB: (depth: number) => `Killed by an explosion of a bomb on level ${depth}`,
  TRAP: (name: string, depth: number) => `Killed by discharge of ${name} on level ${depth}`,
  BURNING: (depth: number) => `Burned to death on level ${depth}`,
  HUNGER: (depth: number) => `Starved to death on level ${depth}`,
  POISON: (depth: number) => `Died from poison on level ${depth}`,
  GAS: (depth: number) => `Died from toxic gas on level ${depth}`,
  BLEEDING: (depth: number) => `Bled to death on level ${depth}`,
  OOZE: (depth: number) => `Killed by a caustic ooze on level ${depth}`,
  FALL: (depth: number) => `Fell to death on level ${depth}`,
  WIN: 'Obtained the Amulet of Yendor',
};

export const Statistics = {
  goldCollected: 0,
  deepestFloor: 0,
  enemiesSlain: 0,
  foodEaten: 0,
  potionsCooked: 0,
  piranhasKilled: 0,
  nightHunt: 0,
  ankhsUsed: 0,
  duration: 0,
  qualifiedForNoKilling: false,
  completedWithNoKilling: false,
  amuletObtained: false,

  reset(): void {
    Object.assign(Statistics, {
      goldCollected: 0,
      deepestFloor: 0,
      enemiesSlain: 0,
      foodEaten: 0,
      potionsCooked: 0,
      piranhasKilled: 0,
      nightHunt: 0,
      ankhsUsed: 0,
      duration: 0,
      qualifiedForNoKilling: false,
      amuletObtained: false,
    });
  },
};

interface DungeonState {
  hero: Hero;
  level: Level;
  depth: number;
  gold: number;
  challenges: number;
  nightMode: boolean;
  resultDescription: string;
  /** Story chapters already shown (WndStory ids). */
  chapters: Set<number>;
  /** Items that fell into a chasm, waiting on the level below. */
  droppedItems: Map<number, Item[]>;
  /** Cells the hero can currently see. */
  visible: Uint8Array;
  potionOfStrength: number;
  scrollsOfUpgrade: number;
  scrollsOfEnchantment: number;
  dewVial: boolean;
  /** Source of item ids, so the UI can refer to items stably (not in the original). */
  nextItemId: number;
  bossLevel(depth?: number): boolean;
  shopOnLevel(): boolean;
  isChallenged(mask: number): boolean;
  posNeeded(): boolean;
  souNeeded(): boolean;
  soeNeeded(): boolean;
  dropToChasm(item: Item): void;
  submitRanking(win: boolean): void;
  fail(desc: string): void;
  win(desc: string): void;
}

function chance(quota: number[], number: number): boolean {
  for (let i = 0; i < quota.length; i += 2) {
    const qDepth = quota[i];
    if (Dungeon.depth <= qDepth) {
      const qNumber = quota[i + 1];
      return Random.Float() < (qNumber - number) / (qDepth - Dungeon.depth + 1);
    }
  }
  return false;
}

export const Dungeon: DungeonState = {
  hero: null as unknown as Hero,
  level: null as unknown as Level,
  depth: 0,
  gold: 0,
  challenges: 0,
  nightMode: false,
  resultDescription: '',
  chapters: new Set(),
  droppedItems: new Map(),
  visible: new Uint8Array(LENGTH),
  potionOfStrength: 0,
  scrollsOfUpgrade: 0,
  scrollsOfEnchantment: 0,
  dewVial: true,
  nextItemId: 1,

  bossLevel(depth: number = Dungeon.depth): boolean {
    return depth === 5 || depth === 10 || depth === 15 || depth === 20 || depth === 25;
  },

  shopOnLevel(): boolean {
    return Dungeon.depth === 6 || Dungeon.depth === 11 || Dungeon.depth === 16;
  },

  isChallenged(mask: number): boolean {
    return (Dungeon.challenges & mask) !== 0;
  },

  posNeeded(): boolean {
    return chance([4, 2, 9, 4, 14, 6, 19, 8, 24, 9], Dungeon.potionOfStrength);
  },

  souNeeded(): boolean {
    return chance([5, 3, 10, 6, 15, 9, 20, 12, 25, 13], Dungeon.scrollsOfUpgrade);
  },

  soeNeeded(): boolean {
    return Random.Int(12 * (1 + Dungeon.scrollsOfEnchantment)) < Dungeon.depth;
  },

  dropToChasm(item: Item): void {
    const depth = Dungeon.depth + 1;
    let dropped = Dungeon.droppedItems.get(depth);
    if (!dropped) Dungeon.droppedItems.set(depth, (dropped = []));
    dropped.push(item);
  },

  /** Rankings.submit, installed by Rankings.ts (kept as a hook so this module stays dependency-free). */
  submitRanking: (_win: boolean): void => {},

  fail(desc: string): void {
    Dungeon.resultDescription = desc;
    let ankh = false;
    for (const item of Dungeon.hero.belongings.all()) if (classNameOf(item) === 'Ankh') ankh = true;
    if (!ankh) Dungeon.submitRanking(false);
  },

  win(desc: string): void {
    Dungeon.hero.belongings.identify();
    Dungeon.resultDescription = desc;
    Dungeon.submitRanking(true);
  },
};
