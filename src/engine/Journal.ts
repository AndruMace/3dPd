// Port of Journal.java: notable features the hero has seen, by depth.
import { Dungeon } from './Dungeon';

export const Feature = {
  WELL_OF_HEALTH: 'Well of Health',
  WELL_OF_AWARENESS: 'Well of Awareness',
  WELL_OF_TRANSMUTATION: 'Well of Transmutation',
  SACRIFICIAL_FIRE: 'Sacrificial chamber',
  ALCHEMY: 'Alchemy pot',
  GARDEN: 'Garden',
  STATUE: 'Animated statue',
  GHOST: 'Sad ghost',
  WANDMAKER: 'Old wandmaker',
  TROLL: 'Troll blacksmith',
  IMP: 'Ambitious imp',
} as const;
export type FeatureId = keyof typeof Feature;

export interface JournalRecord {
  feature: FeatureId;
  depth: number;
}

export const Journal = {
  records: [] as JournalRecord[],

  reset(): void {
    Journal.records = [];
  },

  add(feature: FeatureId): void {
    if (Journal.records.some((r) => r.feature === feature && r.depth === Dungeon.depth)) return;
    Journal.records.push({ feature, depth: Dungeon.depth });
  },

  remove(feature: FeatureId): void {
    const i = Journal.records.findIndex((r) => r.feature === feature && r.depth === Dungeon.depth);
    if (i >= 0) Journal.records.splice(i, 1);
  },
};
