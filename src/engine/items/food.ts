// Ports of items/food/*.
import { Assets } from '../../content/generated/Assets';
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Badges } from '../Badges';
import { Statistics } from '../Dungeon';
import { Buff } from '../actors/buffs/Buff';
import * as B from '../actors/buffs/buffs';
import type { Hero } from '../actors/hero/Hero';
import { registerClass } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { lazy } from '../core/lazy';
import { Random } from '../core/Random';
import { Item } from './Item';

export class Food extends Item {
  private static readonly TIME_TO_EAT = 3;
  static readonly AC_EAT = 'EAT';

  energy: number = B.Hunger.HUNGRY;
  message = 'That food tasted delicious!';

  constructor() {
    super();
    this.stackable = true;
    this.name = 'ration of food';
    this.image = ItemSpriteSheet.RATION;
  }

  categoryOrder(): number {
    return 7;
  }

  actions(hero: Hero): string[] {
    return [...super.actions(hero), Food.AC_EAT];
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== Food.AC_EAT) {
      super.execute(hero, action);
      return;
    }
    this.detach(hero.belongings.backpack);
    hero.buff(B.Hunger)!.satisfy(this.energy);
    GLog.i(this.message);

    switch (hero.heroClass) {
      case 'WARRIOR':
        if (hero.HP < hero.HT) {
          hero.heal(5);
          Fx.burst('Speck.HEALING', { id: hero.id() }, 1);
        }
        break;
      case 'MAGE':
        hero.belongings.charge(false);
        lazy<{ charge(h: Hero): void }>('ScrollOfRecharging').charge(hero);
        break;
      default:
        break;
    }

    Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
    hero.busy();
    Fx.burst('SpellSprite.FOOD', { id: hero.id() }, 1);
    Sample.play(Assets.SND_EAT);
    hero.spend(Food.TIME_TO_EAT);
    Statistics.foodEaten++;
    Badges.validateFoodEaten();
  }

  info(): string {
    return 'Nothing fancy here: dried meat, some biscuits - things like that.';
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  price(): number {
    return 10 * this.quantity;
  }
}

export class Pasty extends Food {
  constructor() {
    super();
    this.name = 'pasty';
    this.image = ItemSpriteSheet.PASTY;
    this.energy = B.Hunger.STARVING;
  }
  info(): string {
    return 'This is authentic Cornish pasty with traditional filling of beef and potato.';
  }
  price(): number {
    return 20 * this.quantity;
  }
}

export class MysteryMeat extends Food {
  constructor() {
    super();
    this.name = 'mystery meat';
    this.image = ItemSpriteSheet.MEAT;
    this.energy = B.Hunger.STARVING - B.Hunger.HUNGRY;
    this.message = 'That food tasted... strange.';
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    super.execute(hero, action);
    if (action !== Food.AC_EAT) return;
    switch (Random.Int(5)) {
      case 0:
        GLog.w("Oh it's hot!");
        Buff.affect(hero, B.Burning).reignite(hero);
        break;
      case 1:
        GLog.w("You can't feel your legs!");
        Buff.prolong(hero, B.Roots, B.Paralysis.duration(hero));
        break;
      case 2:
        GLog.w('You are not feeling well.');
        Buff.affect(hero, B.Poison).set((B.Poison.durationFactor(hero) * hero.HT) / 5);
        break;
      case 3:
        GLog.w('You are stuffed.');
        Buff.prolong(hero, B.Slow, B.Slow.duration(hero));
        break;
    }
  }
  info(): string {
    return 'Eat at your own risk!';
  }
  price(): number {
    return 5 * this.quantity;
  }
}

export class ChargrilledMeat extends Food {
  constructor() {
    super();
    this.name = 'chargrilled meat';
    this.image = ItemSpriteSheet.STEAK;
    this.energy = B.Hunger.STARVING - B.Hunger.HUNGRY;
  }
  info(): string {
    return 'It looks like a decent steak.';
  }
  price(): number {
    return 5 * this.quantity;
  }
  static cook(ingredient: Item): Food {
    const result = new ChargrilledMeat();
    result.quantity = ingredient.quantity;
    return result;
  }
}

export class FrozenCarpaccio extends Food {
  constructor() {
    super();
    this.name = 'frozen carpaccio';
    this.image = ItemSpriteSheet.CARPACCIO;
    this.energy = B.Hunger.STARVING - B.Hunger.HUNGRY;
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    super.execute(hero, action);
    if (action !== Food.AC_EAT) return;
    switch (Random.Int(5)) {
      case 0:
        GLog.i('You see your hands turn invisible!');
        Buff.affect(hero, B.Invisibility, B.Invisibility.DURATION);
        break;
      case 1:
        GLog.i('You feel your skin hardens!');
        Buff.affect(hero, B.Barkskin).setLevel(Math.trunc(hero.HT / 4));
        break;
      case 2:
        GLog.i('Refreshing!');
        Buff.detach(hero, B.Poison);
        Buff.detach(hero, B.Cripple);
        Buff.detach(hero, B.Weakness);
        Buff.detach(hero, B.Bleeding);
        break;
      case 3:
        GLog.i('You feel better!');
        if (hero.HP < hero.HT) {
          hero.heal(Math.trunc(hero.HT / 4));
          Fx.burst('Speck.HEALING', { id: hero.id() }, 1);
        }
        break;
    }
  }
  info(): string {
    return "It's a piece of frozen raw meat. The only way to eat it is by cutting thin slices of it. And this way it's suprisingly good.";
  }
  price(): number {
    return 10 * this.quantity;
  }
  static cook(ingredient: Item): Food {
    const result = new FrozenCarpaccio();
    result.quantity = ingredient.quantity;
    return result;
  }
}

export class OverpricedRation extends Food {
  constructor() {
    super();
    this.name = 'overpriced food ration';
    this.image = ItemSpriteSheet.OVERPRICED;
    this.energy = B.Hunger.STARVING - B.Hunger.HUNGRY;
    this.message = 'That food tasted ok.';
  }
  info(): string {
    return 'It looks exactly like a standard ration of food but smaller.';
  }
  price(): number {
    return 20 * this.quantity;
  }
}

for (const [name, cls] of Object.entries({
  Food,
  Pasty,
  MysteryMeat,
  ChargrilledMeat,
  FrozenCarpaccio,
  OverpricedRation,
})) {
  registerClass(name, cls);
}
