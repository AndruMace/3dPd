// Ports of items/scrolls/Scroll.java and InventoryScroll.java (bases). Concrete scrolls live in scrolls.ts.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Blindness, Invisibility } from '../../actors/buffs/buffs';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Sample } from '../../core/fx';
import { UI, type ItemSelectorMode } from '../../core/ui';
import { Item } from '../Item';
import { ItemStatusHandler } from '../ItemStatusHandler';

const runes = [
  'KAUNAN',
  'SOWILO',
  'LAGUZ',
  'YNGVI',
  'GYFU',
  'RAIDO',
  'ISAZ',
  'MANNAZ',
  'NAUDIZ',
  'BERKANAN',
  'ODAL',
  'TIWAZ',
];
const images = [
  ItemSpriteSheet.SCROLL_KAUNAN,
  ItemSpriteSheet.SCROLL_SOWILO,
  ItemSpriteSheet.SCROLL_LAGUZ,
  ItemSpriteSheet.SCROLL_YNGVI,
  ItemSpriteSheet.SCROLL_GYFU,
  ItemSpriteSheet.SCROLL_RAIDO,
  ItemSpriteSheet.SCROLL_ISAZ,
  ItemSpriteSheet.SCROLL_MANNAZ,
  ItemSpriteSheet.SCROLL_NAUDIZ,
  ItemSpriteSheet.SCROLL_BERKANAN,
  ItemSpriteSheet.SCROLL_ODAL,
  ItemSpriteSheet.SCROLL_TIWAZ,
];

let scrollClasses: (abstract new () => Scroll)[] = [];
let handler: ItemStatusHandler | null = null;

export abstract class Scroll extends Item {
  static readonly AC_READ = 'READ';
  protected static readonly TIME_TO_READ = 1;

  private rune: string;
  /** The reader (curUser in PD). */
  protected curUser!: Hero;

  static setClasses(classes: (abstract new () => Scroll)[]): void {
    scrollClasses = classes;
  }

  static initLabels(): void {
    handler = new ItemStatusHandler(scrollClasses, runes, images);
  }

  static save(bundle: Bundle): void {
    handler!.save(bundle);
  }

  static restore(bundle: Bundle): void {
    handler = new ItemStatusHandler(scrollClasses, runes, images, bundle);
  }

  private static get handler(): ItemStatusHandler {
    if (!handler) Scroll.initLabels();
    return handler!;
  }

  constructor() {
    super();
    this.stackable = true;
    this.defaultAction = Scroll.AC_READ;
    this.image = Scroll.handler.image(this);
    this.rune = Scroll.handler.label(this);
  }

  categoryOrder(): number {
    return 3;
  }

  actions(hero: Hero): string[] {
    return [...super.actions(hero), Scroll.AC_READ];
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== Scroll.AC_READ) {
      super.execute(hero, action);
      return;
    }
    if (hero.buff(Blindness) !== null) {
      GLog.w("You can't read a scroll while blinded");
    } else {
      const item = this.detach(hero.belongings.backpack) as Scroll;
      item.curUser = hero;
      item.doRead();
    }
  }

  protected abstract doRead(): void;

  readAnimation(): void {
    this.curUser.spend(Scroll.TIME_TO_READ);
    this.curUser.busy();
    Events.emit({ type: 'anim', id: this.curUser.id(), anim: 'read' });
  }

  isKnown(): boolean {
    return Scroll.handler.isKnown(this);
  }

  setKnown(): void {
    if (!this.isKnown()) Scroll.handler.know(this);
    Badges.validateAllScrollsIdentified();
  }

  identify(): this {
    this.setKnown();
    return super.identify();
  }

  name_(): string {
    return this.isKnown() ? this.name : `scroll "${this.rune}"`;
  }

  info(): string {
    return this.isKnown()
      ? this.desc()
      : `This parchment is covered with indecipherable writing, and bears a title of rune ${this.rune}. Who knows what it will do when read aloud?`;
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return this.isKnown();
  }

  static getKnown(): Set<abstract new () => Item> {
    return Scroll.handler.known();
  }

  static getUnknown(): Set<abstract new () => Item> {
    return Scroll.handler.unknown();
  }

  static allKnown(): boolean {
    return Scroll.handler.allKnown();
  }

  price(): number {
    return 15 * this.quantity;
  }
}

export abstract class InventoryScroll extends Scroll {
  protected inventoryTitle = 'Select an item';
  protected mode: ItemSelectorMode = 'ALL';
  private identifiedByUse = false;

  protected doRead(): void {
    if (!this.isKnown()) {
      this.setKnown();
      this.identifiedByUse = true;
    } else {
      this.identifiedByUse = false;
    }
    this.select();
  }

  private select(): void {
    UI.selectItem(this.mode, this.inventoryTitle, (item) => {
      if (item !== null) {
        this.onItemSelected(item);
        this.readAnimation();
        Sample.play(Assets.SND_READ);
        Invisibility.dispel();
      } else if (this.identifiedByUse) {
        this.confirmCancelation();
      } else {
        this.collect(this.curUser.belongings.backpack);
      }
    });
  }

  private confirmCancelation(): void {
    UI.options(
      this.name_(),
      'Do you really want to cancel this scroll usage? It will be consumed anyway.',
      ["Yes, I'm positive", 'No, I changed my mind'],
      (index) => {
        if (index === 0) {
          this.curUser.spendAndNext(Scroll.TIME_TO_READ);
          this.identifiedByUse = false;
        } else {
          this.select();
        }
      },
      false,
    );
  }

  protected abstract onItemSelected(item: Item): void;
}

registerClass('Scroll', Scroll);
registerClass('InventoryScroll', InventoryScroll);
