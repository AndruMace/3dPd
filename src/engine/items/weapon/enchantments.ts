// Ports of items/weapon/enchantments/*.
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import { Buff } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import { registerClass } from '../../core/Bundle';
import { Fx } from '../../core/fx';
import { Random } from '../../core/Random';
import { NEIGHBOURS8 } from '../../levels/constants';
import { LIGHTNING } from '../../levels/traps/Electricity';
import type { Glowing } from '../Item';
import { Enchantment } from './Enchantment';
import type { Weapon } from './Weapon';

const lvl = (weapon: Weapon) => Math.max(0, weapon.effectiveLevel());

export class Death extends Enchantment {
  proc(weapon: Weapon, attacker: Char, defender: Char): boolean {
    if (Random.Int(lvl(weapon) + 100) >= 92) {
      defender.damage(defender.HP, this);
      Fx.burst('ShadowParticle.UP', { id: defender.id() }, 5);
      if (!defender.isAlive() && attacker === Dungeon.hero) Badges.validateGrimWeapon();
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0x000000;
  }
  name(weaponName: string): string {
    return `grim ${weaponName}`;
  }
}

export class Fire extends Enchantment {
  proc(weapon: Weapon, _attacker: Char, defender: Char): boolean {
    const level = lvl(weapon);
    if (Random.Int(level + 3) >= 2) {
      if (Random.Int(2) === 0) Buff.affect(defender, B.Burning).reignite(defender);
      defender.damage(Random.Int(1, level + 2), this);
      Fx.burst('FlameParticle', { id: defender.id() }, level + 1);
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0xff4400;
  }
  name(weaponName: string): string {
    return `blazing ${weaponName}`;
  }
}

export class Horror extends Enchantment {
  proc(weapon: Weapon, attacker: Char, defender: Char): boolean {
    if (Random.Int(lvl(weapon) + 5) >= 4) {
      if (defender === Dungeon.hero) Buff.affect(defender, B.Vertigo, B.Vertigo.duration(defender));
      else Buff.affect(defender, B.Terror, B.Terror.DURATION).object = attacker.id();
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0x222222;
  }
  name(weaponName: string): string {
    return `eldritch ${weaponName}`;
  }
}

export class Instability extends Enchantment {
  proc(weapon: Weapon, attacker: Char, defender: Char, damage: number): boolean {
    return randomEnchantment().proc(weapon, attacker, defender, damage);
  }
  name(weaponName: string): string {
    return `unstable ${weaponName}`;
  }
}

export class Leech extends Enchantment {
  proc(weapon: Weapon, attacker: Char, _defender: Char, damage: number): boolean {
    const level = lvl(weapon);
    const maxValue = Math.trunc((damage * (level + 2)) / (level + 6));
    const effValue = Math.min(Random.IntRange(0, maxValue), attacker.HT - attacker.HP);
    if (effValue > 0) {
      attacker.heal(effValue);
      Fx.start('Speck.HEALING', attacker.pos, 0.4, 1);
      attacker.showStatus('positive', String(effValue));
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0x660022;
  }
  name(weaponName: string): string {
    return `vampiric ${weaponName}`;
  }
}

export class Luck extends Enchantment {
  proc(weapon: Weapon, attacker: Char, defender: Char, damage: number): boolean {
    const level = lvl(weapon);
    let dmg = damage;
    for (let i = 1; i <= level + 1; i++) dmg = Math.max(dmg, attacker.damageRoll() - i);
    if (dmg > damage) {
      defender.damage(dmg - damage, this);
      return true;
    }
    return false;
  }
  name(weaponName: string): string {
    return `lucky ${weaponName}`;
  }
  glowing(): Glowing {
    return 0x00ff00;
  }
}

export class Paralysis extends Enchantment {
  proc(weapon: Weapon, _attacker: Char, defender: Char): boolean {
    const level = lvl(weapon);
    if (Random.Int(level + 8) >= 7) {
      Buff.prolong(defender, B.Paralysis, Random.Float(1, 1.5 + level));
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0xccaa44;
  }
  name(weaponName: string): string {
    return `stunning ${weaponName}`;
  }
}

export class Poison extends Enchantment {
  proc(weapon: Weapon, _attacker: Char, defender: Char): boolean {
    const level = lvl(weapon);
    if (Random.Int(level + 3) >= 2) {
      Buff.affect(defender, B.Poison).set(B.Poison.durationFactor(defender) * (level + 1));
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0x4400aa;
  }
  name(weaponName: string): string {
    return `venomous ${weaponName}`;
  }
}

export class Shock extends Enchantment {
  private affected: Char[] = [];
  private points: number[] = [];

  proc(weapon: Weapon, attacker: Char, defender: Char, damage: number): boolean {
    if (Random.Int(lvl(weapon) + 4) >= 3) {
      this.points = [attacker.pos];
      this.affected = [attacker];
      this.hit(defender, Random.Int(1, Math.trunc(damage / 2)));
      Fx.bolt('Lightning', this.points[0], this.points[this.points.length - 1]);
      return true;
    }
    return false;
  }

  name(weaponName: string): string {
    return `shocking ${weaponName}`;
  }

  private hit(ch: Char, damage: number): void {
    if (damage < 1) return;
    this.affected.push(ch);
    ch.damage(Dungeon.level.water[ch.pos] && !ch.flying ? Math.trunc(damage * 2) : damage, LIGHTNING);
    Fx.burst('SparkParticle', { id: ch.id() }, 3);
    this.points.push(ch.pos);
    const ns = new Set<Char>();
    for (const n8 of NEIGHBOURS8) {
      const n = Actor.findChar(ch.pos + n8);
      if (n && !this.affected.includes(n)) ns.add(n);
    }
    if (ns.size > 0) this.hit(Random.element(ns)!, Random.Int(Math.trunc(damage / 2), damage));
  }
}

export class Slow extends Enchantment {
  proc(weapon: Weapon, _attacker: Char, defender: Char): boolean {
    const level = lvl(weapon);
    if (Random.Int(level + 4) >= 3) {
      Buff.prolong(defender, B.Slow, Random.Float(1, 1.5 + level));
      return true;
    }
    return false;
  }
  glowing(): Glowing {
    return 0x0044ff;
  }
  name(weaponName: string): string {
    return `chilling ${weaponName}`;
  }
}

export class Tempering extends Enchantment {
  proc(weapon: Weapon): boolean {
    weapon.polish();
    return true;
  }
  glowing(): Glowing {
    return 0xcc8888;
  }
  name(weaponName: string): string {
    return `tempered ${weaponName}`;
  }
}

const ENCHANTS: (new () => Enchantment)[] = [
  Fire,
  Poison,
  Death,
  Paralysis,
  Leech,
  Slow,
  Shock,
  Instability,
  Horror,
  Luck,
  Tempering,
];
const CHANCES = [10, 10, 1, 2, 1, 2, 6, 3, 2, 2, 3];

export function randomEnchantment(): Enchantment {
  return new ENCHANTS[Random.chances(CHANCES)]();
}

for (const [name, cls] of Object.entries({
  Death,
  Fire,
  Horror,
  Instability,
  Leech,
  Luck,
  Paralysis,
  Poison,
  Shock,
  Slow,
  Tempering,
})) {
  registerClass(`Enchantment.${name}`, cls);
}
