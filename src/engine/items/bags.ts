// Ports of items/bags/*.
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Badges } from '../Badges';
import { Dungeon } from '../Dungeon';
import type { Char } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import type { Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { lazy } from '../core/lazy';
import { UI } from '../core/ui';
import { Item } from './Item';

const lazyHeroBackpack = (): Bag => Dungeon.hero.belongings.backpack;

export class Bag extends Item {
  static readonly AC_OPEN = 'OPEN';

  owner: Char | null = null;
  items: Item[] = [];
  size = 1;

  constructor() {
    super();
    this.image = 11;
    this.defaultAction = Bag.AC_OPEN;
  }

  isBag(): this is Bag {
    return true;
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Bag.AC_OPEN) UI.selectItem('ALL', this.name_(), () => {});
    else super.execute(hero, action);
  }

  collect(container?: Bag): boolean {
    if (super.collect(container)) {
      container ??= lazyHeroBackpack();
      this.owner = container.owner;
      for (const item of [...container.items]) {
        if (this.grab(item)) {
          item.detachAll(container);
          item.collect(this);
        }
      }
      Badges.validateAllBagsBought(this);
      return true;
    }
    return false;
  }

  onDetach(): void {
    this.owner = null;
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  clear(): void {
    this.items = [];
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('inventory', this.items);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    for (const item of bundle.getCollection<Item>('inventory')) item.collect(this);
  }

  contains(item: Item): boolean {
    for (const i of this.items) {
      if (i === item) return true;
      if (i.isBag() && i.contains(item)) return true;
    }
    return false;
  }

  grab(_item: Item): boolean {
    return false;
  }

  /** All items, recursing into nested bags (Bag's iterator). */
  *all(): IterableIterator<Item> {
    for (const item of this.items) {
      yield item;
      if (item.isBag()) yield* item.all();
    }
  }
}

/** Hero's main backpack (an anonymous Bag subclass in PD). */
export class Backpack extends Bag {
  static readonly SIZE = 19;
  constructor() {
    super();
    this.name = 'backpack';
    this.size = Backpack.SIZE;
  }
}

export class SeedPouch extends Bag {
  constructor() {
    super();
    this.name = 'seed pouch';
    this.image = ItemSpriteSheet.POUCH;
    this.size = 8;
  }
  grab(item: Item): boolean {
    const K = lazy<abstract new () => Item>('Plant.Seed');
    return item instanceof K;
  }
  price(): number {
    return 50;
  }
  info(): string {
    return 'This small velvet pouch allows you to store any number of seeds in it. Very convenient.';
  }
}

export class ScrollHolder extends Bag {
  constructor() {
    super();
    this.name = 'scroll holder';
    this.image = ItemSpriteSheet.HOLDER;
    this.size = 12;
  }
  grab(item: Item): boolean {
    const K = lazy<abstract new () => Item>('Scroll');
    return item instanceof K;
  }
  price(): number {
    return 50;
  }
  info(): string {
    return 'You can place any number of scrolls into this tubular container. It saves room in your backpack and protects scrolls from fire.';
  }
}

export class WandHolster extends Bag {
  constructor() {
    super();
    this.name = 'wand holster';
    this.image = ItemSpriteSheet.HOLSTER;
    this.size = 12;
  }
  grab(item: Item): boolean {
    const K = lazy<abstract new () => Item>('Wand');
    return item instanceof K;
  }
  collect(container?: Bag): boolean {
    if (super.collect(container)) {
      if (this.owner) for (const item of this.items) (item as Item & { charge(c: Char): void }).charge(this.owner);
      return true;
    }
    return false;
  }
  onDetach(): void {
    for (const item of this.items) (item as Item & { stopCharging(): void }).stopCharging();
  }
  price(): number {
    return 50;
  }
  info(): string {
    return `This slim holder is made of leather of some exotic animal. It allows to compactly carry up to ${this.size} wands.`;
  }
}

export class Keyring extends Bag {
  constructor() {
    super();
    this.name = 'key ring';
    this.image = ItemSpriteSheet.KEYRING;
    this.size = 12;
  }
  grab(item: Item): boolean {
    const K = lazy<abstract new () => Item>('Key');
    return item instanceof K;
  }
  price(): number {
    return 50;
  }
  info(): string {
    return 'This is a copper key ring, that lets you keep all your keys separately from the rest of your belongings.';
  }
}

for (const [name, cls] of Object.entries({ Bag, Backpack, SeedPouch, ScrollHolder, WandHolster, Keyring })) {
  registerClass(name, cls);
}
