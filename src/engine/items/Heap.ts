// Port of items/Heap.java: a pile of items (or chest, tomb, bones) on a cell.
import { Assets } from '../../content/generated/Assets';
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Badges } from '../Badges';
import { Dungeon, Statistics } from '../Dungeon';
import { Buff } from '../actors/buffs/Buff';
import { burnFX, Burning, Frost } from '../actors/buffs/buffs';
import type { Char } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import type { Bundlable, Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { isA, lazy } from '../core/lazy';
import { Random } from '../core/Random';
import type { Item } from './Item';

const SEEDS_TO_POTION = 3;

export type HeapType =
  'HEAP' | 'FOR_SALE' | 'CHEST' | 'LOCKED_CHEST' | 'CRYSTAL_CHEST' | 'TOMB' | 'SKELETON' | 'MIMIC' | 'HIDDEN';

interface MobSpawner {
  spawnAt(pos: number, items?: Item[]): Char | null;
  spawnAround(pos: number): void;
}

export class Heap implements Bundlable {
  type: HeapType = 'HEAP';
  pos = 0;
  items: Item[] = [];

  image(): number {
    switch (this.type) {
      case 'HEAP':
      case 'FOR_SALE':
        return this.size() > 0 ? this.items[0].imageIndex() : 0;
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
        return ItemSpriteSheet.HIDDEN;
    }
  }

  glowing(): number | null {
    return (this.type === 'HEAP' || this.type === 'FOR_SALE') && this.items.length > 0 ? this.items[0].glowing() : null;
  }

  /** Re-sends this heap's look to the view (ItemSprite.view / link in PD). */
  refresh(from?: number): void {
    if (!Dungeon.level || Dungeon.level.heaps.get(this.pos) !== this) return;
    Events.emit({ type: 'heap', pos: this.pos, image: this.image(), heapType: this.type, glow: this.glowing(), from });
  }

  /** ItemSprite.drop(): animate the heap's top item dropping from `from` (default: on the spot). */
  dropFX(from: number = this.pos): Heap {
    this.refresh(from);
    return this;
  }

  open(hero: Hero): void {
    switch (this.type) {
      case 'MIMIC':
        if (lazy<MobSpawner>('Mimic').spawnAt(this.pos, this.items) !== null) {
          GLog.n('This is a mimic!');
          this.destroy();
        } else {
          this.type = 'CHEST';
        }
        break;
      case 'TOMB':
        lazy<MobSpawner>('Wraith').spawnAround(hero.pos);
        break;
      case 'SKELETON':
        Fx.start('Speck.RATTLE', this.pos, 0.1, 3);
        for (const item of this.items) {
          if (item.cursed) {
            if (lazy<MobSpawner>('Wraith').spawnAt(this.pos) === null) {
              Fx.burst('ShadowParticle.CURSE', { id: hero.id() }, 6);
              hero.damage(Math.trunc(hero.HP / 2), this);
            }
            Sample.play(Assets.SND_CURSED);
            break;
          }
        }
        break;
      case 'HIDDEN':
        Fx.at('heapReveal', this.pos);
        break;
      default:
    }
    if (this.type !== 'MIMIC') {
      this.type = 'HEAP';
      this.dropFX();
    }
  }

  size(): number {
    return this.items.length;
  }

  pickUp(): Item {
    const item = this.items.shift()!;
    if (this.items.length === 0) this.destroy();
    else this.refresh();
    return item;
  }

  peek(): Item | undefined {
    return this.items[0];
  }

  drop(item: Item): void {
    if (item.stackable) {
      for (const i of this.items) {
        if (i.sameKind(item)) {
          i.quantity += item.quantity;
          item = i;
          break;
        }
      }
      const idx = this.items.indexOf(item);
      if (idx >= 0) this.items.splice(idx, 1);
    }
    if (isA(item, 'Dewdrop')) this.items.push(item);
    else this.items.unshift(item);
    this.refresh();
  }

  replace(a: Item, b: Item): void {
    const index = this.items.indexOf(a);
    if (index !== -1) this.items.splice(index, 1, b);
  }

  burn(): void {
    if (this.type === 'MIMIC') {
      const m = lazy<MobSpawner>('Mimic').spawnAt(this.pos, this.items);
      if (m) {
        Buff.affect(m, Burning).reignite(m);
        Fx.burst('FlameParticle', { id: m.id() }, 5);
        this.destroy();
      }
    }
    if (this.type !== 'HEAP') return;

    let burnt = false;
    let evaporated = false;
    for (const item of [...this.items]) {
      if (isA(item, 'Scroll')) {
        this.items.splice(this.items.indexOf(item), 1);
        burnt = true;
      } else if (isA(item, 'Dewdrop')) {
        this.items.splice(this.items.indexOf(item), 1);
        evaporated = true;
      } else if (isA(item, 'MysteryMeat')) {
        this.replace(item, lazy<{ cook(m: Item): Item }>('ChargrilledMeat').cook(item));
        burnt = true;
      }
    }

    if (burnt || evaporated) {
      if (Dungeon.visible[this.pos]) {
        if (burnt) burnFX(this.pos);
        else evaporateFX(this.pos);
      }
      if (this.isEmpty()) this.destroy();
      else this.refresh();
    }
  }

  freeze(): void {
    if (this.type === 'MIMIC') {
      const m = lazy<MobSpawner>('Mimic').spawnAt(this.pos, this.items);
      if (m) {
        Buff.prolong(m, Frost, Frost.duration(m) * Random.Float(1.0, 1.5));
        this.destroy();
      }
    }
    if (this.type !== 'HEAP') return;

    let frozen = false;
    for (const item of [...this.items]) {
      if (isA(item, 'MysteryMeat')) {
        this.replace(item, lazy<{ cook(m: Item): Item }>('FrozenCarpaccio').cook(item));
        frozen = true;
      }
    }
    if (frozen) {
      if (this.isEmpty()) this.destroy();
      else this.refresh();
    }
  }

  /** Three or more seeds in the alchemy pot brew a potion. */
  transmute(): Item | null {
    Fx.burst('Speck.BUBBLE', { pos: this.pos }, 3);
    Fx.splash(this.pos, 0xffffff, 3);

    const Seed = lazy<abstract new () => Item & { alchemyClass: (new () => Item) | null }>('Plant.Seed');
    const chances: number[] = [];
    let count = 0;
    for (const item of this.items) {
      if (item instanceof Seed) {
        count += item.quantity;
        chances.push(item.quantity);
      } else {
        count = 0;
        break;
      }
    }

    if (count < SEEDS_TO_POTION) return null;

    Fx.burst('Speck.WOOL', { pos: this.pos }, 6);
    Sample.play(Assets.SND_PUFF);
    const randomPotion = () => lazy<{ random(cat: string): Item }>('Generator').random('POTION');

    if (Random.Int(count) === 0) {
      Fx.burst('Speck.EVOKE', { pos: this.pos }, 3);
      this.destroy();
      Statistics.potionsCooked++;
      Badges.validatePotionsCooked();
      return randomPotion();
    }
    const proto = this.items[Random.chances(chances)] as InstanceType<typeof Seed>;
    const itemClass = proto.alchemyClass;
    this.destroy();
    Statistics.potionsCooked++;
    Badges.validatePotionsCooked();
    return itemClass === null ? randomPotion() : new itemClass();
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }

  destroy(): void {
    if (Dungeon.level.heaps.get(this.pos) === this) {
      Dungeon.level.heaps.delete(this.pos);
      Events.emit({ type: 'heap', pos: this.pos, image: -1, heapType: this.type, glow: null });
    }
    this.items = [];
  }

  storeInBundle(bundle: Bundle): void {
    bundle.put('pos', this.pos);
    bundle.put('type', this.type);
    bundle.put('items', this.items);
  }

  restoreFromBundle(bundle: Bundle): void {
    this.pos = bundle.getInt('pos');
    this.type = bundle.getEnum<HeapType>('type', 'HEAP');
    this.items = bundle.getCollection<Item>('items');
  }
}

export function evaporateFX(pos: number): void {
  Fx.burst('Speck.STEAM', { pos }, 5);
}

registerClass('Heap', Heap);
