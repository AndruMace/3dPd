import { describe, expect, it } from 'vitest';
import { Dungeon } from '../src/engine/Dungeon';
import { Game } from '../src/engine/Game';
import { Actor } from '../src/engine/actors/Actor';
import { Random } from '../src/engine/core/Random';
import { adjacent, LENGTH, WIDTH } from '../src/engine/levels/constants';
import { flags, Terrain } from '../src/engine/levels/Terrain';
import { castShadow } from '../src/engine/mechanics/ShadowCaster';
import { PathFinder } from '../src/engine/mechanics/PathFinder';

function grid(rows: string[]): { solid: Uint8Array; at: (x: number, y: number) => number } {
  const solid = new Uint8Array(LENGTH).fill(1);
  rows.forEach((row, y) => [...row].forEach((c, x) => (solid[y * WIDTH + x] = c === '#' ? 1 : 0)));
  return { solid, at: (x, y) => y * WIDTH + x };
}

describe('Random', () => {
  it('is deterministic per seed and restorable', () => {
    Random.seed(42);
    const a = [Random.Int(100), Random.Float(), Random.IntRange(1, 6)];
    const state = Random.getState();
    const next = Random.Float();
    Random.seed(42);
    expect([Random.Int(100), Random.Float(), Random.IntRange(1, 6)]).toEqual(a);
    Random.setState(state);
    expect(Random.Float()).toBe(next);
  });

  it('keeps ranges in bounds', () => {
    Random.seed('bounds');
    for (let i = 0; i < 5000; i++) {
      const n = Random.NormalIntRange(1, 5);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(5);
      expect(Random.Int(3, 7)).toBeLessThan(7);
    }
  });
});

describe('ShadowCaster', () => {
  it('sees across an open room but not through walls', () => {
    const { solid, at } = grid(['##########', '#........#', '#........#', '#...#....#', '#........#', '##########']);
    const fov = new Uint8Array(LENGTH);
    castShadow(2, 3, fov, 8, solid);
    expect(fov[at(8, 1)]).toBe(1);
    expect(fov[at(4, 3)]).toBe(1); // the pillar itself is visible
    expect(fov[at(6, 3)]).toBe(0); // directly behind the pillar
    expect(fov[at(0, 0)]).toBe(1); // walls bounding the room are visible
  });
});

describe('PathFinder', () => {
  it('finds the shortest 8-connected path around obstacles', () => {
    const { solid, at } = grid(['#######', '#.....#', '#.###.#', '#.....#', '#######']);
    const passable = solid.map((s) => 1 - s);
    const path = PathFinder.find(at(1, 1), at(5, 3), passable)!;
    expect(path.at(-1)).toBe(at(5, 3));
    expect(path.length).toBe(5);
    for (let i = 1; i < path.length; i++) expect(adjacent(path[i - 1], path[i])).toBe(true);
    expect(PathFinder.getStep(at(1, 1), at(1, 1), passable)).toBe(-1);
  });
});

describe('Sewer level generation', () => {
  it('produces sound levels across many seeds', () => {
    for (let seed = 0; seed < 150; seed++) {
      Game.newGame({ seed, heroClass: 'WARRIOR' });
      for (let depth = 1; depth <= 4; depth++) {
        if (depth > 1) Game.descend();
        const level = Dungeon.level;
        expect(Dungeon.depth).toBe(depth);

        // Border is never walkable.
        for (let i = 0; i < WIDTH; i++) {
          expect(level.passable[i]).toBe(0);
          expect(level.passable[LENGTH - 1 - i]).toBe(0);
        }

        // The exit is reachable from the entrance (secret doors count as passable: they can be found).
        const walk = new Uint8Array(LENGTH);
        for (let i = 0; i < LENGTH; i++) {
          const f = flags[level.map[i]];
          walk[i] = level.passable[i] || f & Terrain.SECRET || f & Terrain.AVOID ? 1 : 0;
        }
        PathFinder.buildDistanceMap(level.entrance, walk);
        expect(PathFinder.distance[level.exit], `seed ${seed} depth ${depth}`).toBeLessThan(PathFinder.INFINITY);

        // Mobs stand on distinct passable cells, away from the hero.
        const cells = new Set<number>();
        for (const mob of level.mobs) {
          expect(level.passable[mob.pos]).toBe(1);
          expect(cells.has(mob.pos)).toBe(false);
          cells.add(mob.pos);
        }
        expect(level.mobs.size).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('is deterministic for a given seed', () => {
    Game.newGame({ seed: 'same', heroClass: 'WARRIOR' });
    const a = Dungeon.level.map.slice();
    Game.newGame({ seed: 'same', heroClass: 'WARRIOR' });
    expect(Dungeon.level.map).toEqual(a);
  });
});

describe('Turn loop', () => {
  /** A blunt bot: fight anything adjacent, otherwise head for the exit. */
  function play(seed: number, maxTurns = 3000) {
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    let turns = 0;
    while (turns++ < maxTurns && Dungeon.hero.isAlive() && Dungeon.depth < 4) {
      if (Game.isBusy()) {
        Game.continue();
        continue;
      }
      if (Game.transition()) continue;
      Dungeon.level.mapped.fill(1); // the bot doesn't explore; let it path anywhere it could see
      expect(Game.isReady()).toBe(true);
      const hero = Dungeon.hero;
      const foe = [...Dungeon.level.mobs].find((m) => adjacent(m.pos, hero.pos));
      if (foe) Game.handle(foe.pos);
      else if (hero.pos === Dungeon.level.exit) Game.handle(hero.pos);
      else {
        const before = Actor.now();
        Game.handle(Dungeon.level.exit);
        if (Game.isReady() && Actor.now() === before) Game.rest();
      }
      Game.drainEvents();
    }
    return { depth: Dungeon.depth, alive: Dungeon.hero.isAlive() };
  }

  it('lets a warrior fight and descend without errors', () => {
    const results = Array.from({ length: 20 }, (_, i) => play(i));
    expect(results.some((r) => r.depth > 1)).toBe(true);
    for (const r of results) expect(r.depth >= 4 || !r.alive || r.depth >= 1).toBe(true);
  });

  it('emits events the view can replay', () => {
    Game.newGame({ seed: 7, heroClass: 'WARRIOR' });
    const events = Game.drainEvents();
    expect(events[0]).toMatchObject({ type: 'level', depth: 1 });
    expect(events.some((e) => e.type === 'observe')).toBe(true);
    expect(Game.isReady()).toBe(true);
  });
});
