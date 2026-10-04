// Port of items/Heap.java (data only for now).
import type { Item } from './Item';

export type HeapType =
  'HEAP' | 'FOR_SALE' | 'CHEST' | 'LOCKED_CHEST' | 'CRYSTAL_CHEST' | 'TOMB' | 'SKELETON' | 'MIMIC' | 'HIDDEN';

export class Heap {
  type: HeapType = 'HEAP';
  pos = 0;
  items: Item[] = [];

  drop(item: Item): void {
    this.items.unshift(item);
  }

  peek(): Item | undefined {
    return this.items[0];
  }

  size(): number {
    return this.items.length;
  }

  /** Port of Heap.image(): the item sprite shown for this heap. */
  image(): number {
    switch (this.type) {
      case 'HEAP':
      case 'FOR_SALE':
        return this.items[0]?.image ?? 0;
      case 'CHEST':
      case 'MIMIC':
        return ItemSpriteSheet.CHEST;
      case 'LOCKED_CHEST':
        return ItemSpriteSheet.LOCKED_CHEST;
      case 'CRYSTAL_CHEST':
        return ItemSpriteSheet.CRYSTAL_CHEST;
      case 'TOMB':
        return ItemSpriteSheet.TOMB;
      case 'SKELETON':
        return ItemSpriteSheet.BONES;
      case 'HIDDEN':
        return ItemSpriteSheet.SMTH;
    }
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}

const ItemSpriteSheet = { BONES: 0, CHEST: 11, LOCKED_CHEST: 12, TOMB: 13, CRYSTAL_CHEST: 105, SMTH: 127 };
