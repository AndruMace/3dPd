// Read-only views of game state for the UI (what PD's windows and HUD widgets computed inline): status values,
// inventory slots, item windows, and the "examine a cell" results.
import { Dungeon } from './Dungeon';
import { Actor } from './actors/Actor';
import type { Buff } from './actors/buffs/Buff';
import type { Mob } from './actors/mobs/Mob';
import { indefinite } from './actors/Char';
import type { ItemSelectorMode } from './core/ui';
import { Armor } from './items/armor/Armor';
import type { Bag } from './items/bags';
import { Gold } from './items/misc';
import type { Item } from './items/Item';
import { IronKey } from './items/keys';
import { Wand } from './items/wands/Wand';
import { MeleeWeapon } from './items/weapon/melee';
import { Boomerang } from './items/weapon/missiles';
import { Weapon } from './items/weapon/Weapon';
import { Seed } from './plants/plants';
import { LENGTH } from './levels/constants';
import { classByName } from './core/Bundle';
import { Game } from './Game';
import { QuickSlot } from './QuickSlot';

export interface StatusView {
  hp: number;
  ht: number;
  lvl: number;
  exp: number;
  maxExp: number;
  depth: number;
  keys: number;
  gold: number;
  tier: number;
  heroClass: string;
  buffs: { icon: number; name: string }[];
  visibleEnemies: number;
  /** Strength (shown in the hero window). */
  str: number;
}

export interface SlotView {
  uid: number | null;
  image: number;
  /** Placeholder for an empty equipment slot. */
  placeholder: boolean;
  status: string | null;
  topRight: { text: string; color: number | null } | null;
  bottomRight: { text: string; color: number } | null;
  equipped: boolean;
  cursed: boolean;
  unidentified: boolean;
  durability: number | null;
  enabled: boolean;
  glow: number | null;
}

export interface ItemWindowView {
  uid: number;
  image: number;
  glow: number | null;
  title: string;
  titleColor: number | null;
  durability: number | null;
  info: string;
  actions: string[];
  defaultAction: string | null;
}

export type ExamineView =
  | { kind: 'message'; text: string }
  | { kind: 'hero' }
  | {
      kind: 'mob';
      name: string;
      sprite: string;
      hp: number;
      ht: number;
      status: string;
      desc: string;
      buffs: { icon: number; name: string }[];
    }
  | { kind: 'heap'; image: number; title: string; info: string }
  | { kind: 'plant'; image: number; title: string; info: string }
  | { kind: 'cell'; tile: number; title: string; info: string };

const UPGRADED = 0x44ff44;
const DEGRADED = 0xff4444;
const WARNING = 0xff8800;

function buffViews(buffs: Set<Buff>): { icon: number; name: string }[] {
  return [...buffs].filter((b) => b.icon() !== -1).map((b) => ({ icon: b.icon(), name: b.toString() }));
}

export const Inspect = {
  status(): StatusView {
    const hero = Dungeon.hero;
    let keys = 0;
    for (const item of hero.belongings.backpack.all())
      if (item instanceof IronKey && item.depth === Dungeon.depth) keys++;
    return {
      hp: hero.HP,
      ht: hero.HT,
      lvl: hero.lvl,
      exp: hero.exp,
      maxExp: hero.maxExp(),
      depth: Dungeon.depth,
      keys,
      gold: Dungeon.gold,
      tier: hero.tier(),
      heroClass: hero.heroClass,
      buffs: buffViews(hero.buffs()),
      visibleEnemies: hero.visibleEnemyCount(),
      str: hero.STR(),
    };
  },

  /** WndBag: the four equipment slots, the bag's items, empty slots, and gold in the last cell. */
  bag(
    bag: Bag | null,
    mode: ItemSelectorMode,
    cols: number,
  ): { title: string; slots: SlotView[]; bags: { uid: number; name: string }[] } {
    const hero = Dungeon.hero;
    const b = hero.belongings;
    const container = bag ?? b.backpack;
    const backpack = container === b.backpack;
    const slots: SlotView[] = [];
    const placeholders: [Item | null, number][] = [
      [b.weapon, 5],
      [b.armor, 6],
      [b.ring1, 7],
      [b.ring2, 7],
    ];
    for (const [item, ph] of placeholders) slots.push(item ? Inspect.slot(item, mode) : placeholderSlot(ph));
    if (!backpack) while (slots.length < cols) slots.push(emptySlot());
    for (const item of container.items) slots.push(Inspect.slot(item, mode));
    const total = (backpack ? 4 : cols) + container.size;
    while (slots.length < total) slots.push(emptySlot());
    if (backpack) {
      const nRows = Math.ceil((b.backpack.size + 4 + 1) / cols);
      while (slots.length < nRows * cols - 1) slots.push(emptySlot());
      const gold = Inspect.slot(new Gold(Dungeon.gold), mode);
      slots.push({ ...gold, uid: null, enabled: false });
    }
    const bags = [b.backpack, ...b.backpack.items.filter((i) => i.isBag())] as Bag[];
    return {
      title: container.name_().charAt(0).toUpperCase() + container.name_().slice(1),
      slots,
      bags: bags.map((x) => ({ uid: x.uid, name: x.name_() })),
    };
  },

  slot(item: Item, mode: ItemSelectorMode): SlotView {
    const hero = Dungeon.hero;
    const isArmor = item instanceof Armor;
    const isWeapon = item instanceof Weapon;
    let topRight: SlotView['topRight'] = null;
    let bottomRight: SlotView['bottomRight'] = null;
    if (isArmor || isWeapon) {
      if (item.levelKnown || (isWeapon && !(item instanceof MeleeWeapon))) {
        const str = isArmor ? (item as Armor).STR : (item as Weapon).STR;
        topRight = { text: `:${str}`, color: str > hero.STR() ? DEGRADED : null };
      } else {
        topRight = {
          text: `${isArmor ? (item as Armor).typicalSTR() : (item as MeleeWeapon).typicalSTR()}?`,
          color: WARNING,
        };
      }
    }
    const level = item.visiblyUpgraded();
    if (level !== 0 || (item.cursed && item.cursedKnown)) {
      bottomRight = {
        text: item.levelKnown ? (level > 0 ? `+${level}` : `${level}`) : '',
        color: level > 0 ? (item.isBroken() ? WARNING : UPGRADED) : DEGRADED,
      };
    }
    const enabled =
      (mode === 'QUICKSLOT' && item.defaultAction !== null) ||
      (mode === 'FOR_SALE' && item.price() > 0 && (!item.isEquipped(hero) || !item.cursed)) ||
      (mode === 'UPGRADEABLE' && item.isUpgradable()) ||
      (mode === 'UNIDENTIFED' && !item.isIdentified()) ||
      (mode === 'WEAPON' && (item instanceof MeleeWeapon || item instanceof Boomerang)) ||
      (mode === 'ARMOR' && item instanceof Armor) ||
      (mode === 'ENCHANTABLE' && (item instanceof MeleeWeapon || item instanceof Boomerang || item instanceof Armor)) ||
      (mode === 'WAND' && item instanceof Wand) ||
      (mode === 'SEED' && item instanceof Seed) ||
      mode === 'ALL';
    return {
      uid: item.uid,
      image: item.imageIndex(),
      placeholder: false,
      status: item.status(),
      topRight,
      bottomRight,
      equipped: item.isEquipped(hero),
      cursed: item.cursed && item.cursedKnown,
      unidentified: !item.isIdentified(),
      durability:
        hero.isAlive() && item.isUpgradable() && item.levelKnown ? item.durability() / item.maxDurability() : null,
      enabled,
      glow: item.glowing(),
    };
  },

  item(uid: number): ItemWindowView | null {
    const hero = Dungeon.hero;
    let item: Item | null = null;
    for (const i of hero.belongings.all()) if (i.uid === uid) item = i;
    if (!item) return null;
    let titleColor: number | null = null;
    if (item.levelKnown) {
      if (item.level() < 0) titleColor = DEGRADED;
      else if (item.level() > 0) titleColor = item.isBroken() ? WARNING : UPGRADED;
    }
    const s = item.toString();
    return {
      uid,
      image: item.imageIndex(),
      glow: item.glowing(),
      title: s.charAt(0).toUpperCase() + s.slice(1),
      titleColor,
      durability: item.isUpgradable() && item.levelKnown ? item.durability() / item.maxDurability() : null,
      info: item.info(),
      actions: hero.isAlive() ? item.actions(hero) : [],
      defaultAction: item.defaultAction,
    };
  },

  /** The toolbar's quickslot button. */
  quickslot(): { image: number; status: string | null; enabled: boolean } | null {
    const v = QuickSlot.primaryValue;
    if (v === null) return null;
    const item = Game.quickslotItem();
    if (item) return { image: item.imageIndex(), status: item.status(), enabled: Dungeon.hero.isAlive() };
    // A used-up stack keeps its picture, greyed out (QuickSlot.refresh with the class's placeholder image).
    return typeof v === 'string' ? { image: placeholderImage(v), status: null, enabled: false } : null;
  },

  /** The Toolbar's "informer": what the examine (?) button shows for a cell. */
  examine(cell: number): ExamineView {
    const level = Dungeon.level;
    if (cell < 0 || cell > LENGTH || (!level.visited[cell] && !level.mapped[cell])) {
      return { kind: 'message', text: "You don't know what is there." };
    }
    if (!Dungeon.visible[cell]) return Inspect.cellInfo(cell);
    if (cell === Dungeon.hero.pos) return { kind: 'hero' };
    const mob = Actor.findChar(cell) as Mob | null;
    if (mob) {
      return {
        kind: 'mob',
        name: mob.name,
        sprite: mob.spriteId,
        hp: mob.HP,
        ht: mob.HT,
        status: mob.status(),
        desc: `${mob.description()}\n\n${mob.status()}.`,
        buffs: buffViews(mob.buffs()),
      };
    }
    const heap = level.heaps.get(cell);
    if (heap && heap.type !== 'HIDDEN') {
      const item = heap.peek()!;
      let title: string;
      let info: string;
      switch (heap.type) {
        case 'CHEST':
        case 'MIMIC':
          title = 'Chest';
          info = "You won't know what's inside until you open it!";
          break;
        case 'LOCKED_CHEST':
          title = 'Locked chest';
          info = "You won't know what's inside until you open it! But to open it you need a golden key.";
          break;
        case 'CRYSTAL_CHEST':
          title = 'Crystal chest';
          info = `You can see ${indefinite(item.name_())} inside, but to open the chest you need a golden key.`;
          break;
        case 'TOMB':
          title = 'Tomb';
          info =
            'This ancient tomb may contain something useful, but its owner will most certainly object to checking.';
          break;
        case 'SKELETON':
          title = 'Skeletal remains';
          info = "This is all that's left from one of your predecessors. Maybe it's worth checking for any valuables.";
          break;
        default: {
          const s = item.toString();
          title = s.charAt(0).toUpperCase() + s.slice(1);
          info = item.info();
        }
      }
      return { kind: 'heap', image: heap.image(), title, info };
    }
    const plant = level.plants.get(cell);
    if (plant) return { kind: 'plant', image: plant.image, title: plant.plantName, info: plant.desc() ?? '' };
    return Inspect.cellInfo(cell);
  },

  /** WndInfoCell. */
  cellInfo(cell: number): ExamineView {
    const level = Dungeon.level;
    let tile = level.map[cell];
    if (level.water[cell])
      tile = 63; // Terrain.WATER
    else if (level.pit[cell]) tile = 0; // Terrain.CHASM
    let info = level.tileDesc(tile);
    for (const blob of level.blobs.values()) {
      if (blob.cur[cell] > 0 && blob.tileDesc()) info += (info.length > 0 ? '\n\n' : '') + blob.tileDesc();
    }
    return { kind: 'cell', tile, title: level.tileName(tile), info: info.length > 0 ? info : 'There is nothing here.' };
  },
};

function placeholderSlot(image: number): SlotView {
  return { ...emptySlot(), image, placeholder: true };
}

function emptySlot(): SlotView {
  return {
    uid: null,
    image: -1,
    placeholder: false,
    status: null,
    topRight: null,
    bottomRight: null,
    equipped: false,
    cursed: false,
    unidentified: false,
    durability: null,
    enabled: false,
    glow: null,
  };
}

const placeholderImages = new Map<string, number>();

/** The picture of an item class (for an empty quickslot that remembers a used-up stack). */
function placeholderImage(className: string): number {
  let image = placeholderImages.get(className);
  if (image === undefined) {
    const Ctor = classByName(className);
    const nextId = Dungeon.nextItemId;
    image = Ctor ? (new Ctor() as Item).imageIndex() : 0;
    Dungeon.nextItemId = nextId;
    placeholderImages.set(className, image);
  }
  return image;
}
