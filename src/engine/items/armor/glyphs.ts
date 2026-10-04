// Ports of items/armor/glyphs/*.
import { Badges } from '../../Badges';
import { Dungeon, ResultDescriptions } from '../../Dungeon';
import { Actor, TICK } from '../../actors/Actor';
import type { Blob } from '../../actors/blobs/Blob';
import { Buff, BuffIndicator } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { adjacent, LENGTH, NEIGHBOURS8 } from '../../levels/constants';
import { LIGHTNING } from '../../levels/traps/Electricity';
import { observe } from '../../observe';
import type { Glowing } from '../Item';
import type { Armor } from './Armor';
import { Glyph } from './Glyph';

const lvl = (armor: Armor) => Math.max(0, armor.effectiveLevel());
const appear = (ch: Char, pos: number) => lazy<{ appear(ch: Char, pos: number): void }>('WandOfBlink').appear(ch, pos);

export class Affection extends Glyph {
  proc(armor: Armor, attacker: Char, defender: Char, damage: number): number {
    const level = Math.max(0, Math.min(armor.effectiveLevel(), 6));
    if (adjacent(attacker.pos, defender.pos) && Random.Int(Math.trunc(level / 2) + 5) >= 4) {
      let duration = Random.IntRange(3, 7);
      Buff.affect(attacker, B.Charm, B.Charm.durationFactor(attacker) * duration).object = defender.id();
      Fx.start('Speck.HEART', attacker.pos, 0.2, 5);
      duration = Math.trunc(duration * Random.Float(0.5, 1)); // int *= float truncates in Java
      Buff.affect(defender, B.Charm, B.Charm.durationFactor(defender) * duration).object = attacker.id();
      Fx.start('Speck.HEART', defender.pos, 0.2, 5);
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of affection`;
  }
  glowing(): Glowing {
    return 0xff4488;
  }
}

export class AntiEntropy extends Glyph {
  proc(armor: Armor, attacker: Char, defender: Char, damage: number): number {
    if (adjacent(attacker.pos, defender.pos) && Random.Int(lvl(armor) + 6) >= 5) {
      Buff.prolong(attacker, B.Frost, B.Frost.duration(attacker) * Random.Float(1, 1.5));
      Fx.start('SnowParticle', attacker.pos, 0.2, 6);
      Buff.affect(defender, B.Burning).reignite(defender);
      Fx.burst('FlameParticle', { id: defender.id() }, 5);
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of anti-entropy`;
  }
  glowing(): Glowing {
    return 0x0000ff;
  }
}

export class AutoRepair extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    if (defender === Dungeon.hero && Dungeon.gold >= armor.tier) {
      Dungeon.gold -= armor.tier;
      armor.polish();
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of auto-repair`;
  }
  glowing(): Glowing {
    return 0xcc8888;
  }
}

export class Bounce extends Glyph {
  proc(armor: Armor, attacker: Char, defender: Char, damage: number): number {
    const level = Dungeon.level;
    if (adjacent(attacker.pos, defender.pos) && Random.Int(lvl(armor) + 5) >= 4) {
      for (const ofs of NEIGHBOURS8) {
        if (attacker.pos - defender.pos === ofs) {
          const newPos = attacker.pos + ofs;
          if ((level.passable[newPos] || level.avoid[newPos]) && Actor.findChar(newPos) === null) {
            Events.emit({ type: 'fx', fx: 'pushing', id: attacker.id(), pos: attacker.pos, to: newPos });
            attacker.pos = newPos;
            if (attacker === Dungeon.hero) level.press(newPos, attacker);
            else level.mobPress(attacker as never);
          }
          break;
        }
      }
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of bounce`;
  }
}

export class Displacement extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    if (Dungeon.bossLevel()) return damage;
    const level = armor.effectiveLevel();
    const nTries = (level < 0 ? 1 : level + 1) * 5;
    for (let i = 0; i < nTries; i++) {
      const pos = Random.Int(LENGTH);
      if (Dungeon.visible[pos] && Dungeon.level.passable[pos] && Actor.findChar(pos) === null) {
        appear(defender, pos);
        Dungeon.level.press(pos, defender);
        observe();
        break;
      }
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of displacement`;
  }
  glowing(): Glowing {
    return 0x66aaff;
  }
}

export class Entanglement extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    const level = lvl(armor);
    if (Random.Int(4) === 0) {
      Buff.prolong(defender, B.Roots, 5 - Math.trunc(level / 5));
      Buff.affect(defender, lazy<new () => Buff & { level(v: number): void }>('Earthroot.Armor')).level(
        5 * (level + 1),
      );
      Fx.start('EarthParticle', defender.pos, 0.05, 8);
      Fx.shake(1, 0.4);
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of entanglement`;
  }
  glowing(): Glowing {
    return 0x448822;
  }
}

export class Metabolism extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    const level = lvl(armor);
    if (Random.Int(Math.trunc(level / 2) + 5) >= 4) {
      const healing = Math.min(defender.HT - defender.HP, Random.Int(1, Math.trunc(defender.HT / 5)));
      if (healing > 0) {
        const hunger = defender.buff(B.Hunger);
        if (hunger !== null && !hunger.isStarving()) {
          hunger.satisfy(-B.Hunger.STARVING / 10);
          defender.heal(healing);
          Fx.burst('Speck.HEALING', { id: defender.id() }, 1);
          defender.showStatus('positive', String(healing));
        }
      }
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of metabolism`;
  }
  glowing(): Glowing {
    return 0xcc0000;
  }
}

export class Multiplicity extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    const level = lvl(armor);
    if (Random.Int(Math.trunc(level / 2) + 6) >= 5) {
      const respawnPoints: number[] = [];
      for (const n of NEIGHBOURS8) {
        const p = defender.pos + n;
        if (Actor.findChar(p) === null && (Dungeon.level.passable[p] || Dungeon.level.avoid[p])) respawnPoints.push(p);
      }
      if (respawnPoints.length > 0) {
        const MirrorImage = lazy<new () => Char & { duplicate(h: Hero): void }>('MirrorImage');
        const mob = new MirrorImage();
        mob.duplicate(defender as Hero);
        Dungeon.level.addMob(mob as never);
        appear(mob, Random.element(respawnPoints)!);
        defender.damage(Random.IntRange(1, Math.trunc(defender.HT / 6)), this);
        this.checkOwner(defender);
      }
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of multiplicity`;
  }
  glowing(): Glowing {
    return 0xccaa88;
  }
}

export class Potential extends Glyph {
  proc(armor: Armor, attacker: Char, defender: Char, damage: number): number {
    if (adjacent(attacker.pos, defender.pos) && Random.Int(lvl(armor) + 7) >= 6) {
      let dmg = Random.IntRange(1, damage);
      attacker.damage(dmg, LIGHTNING);
      dmg = Random.IntRange(1, dmg);
      defender.damage(dmg, LIGHTNING);
      this.checkOwner(defender);
      if (defender === Dungeon.hero) Fx.shake(2, 0.3);
      Fx.bolt('Lightning', attacker.pos, defender.pos);
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of potential`;
  }
  glowing(): Glowing {
    return 0x66ccee;
  }
}

export class Stench extends Glyph {
  proc(armor: Armor, attacker: Char, defender: Char, damage: number): number {
    if (adjacent(attacker.pos, defender.pos) && Random.Int(lvl(armor) + 5) >= 4) {
      const ToxicGas = lazy<typeof Blob>('ToxicGas');
      Dungeon.level.addBlob(ToxicGas.seed(attacker.pos, 20, ToxicGas));
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of stench`;
  }
  glowing(): Glowing {
    return 0x22cc44;
  }
}

export class Viscosity extends Glyph {
  proc(armor: Armor, _attacker: Char, defender: Char, damage: number): number {
    if (damage === 0) return 0;
    if (Random.Int(lvl(armor) + 7) >= 6) {
      let debuff = defender.buff(DeferedDamage);
      if (debuff === null) {
        debuff = new DeferedDamage();
        debuff.attachTo(defender);
      }
      debuff.prolongDamage(damage);
      defender.showStatus('warning', `deferred ${damage}`);
      return 0;
    }
    return damage;
  }
  name(armorName: string): string {
    return `${armorName} of viscosity`;
  }
  glowing(): Glowing {
    return 0x8844cc;
  }
}

export class DeferedDamage extends Buff {
  protected damageLeft = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('damage', this.damageLeft);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.damageLeft = bundle.getInt('damage');
  }

  attachTo(target: Char): boolean {
    if (super.attachTo(target)) {
      this.postpone(TICK);
      return true;
    }
    return false;
  }

  prolongDamage(damage: number): void {
    this.damageLeft += damage;
  }

  icon(): number {
    return BuffIndicator.DEFERRED;
  }

  toString(): string {
    return `Defered damage (${this.damageLeft})`;
  }

  protected act(): boolean {
    if (this.target.isAlive()) {
      this.target.damage(1, this);
      if (this.target === Dungeon.hero && !this.target.isAlive()) {
        Dungeon.fail(ResultDescriptions.GLYPH('enchantment of viscosity', Dungeon.depth));
        GLog.n('The enchantment of viscosity killed you...');
        Badges.validateDeathFromGlyph();
      }
      this.spend(TICK);
      if (--this.damageLeft <= 0) this.detach();
    } else {
      this.detach();
    }
    return true;
  }
}

const GLYPHS: (new () => Glyph)[] = [
  Bounce,
  Affection,
  AntiEntropy,
  Multiplicity,
  Potential,
  Metabolism,
  Stench,
  Viscosity,
  Displacement,
  Entanglement,
  AutoRepair,
];
const CHANCES = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1];

export function randomGlyph(): Glyph {
  return new GLYPHS[Random.chances(CHANCES)]();
}

for (const [name, cls] of Object.entries({
  Affection,
  AntiEntropy,
  AutoRepair,
  Bounce,
  Displacement,
  Entanglement,
  Metabolism,
  Multiplicity,
  Potential,
  Stench,
  Viscosity,
})) {
  registerClass(`Glyph.${name}`, cls);
}
registerClass('Viscosity.DeferedDamage', DeferedDamage);
