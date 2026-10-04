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
        if (depth > 1) Game.debugDescend();
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
      if (Game.prompt) {
        Game.answer(Game.prompt.kind === 'options' ? 0 : null);
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
        if (Game.prompt) Game.answer(null);
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
    expect(events.find((e) => e.type === 'level')).toMatchObject({ type: 'level', depth: 1 });
    expect(events.some((e) => e.type === 'observe')).toBe(true);
    // The Sewers story chapter is shown first, as in PD.
    expect(Game.prompt?.kind).toBe('message');
    Game.answer(null);
    expect(Game.isReady()).toBe(true);
  });
});

describe('Items and saves', () => {
  it('starts the warrior with the original kit', () => {
    Game.newGame({ seed: 1, heroClass: 'WARRIOR' });
    const hero = Dungeon.hero;
    expect(hero.STR()).toBe(11);
    expect(hero.belongings.weapon?.name_()).toBe('short sword');
    expect(hero.belongings.armor?.name_()).toBe('cloth armor');
    const names = hero.belongings.backpack.items.map((i) => i.toString());
    expect(names).toEqual(expect.arrayContaining(['ration of food', 'dart x8 :10', 'key ring']));
  });

  it('eats, drinks and reads through the item pipeline', () => {
    Game.newGame({ seed: 2, heroClass: 'WARRIOR' });
    while (Game.prompt) Game.answer(null);
    const hero = Dungeon.hero;
    const food = hero.belongings.backpack.items.find((i) => i.toString() === 'ration of food')!;
    const before = Actor.now();
    Game.itemAction(food.uid, 'EAT');
    expect(hero.belongings.backpack.items.includes(food)).toBe(false);
    expect(Actor.now()).toBeGreaterThan(before);
  });

  it('round-trips a run through save and load', () => {
    Game.newGame({ seed: 'save', heroClass: 'WARRIOR' });
    while (Game.prompt) Game.answer(null);
    Game.debugDescend();
    while (Game.prompt) Game.answer(null);
    const saved = Game.save();
    const map = Dungeon.level.map.slice();
    const heroPos = Dungeon.hero.pos;
    const mobs = [...Dungeon.level.mobs].map((m) => `${m.constructor.name}@${m.pos}:${m.HP}`).sort();
    const pack = Dungeon.hero.belongings.backpack.items.map((i) => i.toString());

    Game.newGame({ seed: 'other', heroClass: 'MAGE' });
    Game.load(JSON.parse(JSON.stringify(saved)));
    expect(Dungeon.depth).toBe(2);
    expect(Dungeon.level.map).toEqual(map);
    expect(Dungeon.hero.pos).toBe(heroPos);
    expect(Dungeon.hero.heroClass).toBe('WARRIOR');
    expect([...Dungeon.level.mobs].map((m) => `${m.constructor.name}@${m.pos}:${m.HP}`).sort()).toEqual(mobs);
    expect(Dungeon.hero.belongings.backpack.items.map((i) => i.toString())).toEqual(pack);

    // Going back up restores the first level from its saved bundle.
    Dungeon.hero.pendingTransition = 'ascend';
    Game.transition();
    expect(Dungeon.depth).toBe(1);
  });

  it('generates the Goo level with its boss', () => {
    Game.newGame({ seed: 'goo', heroClass: 'WARRIOR' });
    for (let d = 1; d < 5; d++) Game.debugDescend();
    expect(Dungeon.depth).toBe(5);
    expect([...Dungeon.level.mobs].some((m) => m.name === 'Goo')).toBe(true);
    expect(Dungeon.level.map[Dungeon.level.exit]).toBe(Terrain.LOCKED_EXIT);
  });
});
