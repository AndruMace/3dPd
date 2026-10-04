import { describe, expect, it } from 'vitest';
import { Dungeon } from '../src/engine/Dungeon';
import { Game } from '../src/engine/Game';
import { Rankings, type RankingRecord } from '../src/engine/Rankings';

const rec = (score: number, time: number, win = false): RankingRecord => ({
  info: `run ${time}`,
  win,
  heroClass: 'WARRIOR',
  armorTier: 0,
  score,
  time,
  details: null,
});

describe('Rankings', () => {
  it('keeps the best TABLE_SIZE records sorted by score, and always keeps the newest', () => {
    let table = Rankings.empty();
    for (let i = 0; i < 6; i++) table = Rankings.insert(table, rec(100 * (i + 1), i));
    expect(table.records.map((r) => r.score)).toEqual([600, 500, 400, 300, 200, 100]);

    // A record that would rank last replaces the previous last one instead of being dropped.
    table = Rankings.insert(table, rec(50, 10));
    expect(table.records).toHaveLength(6);
    expect(table.records[5].time).toBe(10);
    expect(table.lastRecord).toBe(5);

    table = Rankings.insert(table, rec(550, 11, true));
    expect(table.records[1].time).toBe(11);
    expect(table.lastRecord).toBe(1);
    expect(table.records.map((r) => r.time)).not.toContain(10);
    expect(table.totalNumber).toBe(8);
    expect(table.wonNumber).toBe(1);
  });

  it('records a death without an Ankh, with the run details', () => {
    Game.newGame({ seed: 5, heroClass: 'WARRIOR' });
    Game.drainEvents();
    Dungeon.fail('Killed by a test on level 1');
    const events = Game.drainEvents().filter((e) => e.type === 'ranking');
    expect(events).toHaveLength(1);
    const r = (events[0] as Extract<(typeof events)[0], { type: 'ranking' }>).record;
    expect(r.info).toBe('Killed by a test on level 1');
    expect(r.score).toBe(Rankings.score(false));
    expect(r.details?.title).toBe('LEVEL 1 WARRIOR');
    expect(r.details?.items.map((i) => i.name)).toContain('Short sword :11');
    expect(r.details?.items.some((i) => i.quickslot)).toBe(true);
  });
});
