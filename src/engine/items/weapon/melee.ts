// Ports of items/weapon/melee/*.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import type { Hero } from '../../actors/hero/Hero';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { Sample } from '../../core/fx';
import { isA, lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { Item } from '../Item';
import { Weapon } from './Weapon';

export abstract class MeleeWeapon extends Weapon {
  constructor(
    private readonly tier: number,
    acu: number,
    dly: number,
  ) {
    super();
    this.ACU = acu;
    this.DLY = dly;
    this.STR = this.typicalSTR();
  }

  protected min0(): number {
    return this.tier;
  }

  protected max0(): number {
    return Math.trunc(((this.tier * this.tier - this.tier + 10) / this.ACU) * this.DLY);
  }

  min(): number {
    return this.isBroken() ? this.min0() : this.min0() + this.level();
  }

  max(): number {
    return this.isBroken() ? this.max0() : this.max0() + this.level() * this.tier;
  }

  protected upgradeOnce(): void {
    this.upgradeWeapon(false);
  }

  upgradeWeapon(enchant: boolean): Item {
    this.STR--;
    return super.upgradeWeapon(enchant);
  }

  safeUpgrade(): Item {
    return this.upgradeWeapon(this.enchantment !== null);
  }

  protected degradeOnce(): void {
    this.STR++;
    super.degradeOnce();
  }

  typicalSTR(): number {
    return 8 + this.tier * 2;
  }

  info(): string {
    const p = '\n\n';
    let info = this.desc();
    const lvl = this.visiblyUpgraded();
    const quality = lvl !== 0 ? (lvl > 0 ? (this.isBroken() ? 'broken' : 'upgraded') : 'degraded') : '';
    info += p;
    info += `This ${this.name} is ${quality ? (/^[aeiou]/.test(quality) ? 'an ' : 'a ') + quality : 'a'}`;
    info += ` tier-${this.tier} melee weapon. `;
    const hero = Dungeon.hero;
    if (this.levelKnown) {
      const min = this.min();
      const max = this.max();
      info += `Its average damage is ${min + Math.trunc((max - min) / 2)} points per hit. `;
    } else {
      const min = this.min0();
      const max = this.max0();
      info += `Its typical average damage is ${min + Math.trunc((max - min) / 2)} points per hit and usually it requires ${this.typicalSTR()} points of strength. `;
      if (this.typicalSTR() > hero.STR()) info += 'Probably this weapon is too heavy for you. ';
    }
    if (this.DLY !== 1) {
      info += `This is a rather ${this.DLY < 1 ? 'fast' : 'slow'}`;
      if (this.ACU !== 1) {
        info += this.ACU > 1 === this.DLY < 1 ? ' and ' : ' but ';
        info += this.ACU > 1 ? 'accurate' : 'inaccurate';
      }
      info += ' weapon. ';
    } else if (this.ACU !== 1) {
      info += `This is a rather ${this.ACU > 1 ? 'accurate' : 'inaccurate'} weapon. `;
    }
    if (this.imbue === 'SPEED') info += 'It was balanced to make it faster. ';
    else if (this.imbue === 'ACCURACY') info += 'It was balanced to make it more accurate. ';
    if (this.enchantment !== null) info += 'It is enchanted.';

    if (this.levelKnown && hero.belongings.backpack.items.includes(this)) {
      if (this.STR > hero.STR()) {
        info +=
          p +
          `Because of your inadequate strength the accuracy and speed of your attack with this ${this.name} is decreased.`;
      }
      if (this.STR < hero.STR()) {
        info += p + `Because of your excess strength the damage of your attack with this ${this.name} is increased.`;
      }
    }
    if (this.isEquipped(hero)) {
      info +=
        p +
        `You hold the ${this.name} at the ready${this.cursed ? ', and because it is cursed, you are powerless to let go.' : '.'}`;
    } else if (this.cursedKnown && this.cursed) {
      info += p + `You can feel a malevolent magic lurking within ${this.name}.`;
    }
    return info;
  }

  price(): number {
    let price = 20 * (1 << (this.tier - 1));
    if (this.enchantment !== null) price = Math.trunc(price * 1.5);
    return this.considerState(price);
  }

  random(): Item {
    super.random();
    if (Random.Int(10 + this.level()) === 0) this.enchant();
    return this;
  }
}

function melee(name: string, image: number, tier: number, acu: number, dly: number, desc: string) {
  return class extends MeleeWeapon {
    constructor() {
      super(tier, acu, dly);
      this.name = name;
      this.image = image;
    }
    desc(): string {
      return desc;
    }
  };
}

export class BattleAxe extends melee(
  'battle axe',
  ItemSpriteSheet.BATTLE_AXE,
  4,
  1.2,
  1,
  'The enormous steel head of this battle axe puts considerable heft behind each stroke.',
) {}
export class Dagger extends melee(
  'dagger',
  ItemSpriteSheet.DAGGER,
  1,
  1.2,
  1,
  'A simple iron dagger with a well worn wooden handle.',
) {}
export class Glaive extends melee(
  'glaive',
  ItemSpriteSheet.GLAIVE,
  5,
  1,
  1,
  'A polearm consisting of a sword blade on the end of a pole.',
) {}
export class Knuckles extends melee(
  'knuckleduster',
  ItemSpriteSheet.KNUCKLEDUSTER,
  1,
  1,
  0.5,
  'A piece of iron shaped to fit around the knuckles.',
) {}
export class Longsword extends melee(
  'longsword',
  ItemSpriteSheet.LONG_SWORD,
  4,
  1,
  1,
  'This towering blade inflicts heavy damage by investing its heft into every cut.',
) {}
export class Mace extends melee(
  'mace',
  ItemSpriteSheet.MACE,
  3,
  1,
  0.8,
  'The iron head of this weapon inflicts substantial damage.',
) {}
export class Quarterstaff extends melee(
  'quarterstaff',
  ItemSpriteSheet.QUARTERSTAFF,
  2,
  1,
  1,
  'A staff of hardwood, its ends are shod with iron.',
) {}
export class Spear extends melee(
  'spear',
  ItemSpriteSheet.SPEAR,
  2,
  1,
  1.5,
  'A slender wooden rod tipped with sharpened iron.',
) {}
export class Sword extends melee(
  'sword',
  ItemSpriteSheet.SWORD,
  3,
  1,
  1,
  'The razor-sharp length of steel blade shines reassuringly.',
) {}
export class WarHammer extends melee(
  'war hammer',
  ItemSpriteSheet.WAR_HAMMER,
  5,
  1.2,
  1,
  'Few creatures can withstand the crushing blow of this towering mass of lead and steel, but only the strongest of adventurers can use it effectively.',
) {}

export class ShortSword extends MeleeWeapon {
  static readonly AC_REFORGE = 'REFORGE';
  private static readonly TIME_TO_REFORGE = 2;

  constructor() {
    super(1, 1, 1);
    this.name = 'short sword';
    this.image = ItemSpriteSheet.SHORT_SWORD;
    this.STR = 11;
  }

  protected max0(): number {
    return 12;
  }

  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    if (this.level() > 0) actions.push(ShortSword.AC_REFORGE);
    return actions;
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== ShortSword.AC_REFORGE) {
      super.execute(hero, action);
      return;
    }
    let equipped: boolean;
    if (hero.belongings.weapon === this) {
      equipped = true;
      hero.belongings.weapon = null;
    } else {
      equipped = false;
      this.detach(hero.belongings.backpack);
    }
    UI.selectItem('WEAPON', 'Select a weapon to upgrade', (item) => {
      if (item !== null && !isA(item, 'Boomerang')) {
        Sample.play(Assets.SND_EVOKE);
        lazy<{ upgrade(h: Hero): void }>('ScrollOfUpgrade').upgrade(hero);
        Item.evoke(hero);
        GLog.w(`you reforged the short sword to upgrade your ${item.name_()}`);
        (item as MeleeWeapon).safeUpgrade();
        hero.spendAndNext(ShortSword.TIME_TO_REFORGE);
        Badges.validateItemLevelAquired(item);
      } else {
        if (isA(item, 'Boomerang')) GLog.w("you can't upgrade a boomerang this way");
        if (equipped) hero.belongings.weapon = this;
        else this.collect(hero.belongings.backpack);
      }
    });
  }

  desc(): string {
    return 'It is indeed quite short, just a few inches longer, than a dagger.';
  }
}

for (const [name, cls] of Object.entries({
  BattleAxe,
  Dagger,
  Glaive,
  Knuckles,
  Longsword,
  Mace,
  Quarterstaff,
  Spear,
  Sword,
  WarHammer,
  ShortSword,
})) {
  registerClass(name, cls);
}
