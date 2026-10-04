// Port of the run-wide state in Dungeon.java. Kept as a plain module-level object (as PD's statics were) so
// ported code can say `Dungeon.hero` / `Dungeon.level`. Only type imports here, so any module can import it
// without creating class-initialization cycles.
import type { Hero } from './actors/hero/Hero';
import type { Level } from './levels/Level';
import { LENGTH } from './levels/constants';

interface DungeonState {
  hero: Hero;
  level: Level;
  depth: number;
  gold: number;
  visible: Uint8Array;
  potionOfStrength: number;
  scrollsOfUpgrade: number;
  scrollsOfEnchantment: number;
  dewVial: boolean;
  bossLevel(depth?: number): boolean;
  shopOnLevel(): boolean;
}

export const Dungeon: DungeonState = {
  hero: null as unknown as Hero,
  level: null as unknown as Level,
  depth: 0,
  gold: 0,
  /** Cells the hero can currently see. */
  visible: new Uint8Array(LENGTH),

  potionOfStrength: 0,
  scrollsOfUpgrade: 0,
  scrollsOfEnchantment: 0,
  dewVial: true,

  bossLevel(depth: number = Dungeon.depth): boolean {
    return depth === 5 || depth === 10 || depth === 15 || depth === 20 || depth === 25;
  },

  shopOnLevel(): boolean {
    return Dungeon.depth === 6 || Dungeon.depth === 11 || Dungeon.depth === 16;
  },
};
