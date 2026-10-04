// Port of items/ItemStatusHandler.java: the per-run random appearances (potion colours, scroll runes, ring gems,
// wand woods) of unidentified item kinds, and which kinds are known.
import { Bundle, classNameOf } from '../core/Bundle';
import { Random } from '../core/Random';
import type { Item } from './Item';

type ItemClass = abstract new () => Item;

export class ItemStatusHandler {
  private readonly images = new Map<ItemClass, number>();
  private readonly labels = new Map<ItemClass, string>();
  private readonly knownSet = new Set<ItemClass>();

  constructor(
    private readonly items: ItemClass[],
    allLabels: string[],
    allImages: number[],
    bundle?: Bundle,
  ) {
    const labelsLeft = [...allLabels];
    const imagesLeft = [...allImages];
    for (const item of items) {
      const name = classNameOf(item.prototype);
      if (bundle && bundle.contains(name + '_label')) {
        const label = bundle.getString(name + '_label');
        this.labels.set(item, label);
        labelsLeft.splice(labelsLeft.indexOf(label), 1);
        const image = bundle.getInt(name + '_image');
        this.images.set(item, image);
        imagesLeft.splice(imagesLeft.indexOf(image), 1);
        if (bundle.getBoolean(name + '_known')) this.knownSet.add(item);
      } else {
        const index = Random.Int(labelsLeft.length);
        this.labels.set(item, labelsLeft[index]);
        labelsLeft.splice(index, 1);
        this.images.set(item, imagesLeft[index]);
        imagesLeft.splice(index, 1);
      }
    }
  }

  save(bundle: Bundle): void {
    for (const item of this.items) {
      const name = classNameOf(item.prototype);
      bundle.put(name + '_image', this.images.get(item)!);
      bundle.put(name + '_label', this.labels.get(item)!);
      bundle.put(name + '_known', this.knownSet.has(item));
    }
  }

  private classOf(item: Item): ItemClass {
    return item.constructor as ItemClass;
  }

  image(item: Item): number {
    return this.images.get(this.classOf(item)) ?? 0;
  }

  label(item: Item): string {
    return this.labels.get(this.classOf(item)) ?? '';
  }

  isKnown(item: Item): boolean {
    return this.knownSet.has(this.classOf(item));
  }

  know(item: Item): void {
    this.knownSet.add(this.classOf(item));
    if (this.knownSet.size === this.items.length - 1) {
      for (const i of this.items) {
        if (!this.knownSet.has(i)) {
          this.knownSet.add(i);
          break;
        }
      }
    }
  }

  known(): Set<ItemClass> {
    return this.knownSet;
  }

  unknown(): Set<ItemClass> {
    return new Set(this.items.filter((i) => !this.knownSet.has(i)));
  }

  allKnown(): boolean {
    return this.knownSet.size === this.items.length;
  }
}
