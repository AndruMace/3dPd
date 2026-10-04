// Ports of items/weapon/missiles/*.
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Dungeon } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import type { Blob } from '../../actors/blobs/Blob';
import { Buff } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import { registerClass } from '../../core/Bundle';
import { Events } from '../../core/events';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { EquipableItem } from '../EquipableItem';
import type { Item } from '../Item';
import { KindOfWeapon } from '../KindOfWeapon';
import { Weapon } from './Weapon';

export abstract class MissileWeapon extends Weapon {
  constructor() {
    super();
    this.stackable = true;
    this.levelKnown = true;
    this.defaultAction = 'THROW';
  }

  isMissileWeapon(): boolean {
    return true;
  }

  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    if (hero.heroClass !== 'HUNTRESS' && hero.heroClass !== 'ROGUE') {
      return actions.filter((a) => a !== EquipableItem.AC_EQUIP && a !== EquipableItem.AC_UNEQUIP);
    }
    return actions;
  }

  protected onThrow(cell: number): void {
    const hero = Dungeon.hero;
    const enemy = Actor.findChar(cell);
    if (enemy === null || enemy === hero) super.onThrow(cell);
    else if (!hero.shoot(enemy, this)) this.miss(cell);
  }

  protected miss(cell: number): void {
    super.onThrow(cell);
  }

  proc(attacker: Char, defender: Char, damage: number): void {
    super.proc(attacker, defender, damage);
    const hero = attacker as Hero;
    if (hero.rangedWeapon === null && this.stackable) {
      if (this.quantity === 1) this.doUnequip(hero, false, false);
      else this.detach(null);
    }
  }

  doEquip(hero: Hero): boolean {
    UI.options(
      'Missile weapon',
      'Do you really want to equip it as a melee weapon?',
      ["Yes, I know what I'm doing", 'No, I changed my mind'],
      (index) => {
        if (index === 0) KindOfWeapon.prototype.doEquip.call(this, hero);
      },
    );
    return false;
  }

  random(): Item {
    return this;
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  info(): string {
    const hero = Dungeon.hero;
    let info = this.desc();
    const min = this.min();
    const max = this.max();
    info += `\n\nAverage damage of this weapon equals to ${min + Math.trunc((max - min) / 2)} points per hit. `;
    if (hero.belongings.backpack.items.includes(this)) {
      if (this.STR > hero.STR()) {
        info += `Because of your inadequate strength the accuracy and speed of your attack with this ${this.name} is decreased.`;
      }
      if (this.STR < hero.STR()) {
        info += `Because of your excess strength the damage of your attack with this ${this.name} is increased.`;
      }
    }
    if (this.isEquipped(hero)) info += `\n\nYou hold the ${this.name} at the ready.`;
    return info;
  }
}

export class Dart extends MissileWeapon {
  constructor(number = 1) {
    super();
    this.name = 'dart';
    this.image = ItemSpriteSheet.DART;
    this.quantity = number;
  }
  min(): number {
    return 1;
  }
  max(): number {
    return 4;
  }
  desc(): string {
    return 'These simple metal spikes are weighted to fly true and sting their prey with a flick of the wrist.';
  }
  random(): Item {
    this.quantity = Random.Int(5, 15);
    return this;
  }
  price(): number {
    return this.quantity * 2;
  }
}

export class Javelin extends MissileWeapon {
  constructor(number = 1) {
    super();
    this.name = 'javelin';
    this.image = ItemSpriteSheet.JAVELIN;
    this.STR = 15;
    this.quantity = number;
  }
  min(): number {
    return 2;
  }
  max(): number {
    return 15;
  }
  proc(attacker: Char, defender: Char, damage: number): void {
    super.proc(attacker, defender, damage);
    Buff.prolong(defender, B.Cripple, B.Cripple.DURATION);
  }
  desc(): string {
    return 'This length of metal is weighted to keep the spike at its tip foremost as it sails through the air.';
  }
  random(): Item {
    this.quantity = Random.Int(5, 15);
    return this;
  }
  price(): number {
    return 15 * this.quantity;
  }
}

export class IncendiaryDart extends MissileWeapon {
  constructor(number = 1) {
    super();
    this.name = 'incendiary dart';
    this.image = ItemSpriteSheet.INCENDIARY_DART;
    this.STR = 12;
    this.quantity = number;
  }
  min(): number {
    return 1;
  }
  max(): number {
    return 2;
  }
  protected onThrow(cell: number): void {
    const hero = Dungeon.hero;
    const enemy = Actor.findChar(cell);
    if (enemy === null || enemy === hero) {
      if (Dungeon.level.flamable[cell]) {
        const Fire = lazy<typeof Blob>('Fire');
        Dungeon.level.addBlob(Fire.seed(cell, 4, Fire));
      } else {
        super.onThrow(cell);
      }
    } else if (!hero.shoot(enemy, this)) {
      Dungeon.level.drop(this, cell).dropFX(cell);
    }
  }
  proc(attacker: Char, defender: Char, damage: number): void {
    Buff.affect(defender, B.Burning).reignite(defender);
    super.proc(attacker, defender, damage);
  }
  desc(): string {
    return 'The spike on each of these darts is designed to pin it to its target while the unstable compounds strapped to its length burst into brilliant flames.';
  }
  random(): Item {
    this.quantity = Random.Int(3, 6);
    return this;
  }
  price(): number {
    return 10 * this.quantity;
  }
}

export class CurareDart extends MissileWeapon {
  static readonly DURATION = 3;
  constructor(number = 1) {
    super();
    this.name = 'curare dart';
    this.image = ItemSpriteSheet.CURARE_DART;
    this.STR = 14;
    this.quantity = number;
  }
  min(): number {
    return 1;
  }
  max(): number {
    return 3;
  }
  proc(attacker: Char, defender: Char, damage: number): void {
    Buff.prolong(defender, B.Paralysis, CurareDart.DURATION);
    super.proc(attacker, defender, damage);
  }
  desc(): string {
    return "These little evil darts don't do much damage but they can paralyze the target leaving it helpless and motionless for some time.";
  }
  random(): Item {
    this.quantity = Random.Int(2, 5);
    return this;
  }
  price(): number {
    return 12 * this.quantity;
  }
}

export class Shuriken extends MissileWeapon {
  constructor(number = 1) {
    super();
    this.name = 'shuriken';
    this.image = ItemSpriteSheet.SHURIKEN;
    this.STR = 13;
    this.DLY = 0.5;
    this.quantity = number;
  }
  min(): number {
    return 2;
  }
  max(): number {
    return 6;
  }
  desc(): string {
    return 'Star-shaped pieces of metal with razor-sharp blades do significant damage when they hit a target. They can be thrown at very high rate.';
  }
  random(): Item {
    this.quantity = Random.Int(5, 15);
    return this;
  }
  price(): number {
    return 15 * this.quantity;
  }
}

export class Tamahawk extends MissileWeapon {
  constructor(number = 1) {
    super();
    this.name = 'tomahawk';
    this.image = ItemSpriteSheet.TOMAHAWK;
    this.STR = 17;
    this.quantity = number;
  }
  min(): number {
    return 4;
  }
  max(): number {
    return 20;
  }
  proc(attacker: Char, defender: Char, damage: number): void {
    super.proc(attacker, defender, damage);
    Buff.affect(defender, B.Bleeding).set(damage);
  }
  desc(): string {
    return 'This throwing axe is not that heavy, but it still requires significant strength to be used effectively.';
  }
  random(): Item {
    this.quantity = Random.Int(5, 12);
    return this;
  }
  price(): number {
    return 20 * this.quantity;
  }
}

export class Boomerang extends MissileWeapon {
  private throwEquiped = false;

  constructor() {
    super();
    this.name = 'boomerang';
    this.image = ItemSpriteSheet.BOOMERANG;
    this.STR = 10;
    this.stackable = false;
  }
  min(): number {
    return this.isBroken() ? 1 : 1 + this.level();
  }
  max(): number {
    return this.isBroken() ? 4 : 4 + 2 * this.level();
  }
  isUpgradable(): boolean {
    return true;
  }
  protected upgradeOnce(): void {
    this.upgradeWeapon(false);
  }
  maxDurability(lvl: number = this.level()): number {
    return 8 * (lvl < 16 ? 16 - lvl : 1);
  }
  proc(attacker: Char, defender: Char, damage: number): void {
    super.proc(attacker, defender, damage);
    const hero = attacker as Hero;
    if (attacker === Dungeon.hero && hero.rangedWeapon === this) this.circleBack(defender.pos, hero);
  }
  protected miss(cell: number): void {
    this.circleBack(cell, Dungeon.hero);
  }
  private circleBack(from: number, owner: Hero): void {
    Events.emit({ type: 'missile', from, to: owner.pos, image: this.imageIndex() });
    if (this.throwEquiped) {
      owner.belongings.weapon = this;
      owner.spend(-1); // -TIME_TO_EQUIP
    } else if (!this.collect(owner.belongings.backpack)) {
      Dungeon.level.drop(this, owner.pos).dropFX(owner.pos);
    }
  }
  cast(user: Hero, dst: number): void {
    this.throwEquiped = this.isEquipped(user);
    super.cast(user, dst);
  }
  desc(): string {
    return 'Thrown to the enemy this flat curved wooden missile will return to the hands of its thrower.';
  }
}

for (const [name, cls] of Object.entries({
  Dart,
  Javelin,
  IncendiaryDart,
  CurareDart,
  Shuriken,
  Tamahawk,
  Boomerang,
})) {
  registerClass(name, cls);
}
