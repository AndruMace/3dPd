// Port of items/potions/Potion.java (base). Concrete potions live in potions.ts.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Sample } from '../../core/fx';
import { UI } from '../../core/ui';
import { Terrain } from '../../levels/Terrain';
import { Item } from '../Item';
import { ItemStatusHandler } from '../ItemStatusHandler';

const TIME_TO_DRINK = 1;

const colors = [
  'turquoise',
  'crimson',
  'azure',
  'jade',
  'golden',
  'magenta',
  'charcoal',
  'ivory',
  'amber',
  'bistre',
  'indigo',
  'silver',
];
const images = [
  ItemSpriteSheet.POTION_TURQUOISE,
  ItemSpriteSheet.POTION_CRIMSON,
  ItemSpriteSheet.POTION_AZURE,
  ItemSpriteSheet.POTION_JADE,
  ItemSpriteSheet.POTION_GOLDEN,
  ItemSpriteSheet.POTION_MAGENTA,
  ItemSpriteSheet.POTION_CHARCOAL,
  ItemSpriteSheet.POTION_IVORY,
  ItemSpriteSheet.POTION_AMBER,
  ItemSpriteSheet.POTION_BISTRE,
  ItemSpriteSheet.POTION_INDIGO,
  ItemSpriteSheet.POTION_SILVER,
];

let potionClasses: (abstract new () => Potion)[] = [];
let handler: ItemStatusHandler | null = null;

/** Potions that are better thrown than drunk, and vice versa (for the "are you sure?" prompts). */
export type PotionKind = 'harmful' | 'beneficial' | 'neutral';

export abstract class Potion extends Item {
  static readonly AC_DRINK = 'DRINK';
  private color: string;

  /** Called once by potions.ts with the classes in the original order. */
  static setClasses(classes: (abstract new () => Potion)[]): void {
    potionClasses = classes;
  }

  static initColors(): void {
    handler = new ItemStatusHandler(potionClasses, colors, images);
  }

  static save(bundle: Bundle): void {
    handler!.save(bundle);
  }

  static restore(bundle: Bundle): void {
    handler = new ItemStatusHandler(potionClasses, colors, images, bundle);
  }

  private static get handler(): ItemStatusHandler {
    if (!handler) Potion.initColors();
    return handler!;
  }

  constructor() {
    super();
    this.stackable = true;
    this.defaultAction = Potion.AC_DRINK;
    this.image = Potion.handler.image(this);
    this.color = Potion.handler.label(this);
  }

  categoryOrder(): number {
    return 2;
  }

  /** Which confirmation the original asks for when drinking/throwing a known potion of this kind. */
  protected kind(): PotionKind {
    return 'neutral';
  }

  actions(hero: Hero): string[] {
    return [...super.actions(hero), Potion.AC_DRINK];
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== Potion.AC_DRINK) {
      super.execute(hero, action);
      return;
    }
    if (this.isKnown() && this.kind() === 'harmful') {
      UI.options(
        'Harmful potion!',
        'Are you sure you want to drink it? In most cases you should throw such potions at your enemies.',
        ["Yes, I know what I'm doing", 'No, I changed my mind'],
        (index) => {
          if (index === 0) this.drink(hero);
        },
      );
    } else {
      this.drink(hero);
    }
  }

  doThrow(hero: Hero): void {
    if (this.isKnown() && this.kind() === 'beneficial') {
      UI.options(
        'Beneficial potion',
        'Are you sure you want to throw it? In most cases it makes sense to drink it.',
        ["Yes, I know what I'm doing", 'No, I changed my mind'],
        (index) => {
          if (index === 0) super.doThrow(hero);
        },
      );
    } else {
      super.doThrow(hero);
    }
  }

  protected drink(hero: Hero): void {
    this.detach(hero.belongings.backpack);
    hero.spend(TIME_TO_DRINK);
    hero.busy();
    this.onThrow(hero.pos);
    Sample.play(Assets.SND_DRINK);
    Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
  }

  protected onThrow(cell: number): void {
    if (Dungeon.hero.pos === cell) this.apply(Dungeon.hero);
    else if (Dungeon.level.map[cell] === Terrain.WELL || Dungeon.level.pit[cell]) super.onThrow(cell);
    else this.shatter(cell);
  }

  protected apply(hero: Hero): void {
    this.shatter(hero.pos);
  }

  shatter(cell: number): void {
    if (Dungeon.visible[cell]) {
      GLog.i(`The flask shatters and ${this.colorName()} liquid splashes harmlessly`);
      Sample.play(Assets.SND_SHATTER);
      this.splash(cell);
    }
  }

  isKnown(): boolean {
    return Potion.handler.isKnown(this);
  }

  setKnown(): void {
    if (!this.isKnown()) Potion.handler.know(this);
    Badges.validateAllPotionsIdentified();
  }

  identify(): this {
    this.setKnown();
    return this;
  }

  protected colorName(): string {
    return this.color;
  }

  name_(): string {
    return this.isKnown() ? this.name : `${this.color} potion`;
  }

  info(): string {
    return this.isKnown()
      ? this.desc()
      : `This flask contains a swirling ${this.color} liquid. Who knows what it will do when drunk or thrown?`;
  }

  isIdentified(): boolean {
    return this.isKnown();
  }

  isUpgradable(): boolean {
    return false;
  }

  static getKnown(): Set<abstract new () => Item> {
    return Potion.handler.known();
  }

  static getUnknown(): Set<abstract new () => Item> {
    return Potion.handler.unknown();
  }

  static allKnown(): boolean {
    return Potion.handler.allKnown();
  }

  /** Splash in the potion's colour (PD samples the item sprite's pixel at 8,10). */
  protected splash(cell: number): void {
    Events.emit({ type: 'fx', fx: 'itemSplash', pos: cell, v: this.image, n: 5 });
  }

  price(): number {
    return 20 * this.quantity;
  }
}

registerClass('Potion', Potion);
