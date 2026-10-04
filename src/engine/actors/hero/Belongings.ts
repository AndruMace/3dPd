// Port of actors/hero/Belongings.java.
import { Dungeon } from '../../Dungeon';
import type { Bundle } from '../../core/Bundle';
import { Random } from '../../core/Random';
import type { Armor } from '../../items/armor/Armor';
import { Backpack } from '../../items/bags';
import type { Item } from '../../items/Item';
import { IronKey, Key } from '../../items/keys';
import type { KindOfWeapon } from '../../items/KindOfWeapon';
import type { Ring } from '../../items/rings/rings';
import { ScrollOfRemoveCurse } from '../../items/scrolls/scrolls';
import { Wand } from '../../items/wands/Wand';
import type { Hero } from './Hero';

export class Belongings {
  static readonly BACKPACK_SIZE = 19;

  readonly backpack = new Backpack();
  weapon: KindOfWeapon | null = null;
  armor: Armor | null = null;
  ring1: Ring | null = null;
  ring2: Ring | null = null;

  constructor(private readonly owner: Hero) {
    this.backpack.owner = owner;
  }

  storeInBundle(bundle: Bundle): void {
    this.backpack.storeInBundle(bundle);
    bundle.put('weapon', this.weapon);
    bundle.put('armor', this.armor);
    bundle.put('ring1', this.ring1);
    bundle.put('ring2', this.ring2);
  }

  restoreFromBundle(bundle: Bundle): void {
    this.backpack.clear();
    this.backpack.restoreFromBundle(bundle);
    this.weapon = bundle.get<KindOfWeapon>('weapon');
    this.weapon?.activate(this.owner);
    this.armor = bundle.get<Armor>('armor');
    this.ring1 = bundle.get<Ring>('ring1');
    this.ring1?.activate(this.owner);
    this.ring2 = bundle.get<Ring>('ring2');
    this.ring2?.activate(this.owner);
  }

  getItem<T extends Item>(itemClass: abstract new (...args: never[]) => T): T | null {
    for (const item of this.all()) if (item instanceof itemClass) return item as T;
    return null;
  }

  getKey<T extends Key>(kind: abstract new () => T, depth: number): T | null {
    for (const item of this.backpack.all())
      if (item.constructor === kind && (item as Key).depth === depth) return item as T;
    return null;
  }

  countIronKeys(): void {
    IronKey.curDepthQuantity = 0;
    for (const item of this.backpack.all())
      if (item instanceof IronKey && item.depth === Dungeon.depth) IronKey.curDepthQuantity++;
  }

  identify(): void {
    for (const item of this.all()) item.identify();
  }

  observe(): void {
    for (const item of [this.weapon, this.armor, this.ring1, this.ring2]) item?.identify();
    for (const item of this.backpack.all()) item.cursedKnown = true;
  }

  uncurseEquipped(): void {
    ScrollOfRemoveCurse.uncurse(this.owner, this.armor, this.weapon, this.ring1, this.ring2);
  }

  randomUnequipped(): Item | null {
    return Random.element(this.backpack.items);
  }

  resurrect(depth: number): void {
    for (const item of [...this.backpack.items]) {
      if (item instanceof Key) {
        if (item.depth === depth) item.detachAll(this.backpack);
      } else if (item.unique) {
        // keep unique items
      } else if (!item.isEquipped(this.owner)) {
        item.detachAll(this.backpack);
      }
    }
    if (this.weapon) {
      this.weapon.cursed = false;
      this.weapon.activate(this.owner);
    }
    if (this.armor) this.armor.cursed = false;
    for (const ring of [this.ring1, this.ring2]) {
      if (ring) {
        ring.cursed = false;
        ring.activate(this.owner);
      }
    }
  }

  charge(full: boolean): number {
    let count = 0;
    for (const item of this.all()) {
      if (item instanceof Wand && item.curCharges < item.maxCharges) {
        item.curCharges = full ? item.maxCharges : item.curCharges + 1;
        count++;
      }
    }
    return count;
  }

  discharge(): number {
    let count = 0;
    for (const item of this.all()) {
      if (item instanceof Wand && item.curCharges > 0) {
        item.curCharges--;
        count++;
      }
    }
    return count;
  }

  /** Equipped items, then the backpack (recursively). */
  *all(): IterableIterator<Item> {
    for (const item of [this.weapon, this.armor, this.ring1, this.ring2]) if (item) yield item;
    yield* this.backpack.all();
  }
}
