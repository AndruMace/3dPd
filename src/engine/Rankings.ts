// Port of Rankings: the table of finished runs. The engine builds the record when a run ends (Dungeon.fail with
// no Ankh to save the hero, or Dungeon.win) and emits it; the app keeps the table in storage and merges records
// in with `insert`, which is Rankings.submit's bookkeeping.
import { Dungeon, Statistics } from './Dungeon';
import { QuickSlot } from './QuickSlot';
import { Actor } from './actors/Actor';
import { classNameOf } from './core/Bundle';
import { Events } from './core/events';
import type { Item } from './items/Item';

/** What WndRanking shows for a record (PD reloads the whole saved game for this; we keep just what it reads). */
export interface RankingDetails {
  title: string;
  str: number;
  ht: number;
  duration: number;
  depth: number;
  enemies: number;
  gold: number;
  food: number;
  alchemy: number;
  ankhs: number;
  /** Equipped items, then the quickslot item (`quickslot: true`). */
  items: { image: number; name: string; glow: number | null; quickslot: boolean }[];
}

export interface RankingRecord {
  info: string;
  win: boolean;
  heroClass: string;
  armorTier: number;
  score: number;
  /** When the run ended (ms since epoch); also identifies the record. */
  time: number;
  details: RankingDetails | null;
}

export interface RankingsTable {
  records: RankingRecord[];
  /** Index of the latest record (RankingsScene puts a flare behind it), or -1. */
  lastRecord: number;
  totalNumber: number;
  wonNumber: number;
}

export const Rankings = {
  TABLE_SIZE: 6,

  empty(): RankingsTable {
    return { records: [], lastRecord: -1, totalNumber: 0, wonNumber: 0 };
  },

  score(win: boolean): number {
    return (Statistics.goldCollected + Dungeon.hero.lvl * Statistics.deepestFloor * 100) * (win ? 2 : 1);
  },

  /** Rankings.submit, engine half: describe the finished run and hand it to the view. */
  submit(win: boolean): void {
    Events.emit({ type: 'ranking', record: Rankings.record(win) });
  },

  record(win: boolean): RankingRecord {
    const hero = Dungeon.hero;
    const b = hero.belongings;
    const view = (item: Item, quickslot: boolean) => {
      const s = item.toString();
      return {
        image: item.imageIndex(),
        name: s.charAt(0).toUpperCase() + s.slice(1),
        glow: item.glowing(),
        quickslot,
      };
    };
    const items = [b.weapon, b.armor, b.ring1, b.ring2]
      .filter((i): i is NonNullable<typeof i> => i !== null)
      .map((i) => view(i, false));
    const q = QuickSlot.primaryValue;
    if (q !== null) {
      const item = [...b.all()].find((i) => (typeof q === 'string' ? classNameOf(i) === q : i === q));
      if (item) items.push(view(item, true));
    }
    return {
      info: Dungeon.resultDescription,
      win,
      heroClass: hero.heroClass,
      armorTier: hero.tier(),
      score: Rankings.score(win),
      time: Date.now(),
      details: {
        title: `Level ${hero.lvl} ${hero.heroClass.toLowerCase()}`.toUpperCase(),
        str: hero.STR(),
        ht: hero.HT,
        // PD shows the duration as of the last level change; the current level's turns are counted here too.
        duration: Math.trunc(Statistics.duration + Actor.now()),
        depth: Statistics.deepestFloor,
        enemies: Statistics.enemiesSlain,
        gold: Statistics.goldCollected,
        food: Statistics.foodEaten,
        alchemy: Statistics.potionsCooked,
        ankhs: Statistics.ankhsUsed,
        items,
      },
    };
  },

  /** Adds a record: sort by score, keep TABLE_SIZE (never dropping the newest), count games and wins. */
  insert(table: RankingsTable, rec: RankingRecord): RankingsTable {
    const records = [...table.records, rec].sort((a, b) => b.score - a.score);
    let lastRecord = records.indexOf(rec);
    if (records.length > Rankings.TABLE_SIZE) {
      if (lastRecord === records.length - 1) {
        records.splice(records.length - 2, 1);
        lastRecord--;
      } else records.pop();
    }
    return {
      records,
      lastRecord,
      totalNumber: table.totalNumber + 1,
      wonNumber: table.wonNumber + (rec.win ? 1 : 0),
    };
  },
};

Dungeon.submitRanking = (win) => Rankings.submit(win);
