// The engine's public API: start a run, feed it player commands, and let the view drain events.
// Corresponds to the glue PD spreads across Dungeon.init/newLevel/switchLevel, InterlevelScene and GameScene.
import { Dungeon } from './Dungeon';
import { Actor } from './actors/Actor';
import { Hero, type HeroClass } from './actors/hero/Hero';
import { Events, type GameEvent } from './core/events';
import { Random } from './core/Random';
import { ShortSword } from './items/weapon/ShortSword';
import type { Level } from './levels/Level';
import { Room } from './levels/Room';
import { SewerLevel } from './levels/SewerLevel';
import { observe } from './observe';

export interface RunConfig {
  seed: number | string;
  heroClass: HeroClass;
}

const levels = new Map<number, Level>();
let deepestFloor = 0;

export const Game = {
  newGame(config: RunConfig): void {
    Random.seed(config.seed);
    Events.clear();
    Actor.clear();
    levels.clear();
    deepestFloor = 0;

    Dungeon.depth = 0;
    Dungeon.gold = 0;
    Dungeon.potionOfStrength = 0;
    Dungeon.scrollsOfUpgrade = 0;
    Dungeon.scrollsOfEnchantment = 0;
    Dungeon.dewVial = true;
    Room.shuffleTypes();

    const hero = new Hero();
    hero.heroClass = config.heroClass;
    hero.spriteId = hero.spriteSheet;
    hero.updateAwareness();
    initHero(hero);
    Dungeon.hero = hero;

    this.descend();
  },

  get hero(): Hero {
    return Dungeon.hero;
  },

  get level(): Level {
    return Dungeon.level;
  },

  /** True when the hero is waiting for a command. */
  isReady(): boolean {
    return Dungeon.hero.ready && Dungeon.hero.isAlive();
  },

  /**
   * True when the hero is in the middle of a multi-turn action (walking a path) and the engine is
   * paused so the view can catch up. Call `continue()` once the view is done animating.
   */
  isBusy(): boolean {
    const hero = Dungeon.hero;
    return hero.isAlive() && !hero.ready && hero.pendingTransition === null;
  },

  /** The player tapped a cell. */
  handle(cell: number): void {
    const hero = Dungeon.hero;
    if (!this.isReady()) {
      hero.interrupt();
      return;
    }
    if (hero.handle(cell)) {
      hero.next();
      Actor.process(0);
    }
  },

  /** The player pressed "wait". */
  rest(): void {
    if (!this.isReady()) return;
    const hero = Dungeon.hero;
    hero.rest(false);
    hero.next();
    Actor.process(0);
  },

  /** Advance one more hero turn of a continuing action (or let the hero become ready). */
  continue(): void {
    Actor.process(1);
  },

  /** Perform a pending stair transition, if the hero asked for one. Returns true if the level changed. */
  transition(): boolean {
    const t = Dungeon.hero.pendingTransition;
    if (!t) return false;
    Dungeon.hero.pendingTransition = null;
    if (t === 'descend') this.descend();
    else this.ascend();
    return true;
  },

  descend(): void {
    Actor.fixTime();
    let level: Level;
    if (Dungeon.depth >= deepestFloor) {
      level = newLevel();
    } else {
      Dungeon.depth++;
      level = loadLevel();
    }
    switchLevel(level, level.entrance);
  },

  ascend(): void {
    Actor.fixTime();
    Dungeon.depth--;
    const level = loadLevel();
    switchLevel(level, level.exit);
  },

  drainEvents(): GameEvent[] {
    return Events.drain();
  },
};

function initHero(hero: Hero): void {
  switch (hero.heroClass) {
    case 'WARRIOR':
      hero.STRValue += 1;
      hero.belongings.weapon = new ShortSword().identify();
      break;
    default:
      // Other classes' kits arrive with their milestones.
      break;
  }
}

function newLevel(): Level {
  Actor.clear();
  Dungeon.depth++;
  if (Dungeon.depth > deepestFloor) deepestFloor = Dungeon.depth;
  Dungeon.visible.fill(0);

  // M2+: SewerBossLevel at 5, then the other regions.
  const level = new SewerLevel();
  Dungeon.level = level;
  level.create();
  levels.set(Dungeon.depth, level);
  return level;
}

function loadLevel(): Level {
  Actor.clear();
  Dungeon.visible.fill(0);
  return levels.get(Dungeon.depth)!;
}

function switchLevel(level: Level, pos: number): void {
  Dungeon.level = level;
  const hero = Dungeon.hero;
  hero.pos = pos !== -1 ? pos : level.exit;
  hero.viewDistance = level.viewDistance;
  Actor.init();
  const respawner = level.respawner();
  if (respawner) Actor.add(respawner);
  Events.emit({
    type: 'level',
    depth: Dungeon.depth,
    tiles: level.tilesTex(),
    water: level.waterTex(),
    map: level.map.slice(),
    heroId: hero.id(),
    chars: [hero, ...level.mobs].map((c) => ({ id: c.id(), sprite: c.spriteId, pos: c.pos, hp: c.HP, ht: c.HT })),
    heaps: [...level.heaps.values()].map((h) => ({ pos: h.pos, image: h.image(), type: h.type })),
  });
  observe();
  hero.ready = false;
  Actor.process(1);
}
