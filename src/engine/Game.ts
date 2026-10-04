// The engine's public API: start or load a run, feed it player commands, and let the view drain events.
// Corresponds to the glue PD spreads across Dungeon (init/newLevel/switchLevel/save/load), InterlevelScene and
// GameScene.
import './index';
import { Assets } from '../content/generated/Assets';
import { Dungeon, ResultDescriptions, Statistics } from './Dungeon';
import { Journal } from './Journal';
import { QuickSlot } from './QuickSlot';
import { Actor } from './actors/Actor';
import { Hero, type HeroClass } from './actors/hero/Hero';
import { Ghost } from './actors/mobs/npcs';
import { Bundle, classNameOf } from './core/Bundle';
import { Events, GLog, type GameEvent } from './core/events';
import { Fx, Sample } from './core/fx';
import { Random, type RandomState } from './core/Random';
import { UI, type Prompt } from './core/ui';
import { Generator } from './items/Generator';
import type { Item } from './items/Item';
import { Ankh } from './items/misc';
import { Potion } from './items/potions/Potion';
import { Ring } from './items/rings/rings';
import { Scroll } from './items/scrolls/Scroll';
import { Wand } from './items/wands/Wand';
import { Light } from './actors/buffs/buffs';
import { Chasm } from './levels/features';
import type { Level } from './levels/Level';
import { RegularLevel } from './levels/RegularLevel';
import { Room } from './levels/Room';
import { SewerBossLevel } from './levels/SewerBossLevel';
import { SewerLevel } from './levels/SewerLevel';
import { observe } from './observe';
import { Seed } from './plants/plants';
import { WandOfBlink } from './items/wands/wands';

export interface RunConfig {
  seed: number | string;
  heroClass: HeroClass;
}

export type Answer = number | null;

/** Saved run: the game bundle plus one bundle per visited depth (PD's game.dat + depthN.dat). */
export interface SavedGame {
  version: number;
  game: string;
  levels: Record<number, string>;
}

const SAVE_VERSION = 1;

/** Levels the hero has left, kept serialized as PD kept them on disk. */
let savedLevels = new Map<number, string>();

const CHAPTERS: Record<number, [number, string]> = {
  1: [
    0,
    "The Dungeon lies right beneath the City, its upper levels actually constitute the City's sewer system. Being nominally a part of the City, these levels are not that dangerous. No one will call it a safe place, but at least you won't need to deal with evil magic here.",
  ],
};

export const Game = {
  newGame(config: RunConfig): void {
    Random.seed(config.seed);
    Events.clear();
    UI.clear();
    savedLevels = new Map();

    // Dungeon.init()
    Dungeon.challenges = 0;
    Actor.clear();
    Scroll.initLabels();
    Potion.initColors();
    Wand.initWoods();
    Ring.initGems();
    Statistics.reset();
    Journal.reset();
    Dungeon.depth = 0;
    Dungeon.gold = 0;
    Dungeon.droppedItems = new Map();
    Dungeon.potionOfStrength = 0;
    Dungeon.scrollsOfUpgrade = 0;
    Dungeon.scrollsOfEnchantment = 0;
    Dungeon.dewVial = true;
    Dungeon.chapters = new Set();
    Dungeon.nextItemId = 1;
    Ghost.Quest.reset();
    Room.shuffleTypes();
    QuickSlot.reset();

    const hero = new Hero();
    Dungeon.hero = hero;
    hero.live();
    hero.initClass(config.heroClass);

    Generator.reset();
    const level = newLevel();
    switchLevel(level, level.entrance, 'descend');
  },

  get hero(): Hero {
    return Dungeon.hero;
  },

  get level(): Level {
    return Dungeon.level;
  },

  /** The request the player must answer before anything else happens (a cell, an item, a choice). */
  get prompt(): Prompt | null {
    return UI.pending;
  },

  /** True when the hero is waiting for a command. */
  isReady(): boolean {
    return Dungeon.hero.ready && Dungeon.hero.isAlive() && UI.pending === null;
  },

  /**
   * True when the hero is in the middle of a multi-turn action (walking a path) and the engine is paused so
   * the view can catch up. Call `continue()` once the view is done animating.
   */
  isBusy(): boolean {
    const hero = Dungeon.hero;
    return hero.isAlive() && !hero.ready && hero.pendingTransition === null && UI.pending === null;
  },

  /** The player tapped a cell. While walking, any tap interrupts. */
  handle(cell: number): void {
    const hero = Dungeon.hero;
    if (!Game.isReady()) {
      hero.interrupt();
      return;
    }
    if (hero.handle(cell)) afterHeroAction();
  },

  /** The toolbar's wait button (long press: rest until healthy). */
  rest(tillHealthy = false): void {
    if (!Game.isReady()) return;
    Dungeon.hero.rest(tillHealthy);
    afterHeroAction();
  },

  /** The toolbar's search button. */
  search(): void {
    if (!Game.isReady()) return;
    Dungeon.hero.search(true);
    afterHeroAction();
  },

  /** Use an item action from the inventory (EAT, DRINK, READ, EQUIP, THROW, ZAP...). */
  itemAction(uid: number, action: string | null = null): void {
    if (!Game.isReady()) return;
    const item = Game.findItem(uid);
    if (!item) return;
    item.execute(Dungeon.hero, action ?? item.defaultAction);
    afterHeroAction();
  },

  /** Answers the pending prompt: a cell, an item uid, or an option index (null = cancelled). */
  answer(value: Answer): void {
    const p = UI.take();
    if (!p) return;
    switch (p.kind) {
      case 'cell':
        p.onSelect(value);
        break;
      case 'item':
        p.onSelect(value === null ? null : Game.findItem(value));
        break;
      case 'options':
        p.onSelect(value ?? -1);
        break;
      case 'message':
        p.onClose?.();
        break;
    }
    afterHeroAction();
  },

  /** The item in the quickslot (a stackable item is remembered by class and found again in the backpack). */
  quickslotItem(): Item | null {
    const v = QuickSlot.primaryValue;
    if (v === null) return null;
    for (const item of Dungeon.hero.belongings.all()) {
      if (typeof v === 'string' ? classNameOf(item) === v : item === v) return item;
    }
    return null;
  },

  /** QuickSlot's WndBag (QUICKSLOT mode) picked an item. */
  setQuickslot(uid: number): void {
    const item = Game.findItem(uid);
    if (item) QuickSlot.primaryValue = item.stackable ? classNameOf(item) : item;
  },

  /**
   * The quickslot button: use the item's default action, or, when that action is already waiting for a
   * target, fire at the last target (PD's auto-aim).
   */
  useQuickslot(): void {
    const p = UI.pending;
    if (p && p.kind === 'cell') {
      const target = QuickSlot.lastTarget;
      if (target !== -1 && Dungeon.visible[target] && Actor.findChar(target)) Game.answer(target);
      return;
    }
    const item = Game.quickslotItem();
    if (item && item.defaultAction !== null) Game.itemAction(item.uid, item.defaultAction);
  },

  findItem(uid: number): Item | null {
    for (const item of Dungeon.hero.belongings.all()) if (item.uid === uid) return item;
    return null;
  },

  /** Advance one more hero turn of a continuing action (or let the hero become ready). */
  continue(): void {
    Actor.process(1);
  },

  /** Perform a pending level transition. Returns true if the level changed. */
  transition(): boolean {
    const hero = Dungeon.hero;
    const t = hero.pendingTransition;
    if (!t) return false;
    hero.pendingTransition = null;
    Generator.reset();
    if (t === 'descend') descend();
    else if (t === 'ascend') ascend();
    else if (t === 'fall' || t === 'fallIntoPit') fall(t === 'fallIntoPit');
    else if (t === 'win') {
      Dungeon.win(ResultDescriptions.WIN);
      Events.emit({ type: 'fx', fx: 'win' });
    } else returnTo(t.depth, t.pos);
    return true;
  },

  /** After death with an Ankh: accept (true) or give up (false). */
  resurrect(accept: boolean): void {
    const hero = Dungeon.hero;
    if (!accept) {
      Hero.reallyDie(null);
      return;
    }
    const ankh = hero.belongings.getItem(Ankh);
    ankh?.detach(hero.belongings.backpack);
    Statistics.ankhsUsed++;
    Actor.fixTime();
    if (Dungeon.bossLevel()) {
      hero.resurrect(Dungeon.depth);
      Dungeon.depth--;
      const level = newLevel();
      switchLevel(level, level.entrance, 'resurrect');
    } else {
      hero.resurrect(-1);
      Actor.clear();
      Dungeon.visible.fill(0);
      Dungeon.level.reset();
      switchLevel(Dungeon.level, Dungeon.level.entrance, 'resurrect');
    }
  },

  /** Test/debug helper: take the stairs down from anywhere. */
  debugDescend(): void {
    UI.clear();
    Dungeon.hero.pendingTransition = 'descend';
    Game.transition();
  },

  drainEvents(): GameEvent[] {
    return Events.drain();
  },

  /** Dungeon.saveAll: the run and every visited level, as JSON strings. */
  save(): SavedGame {
    const levels: Record<number, string> = {};
    for (const [depth, json] of savedLevels) levels[depth] = json;
    levels[Dungeon.depth] = Bundle.store(Dungeon.level).toJSON();
    return { version: SAVE_VERSION, game: saveGameBundle().toJSON(), levels };
  },

  /** Dungeon.loadGame + loadLevel + switchLevel (InterlevelScene "CONTINUE"). */
  load(saved: SavedGame): void {
    Events.clear();
    UI.clear();
    Actor.clear();
    Events.muted(() => loadGameBundle(Bundle.parse(saved.game)));
    savedLevels = new Map(Object.entries(saved.levels).map(([d, json]) => [Number(d), json]));
    const level = loadLevel();
    switchLevel(level, Dungeon.hero.pos, 'continue');
  },
};

/** After a hero command: if the hero spent time, let everyone else act until the hero's next turn. */
function afterHeroAction(): void {
  const hero = Dungeon.hero;
  if (UI.pending !== null) return;
  if (!hero.ready && hero.isAlive() && hero.pendingTransition === null) {
    hero.next();
    Actor.process(0);
  }
}

function saveGameBundle(): Bundle {
  const bundle = new Bundle();
  bundle.put('version', SAVE_VERSION);
  bundle.put('challenges', Dungeon.challenges);
  bundle.put('hero', Dungeon.hero);
  bundle.put('gold', Dungeon.gold);
  bundle.put('depth', Dungeon.depth);
  for (const [d, items] of Dungeon.droppedItems) bundle.put(`dropped${d}`, items);
  bundle.put('potionsOfStrength', Dungeon.potionOfStrength);
  bundle.put('scrollsOfEnhancement', Dungeon.scrollsOfUpgrade);
  bundle.put('scrollsOfEnchantment', Dungeon.scrollsOfEnchantment);
  bundle.put('dewVial', Dungeon.dewVial);
  bundle.put('chapters', [...Dungeon.chapters]);
  const quests = new Bundle();
  Ghost.Quest.storeInBundle(quests);
  bundle.put('quests', quests);
  Room.storeRoomsInBundle(bundle);
  const stats = new Bundle();
  Object.entries(Statistics).forEach(([k, v]) => {
    if (typeof v !== 'function') stats.put(k, v as number | boolean);
  });
  bundle.put('statistics', stats);
  bundle.put(
    'journal',
    Journal.records.map((r) => `${r.feature}:${r.depth}`),
  );
  Scroll.save(bundle);
  Potion.save(bundle);
  Wand.save(bundle);
  Ring.save(bundle);
  bundle.put('random', Random.getState());
  bundle.put('nextItemId', Dungeon.nextItemId);
  return bundle;
}

function loadGameBundle(bundle: Bundle): void {
  // Item appearances must be restored before any item is re-created from the bundle.
  Scroll.restore(bundle);
  Potion.restore(bundle);
  Wand.restore(bundle);
  Ring.restore(bundle);
  Dungeon.challenges = bundle.getInt('challenges');
  Dungeon.gold = bundle.getInt('gold');
  Dungeon.depth = bundle.getInt('depth');
  Dungeon.potionOfStrength = bundle.getInt('potionsOfStrength');
  Dungeon.scrollsOfUpgrade = bundle.getInt('scrollsOfEnhancement');
  Dungeon.scrollsOfEnchantment = bundle.getInt('scrollsOfEnchantment');
  Dungeon.dewVial = bundle.getBoolean('dewVial');
  Dungeon.chapters = new Set(bundle.getIntArray('chapters'));
  Ghost.Quest.restoreFromBundle(bundle.getBundle('quests'));
  Room.restoreRoomsFromBundle(bundle);
  const stats = bundle.getBundle('statistics');
  for (const [k, v] of Object.entries(stats.data)) (Statistics as unknown as Record<string, unknown>)[k] = v;
  Journal.records = bundle.getStringArray('journal').map((s) => {
    const [feature, depth] = s.split(':');
    return { feature: feature as never, depth: Number(depth) };
  });
  QuickSlot.reset();
  Dungeon.hero = bundle.get<Hero>('hero')!;
  Dungeon.droppedItems = new Map();
  for (const key of Object.keys(bundle.data)) {
    const m = /^dropped(\d+)$/.exec(key);
    if (m) Dungeon.droppedItems.set(Number(m[1]), bundle.getCollection<Item>(key));
  }
  Random.setState(bundle.getIntArray('random') as RandomState);
  Dungeon.nextItemId = Math.max(Dungeon.nextItemId, bundle.getInt('nextItemId'));
}

function createLevel(depth: number): Level {
  switch (depth) {
    case 1:
    case 2:
    case 3:
    case 4:
      return new SewerLevel();
    case 5:
      return new SewerBossLevel();
    default:
      // The Prison and deeper regions arrive in later milestones; until then the sewers continue.
      return new SewerLevel();
  }
}

function newLevel(): Level {
  Dungeon.level = null as unknown as Level;
  Actor.clear();
  Dungeon.depth++;
  if (Dungeon.depth > Statistics.deepestFloor) {
    Statistics.deepestFloor = Dungeon.depth;
    Statistics.completedWithNoKilling = Statistics.qualifiedForNoKilling;
  }
  Dungeon.visible.fill(0);
  const level = createLevel(Dungeon.depth);
  Dungeon.level = level;
  Events.muted(() => level.create());
  Statistics.qualifiedForNoKilling = !Dungeon.bossLevel();
  return level;
}

/** Dungeon.saveLevel: keep the level being left. */
function saveLevel(): void {
  savedLevels.set(Dungeon.depth, Bundle.store(Dungeon.level).toJSON());
}

function loadLevel(): Level {
  Dungeon.level = null as unknown as Level;
  Actor.clear();
  Dungeon.visible.fill(0);
  const json = savedLevels.get(Dungeon.depth)!;
  savedLevels.delete(Dungeon.depth);
  const level = Events.muted(() => Bundle.restore(Bundle.parse(json)) as Level);
  Dungeon.level = level;
  return level;
}

function descend(): void {
  Actor.fixTime();
  saveLevel();
  let level: Level;
  if (Dungeon.depth >= Statistics.deepestFloor) {
    level = newLevel();
  } else {
    Dungeon.depth++;
    level = loadLevel();
  }
  switchLevel(level, level.entrance, 'descend');
}

function ascend(): void {
  Actor.fixTime();
  saveLevel();
  Dungeon.depth--;
  const level = loadLevel();
  switchLevel(level, level.exit, 'ascend');
}

function fall(intoPit: boolean): void {
  Actor.fixTime();
  saveLevel();
  let level: Level;
  if (Dungeon.depth >= Statistics.deepestFloor) {
    level = newLevel();
  } else {
    Dungeon.depth++;
    level = loadLevel();
  }
  switchLevel(level, intoPit ? level.pitCell() : level.randomRespawnCell(), 'fall');
}

function returnTo(depth: number, pos: number): void {
  Actor.fixTime();
  saveLevel();
  Dungeon.depth = depth;
  const level = loadLevel();
  switchLevel(level, pos, 'return');
}

type Mode = 'descend' | 'ascend' | 'fall' | 'return' | 'resurrect' | 'continue';

/** Dungeon.switchLevel plus GameScene's level-entry logic. */
function switchLevel(level: Level, pos: number, mode: Mode): void {
  Dungeon.level = level;
  const hero = Dungeon.hero;
  Actor.init();
  const respawner = level.respawner();
  if (respawner) Actor.add(respawner);
  hero.pos = pos !== -1 ? pos : level.exit;
  const light = hero.buff(Light);
  hero.viewDistance = light === null ? level.viewDistance : Math.max(4, level.viewDistance);
  hero.ready = false;

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
  for (const plant of level.plants.values()) Events.emit({ type: 'plant', pos: plant.pos, image: plant.image });
  for (const blob of level.blobs.values()) blob.notifyView();
  for (const ch of [hero, ...level.mobs]) for (const s of ch.spriteStates()) ch.setState(s, true);
  observe();

  switch (mode) {
    case 'resurrect':
      WandOfBlink.appear(hero, level.entrance);
      Fx.flare(hero.id(), 0xffff66, 8);
      break;
    case 'return':
      WandOfBlink.appear(hero, hero.pos);
      break;
    case 'fall':
      Chasm.heroLand();
      break;
    case 'descend': {
      const chapter = CHAPTERS[Dungeon.depth];
      if (chapter && !Dungeon.chapters.has(chapter[0])) {
        Dungeon.chapters.add(chapter[0]);
        UI.request({ kind: 'message', text: chapter[1], story: true });
      }
      break;
    }
    default:
  }

  const dropped = Dungeon.droppedItems.get(Dungeon.depth);
  if (dropped) {
    for (const item of dropped) {
      const cell = level.randomRespawnCell();
      if (item instanceof Potion) item.shatter(cell);
      else if (item instanceof Seed) level.plant(item, cell);
      else level.drop(item, cell);
    }
    Dungeon.droppedItems.delete(Dungeon.depth);
  }

  if (mode !== 'continue') {
    if (Dungeon.depth < Statistics.deepestFloor) {
      GLog.h(`Welcome back to the level ${Dungeon.depth} of Pixel Dungeon!`);
    } else {
      GLog.h(`Welcome to the level ${Dungeon.depth} of Pixel Dungeon!`);
      Sample.play(Assets.SND_DESCEND);
    }
    switch (level.feeling) {
      case 'CHASM':
        GLog.w('Your steps echo across the dungeon.');
        break;
      case 'WATER':
        GLog.w('You hear the water splashing around you.');
        break;
      case 'GRASS':
        GLog.w('The smell of vegetation is thick in the air.');
        break;
      default:
    }
    if (level instanceof RegularLevel && level.secretDoors > Random.IntRange(3, 4)) {
      GLog.w('The atmosphere hints that this floor hides many secrets.');
    }
  }

  Actor.process(1);
}
