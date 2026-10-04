// Ports of items/rings/: the Ring base, its RingBuff, and the twelve rings.
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { TICK } from '../../actors/Actor';
import { Buff } from '../../actors/buffs/Buff';
import { Burning, Poison } from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { Electricity } from '../../levels/traps/Electricity';
import { capitalize } from '../../actors/Char';
import { EquipableItem } from '../EquipableItem';
import type { Item } from '../Item';
import { ItemStatusHandler } from '../ItemStatusHandler';

const TICKS_TO_KNOW = 200;
const TIME_TO_EQUIP = 1;

const gems = [
  'diamond',
  'opal',
  'garnet',
  'ruby',
  'amethyst',
  'topaz',
  'onyx',
  'tourmaline',
  'emerald',
  'sapphire',
  'quartz',
  'agate',
];
const images = [
  ItemSpriteSheet.RING_DIAMOND,
  ItemSpriteSheet.RING_OPAL,
  ItemSpriteSheet.RING_GARNET,
  ItemSpriteSheet.RING_RUBY,
  ItemSpriteSheet.RING_AMETHYST,
  ItemSpriteSheet.RING_TOPAZ,
  ItemSpriteSheet.RING_ONYX,
  ItemSpriteSheet.RING_TOURMALINE,
  ItemSpriteSheet.RING_EMERALD,
  ItemSpriteSheet.RING_SAPPHIRE,
  ItemSpriteSheet.RING_QUARTZ,
  ItemSpriteSheet.RING_AGATE,
];

let ringClasses: (abstract new () => Ring)[] = [];
let handler: ItemStatusHandler | null = null;

/** Ring.RingBuff: the effect of a worn ring; also slowly identifies it and wears it down. */
export class RingBuff extends Buff {
  level: number;

  constructor(readonly ring: Ring) {
    super();
    this.level = ring.effectiveLevel();
  }

  isTransient(): boolean {
    return true;
  }

  attachTo(target: Char): boolean {
    const ring = this.ring;
    if (target === Dungeon.hero && Dungeon.hero.heroClass === 'ROGUE' && !ring.isKnown()) {
      ring.setKnown();
      GLog.i(`This is a ${ring.name_()}`);
      Badges.validateItemLevelAquired(ring);
    }
    return super.attachTo(target);
  }

  protected act(): boolean {
    const ring = this.ring;
    if (!ring.isIdentified() && --ring.ticksToKnow <= 0) {
      const gemName = ring.name_();
      ring.identify();
      GLog.w(`you are now familiar enough with your ${gemName} to identify it. It is ${ring.toString()}.`);
      Badges.validateItemLevelAquired(ring);
    }
    ring.use();
    this.spend(TICK);
    return true;
  }
}

export abstract class Ring extends EquipableItem {
  protected buff_: RingBuff | null = null;
  private gem = '';
  ticksToKnow = TICKS_TO_KNOW;

  static setClasses(classes: (abstract new () => Ring)[]): void {
    ringClasses = classes;
  }

  static initGems(): void {
    handler = new ItemStatusHandler(ringClasses, gems, images);
  }

  static save(bundle: Bundle): void {
    handler!.save(bundle);
  }

  static restore(bundle: Bundle): void {
    handler = new ItemStatusHandler(ringClasses, gems, images, bundle);
  }

  private static get handler(): ItemStatusHandler {
    if (!handler) Ring.initGems();
    return handler!;
  }

  constructor() {
    super();
    this.syncGem();
  }

  categoryOrder(): number {
    return 5;
  }

  syncGem(): void {
    this.image = Ring.handler.image(this);
    this.gem = Ring.handler.label(this);
  }

  actions(hero: Hero): string[] {
    return [...super.actions(hero), this.isEquipped(hero) ? EquipableItem.AC_UNEQUIP : EquipableItem.AC_EQUIP];
  }

  doEquip(hero: Hero): boolean {
    const b = hero.belongings;
    if (b.ring1 !== null && b.ring2 !== null) {
      const r1 = b.ring1;
      const r2 = b.ring2;
      UI.options(
        'Unequip one ring',
        'You can only wear two rings at a time. Unequip one of your equipped rings.',
        [capitalize(r1.toString()), capitalize(r2.toString())],
        (index) => {
          if (index < 0) return;
          this.detach(b.backpack);
          const equipped = index === 0 ? r1 : r2;
          if (equipped.doUnequip(hero, true, false)) this.doEquip(hero);
          else this.collect(b.backpack);
        },
      );
      return false;
    }
    if (b.ring1 === null) b.ring1 = this;
    else b.ring2 = this;
    this.detach(b.backpack);
    this.activate(hero);
    this.cursedKnown = true;
    if (this.cursed) {
      EquipableItem.equipCursed(hero);
      GLog.n(`your ${this.toString()} tightens around your finger painfully`);
    }
    hero.spendAndNext(TIME_TO_EQUIP);
    return true;
  }

  activate(ch: Char): void {
    this.buff_ = this.buff();
    this.buff_?.attachTo(ch);
  }

  doUnequip(hero: Hero, collect: boolean, single = true): boolean {
    if (super.doUnequip(hero, collect, single)) {
      if (hero.belongings.ring1 === this) hero.belongings.ring1 = null;
      else hero.belongings.ring2 = null;
      if (this.buff_) hero.remove(this.buff_);
      this.buff_ = null;
      return true;
    }
    return false;
  }

  isEquipped(hero: Hero): boolean {
    return hero.belongings.ring1 === this || hero.belongings.ring2 === this;
  }

  effectiveLevel(): number {
    return this.isBroken() ? 1 : this.level();
  }

  private renewBuff(): void {
    if (this.buff_ !== null) {
      const owner = this.buff_.target;
      this.buff_.detach();
      if ((this.buff_ = this.buff()) !== null) this.buff_.attachTo(owner);
    }
  }

  getBroken(): void {
    this.renewBuff();
    super.getBroken();
  }

  fix(): void {
    super.fix();
    this.renewBuff();
  }

  maxDurability(lvl: number = this.level()): number {
    return lvl <= 1 ? Number.MAX_SAFE_INTEGER : 100 * (lvl < 16 ? 16 - lvl : 1);
  }

  isKnown(): boolean {
    return Ring.handler.isKnown(this);
  }

  setKnown(): void {
    if (!this.isKnown()) Ring.handler.know(this);
    Badges.validateAllRingsIdentified();
  }

  toString(): string {
    return this.levelKnown && this.isBroken() ? 'broken ' + super.toString() : super.toString();
  }

  name_(): string {
    return this.isKnown() ? this.name : `${this.gem} ring`;
  }

  desc(): string {
    return `This metal band is adorned with a large ${this.gem} gem that glitters in the darkness. Who knows what effect it has when worn?`;
  }

  info(): string {
    if (this.isEquipped(Dungeon.hero)) {
      return `${this.desc()}\n\nThe ${this.name_()} is on your finger${this.cursed ? ', and because it is cursed, you are powerless to remove it.' : '.'}`;
    }
    if (this.cursed && this.cursedKnown)
      return `${this.desc()}\n\nYou can feel a malevolent magic lurking within the ${this.name_()}.`;
    return this.desc();
  }

  isIdentified(): boolean {
    return super.isIdentified() && this.isKnown();
  }

  identify(): this {
    this.setKnown();
    return super.identify();
  }

  random(): Item {
    const lvl = Random.Int(1, 3);
    if (Random.Float() < 0.3) {
      this.degrade(lvl);
      this.cursed = true;
    } else {
      this.upgrade(lvl);
    }
    return this;
  }

  static allKnown(): boolean {
    return Ring.handler.known().size === ringClasses.length - 2;
  }

  price(): number {
    return this.considerState(80);
  }

  protected buff(): RingBuff | null {
    return null;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('unfamiliarity', this.ticksToKnow);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    if ((this.ticksToKnow = bundle.getInt('unfamiliarity')) === 0) this.ticksToKnow = TICKS_TO_KNOW;
  }
}

/** Defines a ring and its effect buff (an inner class in PD). */
function ring(name: string, knownDesc: string) {
  class Effect extends RingBuff {}
  class R extends Ring {
    static readonly Effect = Effect;
    constructor() {
      super();
      this.name = name;
    }
    protected buff(): RingBuff {
      return new Effect(this);
    }
    desc(): string {
      return this.isKnown() ? knownDesc : super.desc();
    }
  }
  return R;
}

export class RingOfAccuracy extends ring('Ring of Accuracy', 'This ring increases your chance to hit the enemy.') {}
export class RingOfEvasion extends ring('Ring of Evasion', 'This ring increases your chance to dodge enemy attack.') {}
export class RingOfHaste extends ring(
  'Ring of Haste',
  "This ring accelerates the wearer's flow of time, allowing one to perform all actions a little faster.",
) {}
export class RingOfHerbalism extends ring(
  'Ring of Herbalism',
  'This ring increases your chance to gather dew and seeds from trampled grass.',
) {}
export class RingOfMending extends ring(
  'Ring of Mending',
  "This ring increases the body's regenerative properties, allowing one to recover lost health at an accelerated rate. Degraded rings will decrease or even halt one's natural regeneration.",
) {}
export class RingOfPower extends ring(
  'Ring of Power',
  'Your wands will become more powerful in the energy field that radiates from this ring. Degraded rings of power will instead weaken your wands.',
) {}
export class RingOfSatiety extends ring(
  'Ring of Satiety',
  'Wearing this ring you can go without food longer. Degraded rings of satiety will cause the opposite effect.',
) {}
export class RingOfShadows extends ring(
  'Ring of Shadows',
  'Enemies will be less likely to notice you if you wear this ring. Degraded rings of shadows will alert enemies who might otherwise not have noticed your presence.',
) {}

export class RingOfDetection extends ring(
  'Ring of Detection',
  'Wearing this ring will allow the wearer to notice hidden secrets - traps and secret doors - without taking time to search. Degraded rings of detection will dull your senses, making it harder to notice secrets even when actively searching for them.',
) {
  doEquip(hero: Hero): boolean {
    if (super.doEquip(hero)) {
      Dungeon.hero.search(false);
      return true;
    }
    return false;
  }
}

/** Rings that can't be upgraded or worn down and identify themselves when picked up. */
function vendorRing(name: string, knownDesc: string, validate: () => void) {
  return class extends ring(name, knownDesc) {
    random(): Item {
      this.setLevel(1);
      return this;
    }
    doPickUp(hero: Hero): boolean {
      this.identify();
      validate();
      Badges.validateItemLevelAquired(this);
      return super.doPickUp(hero);
    }
    isUpgradable(): boolean {
      return false;
    }
    use(): void {
      // it can't degrade
    }
  };
}

export class RingOfHaggler extends vendorRing(
  'Ring of Haggler',
  "In fact this ring doesn't provide any magic effect, but it demonstrates to shopkeepers and vendors, that the owner of the ring is a member of The Thieves' Guild. Usually they are glad to give a discount in exchange for temporary immunity guarantee. Upgrading this ring won't give any additional bonuses.",
  () => Badges.validateRingOfHaggler(),
) {}
export class RingOfThorns extends vendorRing(
  'Ring of Thorns',
  "Though this ring doesn't provide real thorns, an enemy that attacks you will itself be wounded by a fraction of the damage that it inflicts. Upgrading this ring won't give any additional bonuses.",
  () => Badges.validateRingOfThorns(),
) {}

/** RingOfElements.Resistance: chance to resist elemental damage, and shorter debuffs. */
export class Resistance extends RingBuff {
  private static FULL: Set<unknown> | null = null;
  private static readonly EMPTY = new Set<unknown>();

  resistances(): Set<unknown> {
    if (!Resistance.FULL) {
      Resistance.FULL = new Set<unknown>([
        Burning,
        lazy('ToxicGas'),
        Poison,
        Electricity,
        lazy('Warlock'),
        lazy('Eye'),
        lazy('Yog.BurningFist'),
      ]);
    }
    return Random.Int(this.level + 3) >= 3 ? Resistance.FULL : Resistance.EMPTY;
  }

  durationFactor(): number {
    return this.level < 0 ? 1 : (2 + 0.5 * this.level) / (2 + this.level);
  }
}

export class RingOfElements extends Ring {
  constructor() {
    super();
    this.name = 'Ring of Elements';
  }
  protected buff(): RingBuff {
    return new Resistance(this);
  }
  desc(): string {
    return this.isKnown()
      ? 'This ring provides resistance to different elements, such as fire, electricity, gases etc. Also it decreases duration of negative effects.'
      : super.desc();
  }
}

Ring.setClasses([
  RingOfMending,
  RingOfDetection,
  RingOfShadows,
  RingOfPower,
  RingOfHerbalism,
  RingOfAccuracy,
  RingOfEvasion,
  RingOfSatiety,
  RingOfHaste,
  RingOfHaggler,
  RingOfElements,
  RingOfThorns,
]);

registerClass('Ring', Ring);
const buffNames: [string, abstract new (...a: never[]) => unknown][] = [
  ['RingOfAccuracy.Accuracy', RingOfAccuracy.Effect],
  ['RingOfEvasion.Evasion', RingOfEvasion.Effect],
  ['RingOfHaste.Haste', RingOfHaste.Effect],
  ['RingOfHerbalism.Herbalism', RingOfHerbalism.Effect],
  ['RingOfMending.Rejuvenation', RingOfMending.Effect],
  ['RingOfPower.Power', RingOfPower.Effect],
  ['RingOfSatiety.Satiety', RingOfSatiety.Effect],
  ['RingOfShadows.Shadows', RingOfShadows.Effect],
  ['RingOfDetection.Detection', RingOfDetection.Effect],
  ['RingOfHaggler.Haggling', RingOfHaggler.Effect],
  ['RingOfThorns.Thorns', RingOfThorns.Effect],
  ['RingOfElements.Resistance', Resistance],
];
for (const [name, cls] of buffNames) registerClass(name, cls as never);
for (const [name, cls] of Object.entries({
  RingOfAccuracy,
  RingOfDetection,
  RingOfElements,
  RingOfEvasion,
  RingOfHaggler,
  RingOfHaste,
  RingOfHerbalism,
  RingOfMending,
  RingOfPower,
  RingOfSatiety,
  RingOfShadows,
  RingOfThorns,
})) {
  registerClass(name, cls);
}
