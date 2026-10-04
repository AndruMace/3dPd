// Ports of items/keys/*.
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Dungeon } from '../Dungeon';
import type { Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import type { Bag } from './bags';
import { Item } from './Item';

export abstract class Key extends Item {
  static readonly TIME_TO_UNLOCK = 1;
  depth: number;

  constructor() {
    super();
    this.stackable = false;
    this.depth = Dungeon.depth;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('depth', this.depth);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.depth = bundle.getInt('depth');
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  status(): string {
    return `${this.depth}\u007f`;
  }
}

export class IronKey extends Key {
  static curDepthQuantity = 0;

  constructor() {
    super();
    this.name = 'iron key';
    this.image = ItemSpriteSheet.IRON_KEY;
  }

  collect(bag?: Bag): boolean {
    const result = super.collect(bag);
    if (result && this.depth === Dungeon.depth && Dungeon.hero) Dungeon.hero.belongings.countIronKeys();
    return result;
  }

  onDetach(): void {
    if (this.depth === Dungeon.depth) Dungeon.hero.belongings.countIronKeys();
  }

  toString(): string {
    return `iron key from depth ${this.depth}`;
  }

  info(): string {
    return 'The notches on this ancient iron key are well worn; its leather lanyard is battered by age. What door might it open?';
  }
}

export class GoldenKey extends Key {
  constructor() {
    super();
    this.name = 'golden key';
    this.image = ItemSpriteSheet.GOLDEN_KEY;
  }

  info(): string {
    return 'The notches on this golden key are tiny and intricate. Maybe it can open some chest lock?';
  }
}

export class SkeletonKey extends Key {
  constructor() {
    super();
    this.name = 'skeleton key';
    this.image = ItemSpriteSheet.SKELETON_KEY;
  }

  info(): string {
    return 'This key looks serious: its head is shaped like a skull. Probably it can open some serious door.';
  }
}

registerClass('Key', Key);
for (const [name, cls] of Object.entries({ IronKey, GoldenKey, SkeletonKey })) registerClass(name, cls);
