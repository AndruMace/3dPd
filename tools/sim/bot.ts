// A headless bot that plays runs through the public engine API: explores, fights, picks things up, takes the
// stairs and, to exercise as much code as possible, randomly uses items and answers prompts.
import { Dungeon } from '../../src/engine/Dungeon';
import { Game } from '../../src/engine/Game';
import { adjacent, LENGTH } from '../../src/engine/levels/constants';
import { PathFinder } from '../../src/engine/mechanics/PathFinder';

export interface RunResult {
  seed: string;
  depth: number;
  turns: number;
  alive: boolean;
  cause: string;
  error?: string;
}

/** Deterministic per-run RNG for the bot's own choices (separate from the game's). */
function botRandom(seed: string): () => number {
  let s = 0;
  for (let i = 0; i < seed.length; i++) s = (Math.imul(s, 31) + seed.charCodeAt(i)) | 0;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x9e3779b9) | 0;
    return ((s >>> 0) % 100000) / 100000;
  };
}

function nearestUnexplored(): number {
  const level = Dungeon.level;
  const walk = new Uint8Array(LENGTH);
  for (let i = 0; i < LENGTH; i++) walk[i] = level.passable[i] && (level.visited[i] || level.mapped[i]) ? 1 : 0;
  PathFinder.buildDistanceMap(Dungeon.hero.pos, walk);
  let best = -1;
  let bestD = PathFinder.INFINITY;
  for (let i = 0; i < LENGTH; i++) {
    const d = PathFinder.distance[i];
    if (d === 0 || d >= bestD) continue;
    // a known passable cell next to an unknown one
    const frontier = [i - 1, i + 1, i - 32, i + 32].some(
      (n) => n >= 0 && n < LENGTH && !level.visited[n] && !level.mapped[n],
    );
    if (frontier) {
      best = i;
      bestD = d;
    }
  }
  return best;
}

export function playRun(seed: string, maxCommands = 4000, maxDepth = 5): RunResult {
  const rnd = botRandom(seed);
  Game.newGame({ seed, heroClass: (['WARRIOR', 'MAGE', 'ROGUE', 'HUNTRESS'] as const)[Math.floor(rnd() * 4)] });
  let commands = 0;
  let stuck = 0;
  try {
    while (commands++ < maxCommands && Dungeon.hero.isAlive() && Dungeon.depth <= maxDepth) {
      const prompt = Game.prompt;
      if (prompt) {
        if (prompt.kind === 'cell') Game.answer(rnd() < 0.9 ? Math.floor(rnd() * LENGTH) : null);
        else if (prompt.kind === 'item') {
          const items = [...Dungeon.hero.belongings.all()];
          Game.answer(rnd() < 0.8 && items.length ? items[Math.floor(rnd() * items.length)].uid : null);
        } else if (prompt.kind === 'options') Game.answer(Math.floor(rnd() * prompt.options.length));
        else Game.answer(null);
        continue;
      }
      if (Game.isBusy()) {
        Game.continue();
        continue;
      }
      if (Game.transition()) continue;
      if (Dungeon.hero.pendingTransition === null && !Game.isReady()) {
        // hero waiting for resurrection choice
        Game.resurrect(true);
        continue;
      }
      Game.drainEvents();

      const hero = Dungeon.hero;
      const level = Dungeon.level;
      const foe = [...level.mobs].find((m) => m.hostile && adjacent(m.pos, hero.pos));
      const roll = rnd();
      if (foe) {
        Game.handle(foe.pos);
      } else if (roll < 0.06) {
        // use a random item action
        const items = [...hero.belongings.all()];
        if (items.length) {
          const item = items[Math.floor(rnd() * items.length)];
          const actions = item.actions(hero);
          Game.itemAction(item.uid, actions[Math.floor(rnd() * actions.length)]);
        }
      } else if (roll < 0.08) {
        Game.search();
      } else if (level.heaps.has(hero.pos) && level.heaps.get(hero.pos)!.type === 'HEAP') {
        Game.handle(hero.pos);
      } else {
        const heap = [...level.heaps.values()].find(
          (h) => level.fieldOfView[h.pos] && h.type !== 'HIDDEN' && h.type !== 'FOR_SALE',
        );
        const target = heap && rnd() < 0.7 ? heap.pos : nearestUnexplored();
        const before = hero.pos;
        if (target !== -1 && stuck < 5) Game.handle(target);
        else {
          level.mapped.fill(1);
          Game.handle(level.exit === hero.pos ? hero.pos : level.exit);
        }
        stuck = hero.pos === before ? stuck + 1 : 0;
        if (stuck > 30) Game.rest();
      }
    }
    return {
      seed,
      depth: Dungeon.depth,
      turns: commands,
      alive: Dungeon.hero.isAlive(),
      cause: Dungeon.hero.isAlive() ? '' : Dungeon.resultDescription,
    };
  } catch (e) {
    return { seed, depth: Dungeon.depth, turns: commands, alive: false, cause: 'crash', error: (e as Error).stack };
  }
}
