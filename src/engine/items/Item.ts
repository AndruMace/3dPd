// Port of items/Item.java.
import { Assets } from '../../content/generated/Assets';
import { Badges } from '../Badges';
import { Dungeon } from '../Dungeon';
import { QuickSlot } from '../QuickSlot';
import type { Hero } from '../actors/hero/Hero';
import { Actor } from '../actors/Actor';
import { SnipersMark } from '../actors/buffs/buffs';
import type { Bundlable, Bundle } from '../core/Bundle';
import { classNameOf } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { UI } from '../core/ui';
import { Ballistica } from '../mechanics/Ballistica';
import type { Bag } from './bags';

/** ItemSprite.Glowing colour, or null. */
export type Glowing = number | null;

export abstract class Item implements Bundlable {
  static readonly TIME_TO_THROW = 1.0;
  static readonly TIME_TO_PICK_UP = 1.0;
  static readonly TIME_TO_DROP = 0.5;

  static readonly AC_DROP = 'DROP';
  static readonly AC_THROW = 'THROW';

  /** Stable id for the UI to refer to this item (not in the original). */
  readonly uid: number = Dungeon.nextItemId++;

  defaultAction: string | null = null;

  protected name = 'smth';
  protected image = 0;

  stackable = false;
  quantity = 1;

  private _level = 0;
  private _durability = 1;
  levelKnown = false;
  cursed = false;
  cursedKnown = false;
  unique = false;

  constructor() {
    this._durability = this.maxDurability();
  }

  /** Generator.Category.order: sort position in the backpack. */
  categoryOrder(): number {
    return 9;
  }

  /** Same item kind (PD compares getClass()). */
  sameKind(other: Item): boolean {
    return this.constructor === other.constructor;
  }

  actions(_hero: Hero): string[] {
    return [Item.AC_DROP, Item.AC_THROW];
  }

  doPickUp(hero: Hero): boolean {
    if (this.collect(hero.belongings.backpack)) {
      Events.emit({ type: 'pickUp', image: this.imageIndex() });
      Sample.play(Assets.SND_ITEM);
      hero.spendAndNext(Item.TIME_TO_PICK_UP);
      return true;
    }
    return false;
  }

  doDrop(hero: Hero): void {
    hero.spendAndNext(Item.TIME_TO_DROP);
    Dungeon.level.drop(this.detachAll(hero.belongings.backpack), hero.pos).dropFX(hero.pos);
  }

  doThrow(hero: Hero): void {
    UI.selectCell('Choose direction of throw', (target) => {
      if (target !== null) this.cast(hero, target);
    });
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Item.AC_DROP) this.doDrop(hero);
    else if (action === Item.AC_THROW) this.doThrow(hero);
  }

  protected onThrow(cell: number): void {
    const heap = Dungeon.level.drop(this, cell);
    if (!heap.isEmpty()) heap.dropFX(cell);
  }

  collect(container: Bag = Dungeon.hero.belongings.backpack): boolean {
    const items = container.items;
    if (items.includes(this)) return true;

    for (const item of items) {
      if (item.isBag() && item.grab(this)) return this.collect(item);
    }

    if (this.stackable) {
      for (const item of items) {
        if (item.sameKind(this)) {
          item.quantity += this.quantity;
          return true;
        }
      }
    }

    if (items.length < container.size) {
      if (Dungeon.hero && Dungeon.hero.isAlive()) Badges.validateItemLevelAquired(this);
      items.push(this);
      items.sort((a, b) => a.categoryOrder() - b.categoryOrder());
      return true;
    }
    GLog.n(`Your pack is too full for the ${this.name_()}`);
    return false;
  }

  isBag(): this is Bag {
    return false;
  }

  /** Takes one of this stack out of `container` (or the whole item if it's the last). */
  detach(container: Bag | null): Item | null {
    if (this.quantity <= 0) return null;
    if (this.quantity === 1) return container ? this.detachAll(container) : this;
    this.quantity--;
    const detached = new (this.constructor as new () => Item)();
    detached.onDetach();
    return detached;
  }

  detachAll(container: Bag): Item {
    const items = container.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item === this) {
        items.splice(i, 1);
        item.onDetach();
        return this;
      } else if (item.isBag() && item.contains(this)) {
        return this.detachAll(item);
      }
    }
    return this;
  }

  onDetach(): void {}

  level(): number {
    return this._level;
  }

  setLevel(value: number): void {
    this._level = value;
  }

  effectiveLevel(): number {
    return this.isBroken() ? 0 : this._level;
  }

  upgrade(n = 1): Item {
    for (let i = 0; i < n; i++) this.upgradeOnce();
    return this;
  }

  protected upgradeOnce(): void {
    this.cursed = false;
    this.cursedKnown = true;
    this._level++;
    this.fix();
  }

  degrade(n = 1): Item {
    for (let i = 0; i < n; i++) this.degradeOnce();
    return this;
  }

  protected degradeOnce(): void {
    this._level--;
    this.fix();
  }

  use(): void {
    if (this._level > 0 && !this.isBroken()) {
      const threshold = Math.trunc(this.maxDurability() * (1 / 6));
      if (this._durability-- >= threshold && threshold > this._durability && this.levelKnown) {
        GLog.w(`Because of frequent use, your ${this.name_()} is going to break soon.`);
      }
      if (this.isBroken()) {
        this.getBroken();
        if (this.levelKnown) {
          GLog.n(`Because of frequent use, your ${this.name_()} has broken.`);
          Dungeon.hero.interrupt();
          Fx.burst('degradation', { id: Dungeon.hero.id() }, 1);
          Sample.play(Assets.SND_DEGRADE);
        }
      }
    }
  }

  isBroken(): boolean {
    return this._durability <= 0;
  }

  getBroken(): void {}

  fix(): void {
    this._durability = this.maxDurability();
  }

  polish(): void {
    if (this._durability < this.maxDurability()) this._durability++;
  }

  durability(): number {
    return this._durability;
  }

  protected setDurability(value: number): void {
    this._durability = value;
  }

  maxDurability(_lvl: number = this._level): number {
    return 1;
  }

  visiblyUpgraded(): number {
    return this.levelKnown ? this._level : 0;
  }

  visiblyCursed(): boolean {
    return this.cursed && this.cursedKnown;
  }

  visiblyBroken(): boolean {
    return this.levelKnown && this.isBroken();
  }

  isUpgradable(): boolean {
    return true;
  }

  isIdentified(): boolean {
    return this.levelKnown && this.cursedKnown;
  }

  isEquipped(_hero: Hero): boolean {
    return false;
  }

  identify(): this {
    this.levelKnown = true;
    this.cursedKnown = true;
    return this;
  }

  static evoke(hero: Hero): void {
    Fx.burst('Speck.EVOKE', { id: hero.id() }, 5);
  }

  toString(): string {
    const name = this.name_();
    if (this.levelKnown && this._level !== 0) {
      const lvl = (this._level > 0 ? '+' : '') + this._level;
      return this.quantity > 1 ? `${name}${lvl} x${this.quantity}` : `${name}${lvl}`;
    }
    return this.quantity > 1 ? `${name} x${this.quantity}` : name;
  }

  /** Item.name() in PD (named name_ here because `name` is the field). */
  name_(): string {
    return this.name;
  }

  trueName(): string {
    return this.name;
  }

  imageIndex(): number {
    return this.image;
  }

  glowing(): Glowing {
    return null;
  }

  info(): string {
    return this.desc();
  }

  desc(): string {
    return '';
  }

  price(): number {
    return 0;
  }

  considerState(price: number): number {
    if (this.cursed && this.cursedKnown) price = Math.trunc(price / 2);
    if (this.levelKnown) {
      if (this._level > 0) {
        price *= this._level + 1;
        if (this.isBroken()) price = Math.trunc(price / 2);
      } else if (this._level < 0) {
        price = Math.trunc(price / (1 - this._level));
      }
    }
    return price < 1 ? 1 : price;
  }

  static virtual<T extends Item>(cl: new () => T): T {
    const item = new cl();
    item.quantity = 0;
    return item;
  }

  random(): Item {
    return this;
  }

  status(): string | null {
    return this.quantity !== 1 ? String(this.quantity) : null;
  }

  storeInBundle(bundle: Bundle): void {
    bundle.put('quantity', this.quantity);
    bundle.put('level', this._level);
    bundle.put('levelKnown', this.levelKnown);
    bundle.put('cursed', this.cursed);
    bundle.put('cursedKnown', this.cursedKnown);
    if (this.isUpgradable()) bundle.put('durability', this._durability);
    const slot = this.stackable ? classNameOf(this) : this;
    if (QuickSlot.primaryValue === slot) bundle.put('quickslot', true);
    if (QuickSlot.secondaryValue === slot) bundle.put('quickslot2', true);
  }

  restoreFromBundle(bundle: Bundle): void {
    this.quantity = bundle.getInt('quantity');
    this.levelKnown = bundle.getBoolean('levelKnown');
    this.cursedKnown = bundle.getBoolean('cursedKnown');
    const level = bundle.getInt('level');
    if (level > 0) this.upgrade(level);
    else if (level < 0) this.degrade(-level);
    this.cursed = bundle.getBoolean('cursed');
    if (this.isUpgradable()) this._durability = bundle.getInt('durability');
    const slot = this.stackable ? classNameOf(this) : this;
    if (bundle.getBoolean('quickslot')) QuickSlot.primaryValue = slot;
    if (bundle.getBoolean('quickslot2')) QuickSlot.secondaryValue = slot;
  }

  /** Throw this item at `dst`: it flies along a Ballistica path and lands (or hits) where it stops. */
  cast(user: Hero, dst: number): void {
    const cell = Ballistica.cast(user.pos, dst, false, true);
    Events.emit({ type: 'anim', id: user.id(), anim: 'zap', target: cell });
    user.busy();
    Sample.play(Assets.SND_MISS);

    const enemy = Actor.findChar(cell);
    QuickSlot.lastTarget = enemy ? enemy.pos : -1;

    let delay = Item.TIME_TO_THROW;
    if (this.isMissileWeapon()) {
      delay *= (this as unknown as { speedFactor(h: Hero): number }).speedFactor(user);
      if (enemy) {
        const mark = user.buff(SnipersMark);
        if (mark) {
          if (mark.object === enemy.id()) delay *= 0.5;
          user.remove(mark);
        }
      }
    }

    Events.emit({ type: 'missile', from: user.pos, to: cell, image: this.imageIndex() });
    this.detach(user.belongings.backpack)!.onThrow(cell);
    user.spendAndNext(delay);
  }

  isMissileWeapon(): boolean {
    return false;
  }
}
