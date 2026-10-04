// Port of items/wands/Wand.java (base). Concrete wands live in wands.ts.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { QuickSlot } from '../../QuickSlot';
import { Actor } from '../../actors/Actor';
import { Buff } from '../../actors/buffs/Buff';
import { Invisibility } from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { Ballistica } from '../../mechanics/Ballistica';
import type { Bag } from '../bags';
import { EquipableItem } from '../EquipableItem';
import type { Item } from '../Item';
import { ItemStatusHandler } from '../ItemStatusHandler';
import { KindOfWeapon } from '../KindOfWeapon';

const USAGES_TO_KNOW = 40;
const TIME_TO_ZAP = 1;

const woods = [
  'holly',
  'yew',
  'ebony',
  'cherry',
  'teak',
  'rowan',
  'willow',
  'mahogany',
  'bamboo',
  'purpleheart',
  'oak',
  'birch',
];
const images = [
  ItemSpriteSheet.WAND_HOLLY,
  ItemSpriteSheet.WAND_YEW,
  ItemSpriteSheet.WAND_EBONY,
  ItemSpriteSheet.WAND_CHERRY,
  ItemSpriteSheet.WAND_TEAK,
  ItemSpriteSheet.WAND_ROWAN,
  ItemSpriteSheet.WAND_WILLOW,
  ItemSpriteSheet.WAND_MAHOGANY,
  ItemSpriteSheet.WAND_BAMBOO,
  ItemSpriteSheet.WAND_PURPLEHEART,
  ItemSpriteSheet.WAND_OAK,
  ItemSpriteSheet.WAND_BIRCH,
];

let wandClasses: (abstract new () => Wand)[] = [];
let handler: ItemStatusHandler | null = null;

export abstract class Wand extends KindOfWeapon {
  static readonly AC_ZAP = 'ZAP';

  maxCharges: number;
  curCharges: number;
  protected charger: Charger | null = null;
  private curChargeKnown = false;
  private usagesToKnow = USAGES_TO_KNOW;
  protected hitChars = true;
  private wood = '';
  /** The hero zapping this wand (curUser in PD). */
  protected curUser!: Hero;

  static setClasses(classes: (abstract new () => Wand)[]): void {
    wandClasses = classes;
  }

  static initWoods(): void {
    handler = new ItemStatusHandler(wandClasses, woods, images);
  }

  static save(bundle: Bundle): void {
    handler!.save(bundle);
  }

  static restore(bundle: Bundle): void {
    handler = new ItemStatusHandler(wandClasses, woods, images, bundle);
  }

  protected static get handler(): ItemStatusHandler {
    if (!handler) Wand.initWoods();
    return handler!;
  }

  constructor() {
    super();
    this.defaultAction = Wand.AC_ZAP;
    this.maxCharges = this.initialCharges();
    this.curCharges = this.maxCharges;
    if (wandClasses.includes(this.constructor as abstract new () => Wand)) {
      this.image = Wand.handler.image(this);
      this.wood = Wand.handler.label(this);
    }
  }

  categoryOrder(): number {
    return 4;
  }

  actions(hero: Hero): string[] {
    let actions = super.actions(hero);
    if (this.curCharges > 0 || !this.curChargeKnown) actions.push(Wand.AC_ZAP);
    if (hero.heroClass !== 'MAGE')
      actions = actions.filter((a) => a !== EquipableItem.AC_EQUIP && a !== EquipableItem.AC_UNEQUIP);
    return actions;
  }

  doUnequip(hero: Hero, collect: boolean, single = true): boolean {
    this.onDetach();
    return super.doUnequip(hero, collect, single);
  }

  activate(hero: Hero): void {
    this.charge(hero);
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Wand.AC_ZAP) {
      this.curUser = hero;
      UI.selectCell('Choose direction to zap', (target) => this.zap(target));
    } else {
      super.execute(hero, action);
    }
  }

  /** The zapper listener: aim, fire the wand's effect, then apply it. */
  zap(target: number | null): void {
    if (target === null) return;
    const user = this.curUser;
    if (target === user.pos) {
      GLog.i("You can't target yourself");
      return;
    }
    this.setKnown();
    const cell = Ballistica.cast(user.pos, target, true, this.hitChars);
    Events.emit({ type: 'anim', id: user.id(), anim: 'zap', target: cell });
    const ch = Actor.findChar(cell);
    QuickSlot.lastTarget = ch ? ch.pos : -1;
    if (this.curCharges > 0) {
      user.busy();
      this.fx(cell);
      this.onZap(cell);
      this.wandUsed();
      Invisibility.dispel();
    } else {
      user.spendAndNext(TIME_TO_ZAP);
      GLog.w('your wand fizzles; it must be out of charges for now');
      this.levelKnown = true;
    }
  }

  protected abstract onZap(cell: number): void;

  collect(container?: Bag): boolean {
    const bag = container ?? Dungeon.hero.belongings.backpack;
    if (super.collect(bag)) {
      if (bag.owner) this.charge(bag.owner);
      return true;
    }
    return false;
  }

  charge(owner: Char): void {
    if (this.charger === null) {
      this.charger = new Charger(this);
      this.charger.attachTo(owner);
    }
  }

  onDetach(): void {
    this.stopCharging();
  }

  stopCharging(): void {
    if (this.charger !== null) {
      this.charger.detach();
      this.charger = null;
    }
  }

  power(): number {
    const eLevel = this.effectiveLevel();
    if (this.charger !== null) {
      const power = this.charger.target.buff(lazy<abstract new () => Buff & { level: number }>('RingOfPower.Power'));
      return power === null ? eLevel : Math.max(eLevel + power.level, 0);
    }
    return eLevel;
  }

  protected isKnown(): boolean {
    return Wand.handler.isKnown(this);
  }

  setKnown(): void {
    if (!this.isKnown()) Wand.handler.know(this);
    Badges.validateAllWandsIdentified();
  }

  identify(): this {
    this.setKnown();
    this.curChargeKnown = true;
    super.identify();
    return this;
  }

  toString(): string {
    let s = super.toString();
    const status = this.status();
    if (status !== null) s += ` (${status})`;
    if (this.isBroken()) s = 'broken ' + s;
    return s;
  }

  name_(): string {
    return this.isKnown() ? this.name : `${this.wood} wand`;
  }

  info(): string {
    let info = this.isKnown()
      ? this.desc()
      : `This thin ${this.wood} wand is warm to the touch. Who knows what it will do when used?`;
    if (Dungeon.hero.heroClass === 'MAGE') {
      info += '\n\n';
      if (this.levelKnown) {
        const min = this.min();
        info += `When this wand is used as a melee weapon, its average damage is ${min + Math.trunc((this.max() - min) / 2)} points per hit.`;
      } else {
        info += 'You can use this wand as a melee weapon.';
      }
    }
    return info;
  }

  isIdentified(): boolean {
    return super.isIdentified() && this.isKnown() && this.curChargeKnown;
  }

  status(): string | null {
    return this.levelKnown ? `${this.curChargeKnown ? this.curCharges : '?'}/${this.maxCharges}` : null;
  }

  protected upgradeOnce(): void {
    super.upgradeOnce();
    this.updateLevel();
    this.curCharges = Math.min(this.curCharges + 1, this.maxCharges);
  }

  protected degradeOnce(): void {
    super.degradeOnce();
    this.updateLevel();
  }

  maxDurability(lvl: number = this.level()): number {
    return 6 * (lvl < 16 ? 16 - lvl : 1);
  }

  protected updateLevel(): void {
    this.maxCharges = Math.min(this.initialCharges() + this.level(), 9);
    this.curCharges = Math.min(this.curCharges, this.maxCharges);
  }

  protected initialCharges(): number {
    return 2;
  }

  min(): number {
    return 1 + Math.trunc(this.effectiveLevel() / 3);
  }

  max(): number {
    const level = this.effectiveLevel();
    const tier = 1 + Math.trunc(level / 3);
    return Math.trunc((tier * tier - tier + 10) / 2) + level;
  }

  /** The bolt visual (MagicMissile.blueLight by default). */
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.blueLight', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }

  protected wandUsed(): void {
    this.curCharges--;
    if (!this.isIdentified() && --this.usagesToKnow <= 0) {
      this.identify();
      GLog.w(`You are now familiar enough with your ${this.name_()}.`);
    }
    this.use();
    this.curUser.spendAndNext(TIME_TO_ZAP);
  }

  random(): Item {
    if (Random.Float() < 0.5) {
      this.upgrade();
      if (Random.Float() < 0.15) this.upgrade();
    }
    return this;
  }

  static allKnown(): boolean {
    return Wand.handler.allKnown();
  }

  price(): number {
    return this.considerState(50);
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('unfamiliarity', this.usagesToKnow);
    bundle.put('maxCharges', this.maxCharges);
    bundle.put('curCharges', this.curCharges);
    bundle.put('curChargeKnown', this.curChargeKnown);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    if ((this.usagesToKnow = bundle.getInt('unfamiliarity')) === 0) this.usagesToKnow = USAGES_TO_KNOW;
    this.maxCharges = bundle.getInt('maxCharges');
    this.curCharges = bundle.getInt('curCharges');
    this.curChargeKnown = bundle.getBoolean('curChargeKnown');
  }
}

/** Wand.Charger: regains one charge every 40 turns (faster for mages with upgraded wands). */
class Charger extends Buff {
  private static readonly TIME_TO_CHARGE = 40;

  constructor(private readonly wand: Wand) {
    super();
  }

  isTransient(): boolean {
    return true;
  }

  attachTo(target: Char): boolean {
    super.attachTo(target);
    this.delay();
    return true;
  }

  protected act(): boolean {
    if (this.wand.curCharges < this.wand.maxCharges) this.wand.curCharges++;
    this.delay();
    return true;
  }

  private delay(): void {
    const time2charge =
      (this.target as Hero).heroClass === 'MAGE'
        ? Charger.TIME_TO_CHARGE / Math.sqrt(1 + this.wand.effectiveLevel())
        : Charger.TIME_TO_CHARGE;
    this.spend(time2charge);
  }
}

registerClass('Wand', Wand);
