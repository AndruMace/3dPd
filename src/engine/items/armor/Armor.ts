// Port of items/armor/Armor.java and the five basic armors.
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Random } from '../../core/Random';
import { EquipableItem } from '../EquipableItem';
import type { Glowing, Item } from '../Item';
import type { Glyph } from './Glyph';
import { randomGlyph } from './glyphs';

const HITS_TO_KNOW = 10;

export class Armor extends EquipableItem {
  STR: number;
  private hitsToKnow = HITS_TO_KNOW;
  glyph: Glyph | null = null;

  constructor(public tier = 1) {
    super();
    this.STR = this.typicalSTR();
  }

  categoryOrder(): number {
    return 1;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('unfamiliarity', this.hitsToKnow);
    bundle.put('glyph', this.glyph);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    if ((this.hitsToKnow = bundle.getInt('unfamiliarity')) === 0) this.hitsToKnow = HITS_TO_KNOW;
    this.inscribe(bundle.get<Glyph>('glyph'));
  }

  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    actions.push(this.isEquipped(hero) ? EquipableItem.AC_UNEQUIP : EquipableItem.AC_EQUIP);
    return actions;
  }

  doEquip(hero: Hero): boolean {
    this.detach(hero.belongings.backpack);
    if (hero.belongings.armor === null || hero.belongings.armor.doUnequip(hero, true, false)) {
      hero.belongings.armor = this;
      this.cursedKnown = true;
      if (this.cursed) {
        EquipableItem.equipCursed(hero);
        GLog.n(`your ${this.toString()} constricts around you painfully`);
      }
      Events.emit({ type: 'tier', id: hero.id(), tier: hero.tier() });
      hero.spendAndNext(this.time2equip(hero));
      return true;
    }
    this.collect(hero.belongings.backpack);
    return false;
  }

  protected time2equip(hero: Hero): number {
    return 2 / hero.speed();
  }

  doUnequip(hero: Hero, collect: boolean, single = true): boolean {
    if (super.doUnequip(hero, collect, single)) {
      hero.belongings.armor = null;
      Events.emit({ type: 'tier', id: hero.id(), tier: hero.tier() });
      return true;
    }
    return false;
  }

  isEquipped(hero: Hero): boolean {
    return hero.belongings.armor === this;
  }

  DR(): number {
    return this.tier * (2 + this.effectiveLevel() + (this.glyph === null ? 0 : 1));
  }

  protected upgradeOnce(): void {
    this.upgradeArmor(false);
  }

  upgradeArmor(inscribe: boolean): Item {
    if (this.glyph !== null) {
      if (!inscribe && Random.Int(this.level()) > 0) {
        GLog.w('Interaction of different types of magic has erased the glyph on this armor!');
        this.inscribe(null);
      }
    } else if (inscribe) {
      this.inscribe();
    }
    this.STR--;
    super.upgradeOnce();
    return this;
  }

  safeUpgrade(): Item {
    return this.upgradeArmor(this.glyph !== null);
  }

  protected degradeOnce(): void {
    this.STR++;
    super.degradeOnce();
  }

  maxDurability(lvl: number = this.level()): number {
    return 6 * (lvl < 16 ? 16 - lvl : 1);
  }

  proc(attacker: Char, defender: Char, damage: number): number {
    if (this.glyph !== null) damage = this.glyph.proc(this, attacker, defender, damage);
    if (!this.levelKnown) {
      if (--this.hitsToKnow <= 0) {
        this.levelKnown = true;
        GLog.w(`you are now familiar enough with your ${this.name_()} to identify it. It is ${this.toString()}.`);
        Badges.validateItemLevelAquired(this);
      }
    }
    this.use();
    return damage;
  }

  toString(): string {
    return this.levelKnown ? `${this.isBroken() ? 'broken ' : ''}${super.toString()} :${this.STR}` : super.toString();
  }

  name_(): string {
    return this.glyph === null ? super.name_() : this.glyph.name(super.name_());
  }

  info(): string {
    const name = this.name_();
    const hero = Dungeon.hero;
    let info = this.desc();
    if (this.levelKnown) {
      info += `\n\nThis ${name} provides damage absorption up to ${Math.max(this.DR(), 0)} points per attack. `;
      if (this.STR > hero.STR()) {
        info += this.isEquipped(hero)
          ? '\n\nBecause of your inadequate strength your movement speed and defense skill is decreased. '
          : '\n\nBecause of your inadequate strength wearing this armor will decrease your movement speed and defense skill. ';
      }
    } else {
      info += `\n\nTypical ${name} provides damage absorption up to ${this.typicalDR()} points per attack  and requires ${this.typicalSTR()} points of strength. `;
      if (this.typicalSTR() > hero.STR()) info += 'Probably this armor is too heavy for you. ';
    }
    if (this.glyph !== null) info += 'It is enchanted.';
    if (this.isEquipped(hero)) {
      info += `\n\nYou are wearing the ${name}${this.cursed ? ', and because it is cursed, you are powerless to remove it.' : '.'}`;
    } else if (this.cursedKnown && this.cursed) {
      info += `\n\nYou can feel a malevolent magic lurking within the ${name}.`;
    }
    return info;
  }

  random(): Item {
    if (Random.Float() < 0.4) {
      let n = 1;
      if (Random.Int(3) === 0) {
        n++;
        if (Random.Int(3) === 0) n++;
      }
      if (Random.Int(2) === 0) {
        this.upgrade(n);
      } else {
        this.degrade(n);
        this.cursed = true;
      }
    }
    if (Random.Int(10) === 0) this.inscribe();
    return this;
  }

  typicalSTR(): number {
    return 7 + this.tier * 2;
  }

  typicalDR(): number {
    return this.tier * 2;
  }

  price(): number {
    let price = 10 * (1 << (this.tier - 1));
    if (this.glyph !== null) price = Math.trunc(price * 1.5);
    return this.considerState(price);
  }

  inscribe(glyph?: Glyph | null): this {
    if (glyph !== undefined) {
      this.glyph = glyph;
      return this;
    }
    const oldClass = this.glyph?.constructor ?? null;
    let gl = randomGlyph();
    while (gl.constructor === oldClass) gl = randomGlyph();
    this.glyph = gl;
    return this;
  }

  isInscribed(): boolean {
    return this.glyph !== null;
  }

  glowing(): Glowing {
    return this.glyph ? this.glyph.glowing() : null;
  }
}

function armor(name: string, image: number, tier: number, desc: string) {
  return class extends Armor {
    constructor() {
      super(tier);
      this.name = name;
      this.image = image;
    }
    desc(): string {
      return desc;
    }
  };
}

export class ClothArmor extends armor(
  'cloth armor',
  ItemSpriteSheet.ARMOR_CLOTH,
  1,
  'This lightweight armor offers basic protection.',
) {}
export class LeatherArmor extends armor(
  'leather armor',
  ItemSpriteSheet.ARMOR_LEATHER,
  2,
  'Armor made from tanned monster hide. Not as light as cloth armor but provides better protection.',
) {}
export class MailArmor extends armor(
  'mail armor',
  ItemSpriteSheet.ARMOR_MAIL,
  3,
  'Interlocking metal links make for a tough but flexible suit of armor.',
) {}
export class ScaleArmor extends armor(
  'scale armor',
  ItemSpriteSheet.ARMOR_SCALE,
  4,
  'The metal scales sewn onto a leather vest create a flexible, yet protective armor.',
) {}
export class PlateArmor extends armor(
  'plate armor',
  ItemSpriteSheet.ARMOR_PLATE,
  5,
  'Enormous plates of metal are joined together into a suit that provides unmatched protection to any adventurer strong enough to bear its staggering weight.',
) {}

for (const [name, cls] of Object.entries({ ClothArmor, LeatherArmor, MailArmor, ScaleArmor, PlateArmor })) {
  registerClass(name, cls);
}
