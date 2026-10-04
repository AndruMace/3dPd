// Port of actors/Char.java: anything with a position, HP and buffs. Sprite calls become events.
import { Dungeon } from '../Dungeon';
import { Events, type StatusColor } from '../core/events';
import { Random } from '../core/Random';
import { adjacent, distance } from '../levels/constants';
import { Terrain } from '../levels/Terrain';
import { Actor } from './Actor';
import type { Buff } from './buffs/Buff';

type BuffClass = abstract new (...args: never[]) => Buff;

export abstract class Char extends Actor {
  pos = 0;
  name = 'mob';
  /** Sprite definition id (see content/sprites.ts) used by the view. */
  spriteId = 'Rat';

  HT = 0;
  HP = 0;

  protected baseSpeed = 1;

  paralysed = false;
  rooted = false;
  flying = false;
  invisible = 0;

  viewDistance = 8;

  private readonly _buffs = new Set<Buff>();

  isChar(): this is Char {
    return true;
  }

  protected act(): boolean {
    Dungeon.level.updateFieldOfView(this);
    return false;
  }

  showStatus(color: StatusColor, text: string): void {
    Events.emit({ type: 'status', id: this.id(), text, color });
  }

  attack(enemy: Char): boolean {
    const visibleFight = Dungeon.visible[this.pos] || Dungeon.visible[enemy.pos];
    Events.emit({ type: 'attack', id: this.id(), target: enemy.pos });

    if (Char.hit(this, enemy, false)) {
      const dr = Random.IntRange(0, enemy.dr());
      const dmg = this.damageRoll();
      let effectiveDamage = Math.max(dmg - dr, 0);
      effectiveDamage = this.attackProc(enemy, effectiveDamage);
      effectiveDamage = enemy.defenseProc(this, effectiveDamage);
      enemy.damage(effectiveDamage, this);

      if (visibleFight) Events.emit({ type: 'sound', name: 'snd_hit', pos: enemy.pos });
      if (enemy === Dungeon.hero) Dungeon.hero.interrupt();
      if (!enemy.isAlive() && visibleFight && enemy === Dungeon.hero) Dungeon.hero.killedBy(this);
      return true;
    } else {
      if (visibleFight) {
        enemy.showStatus('neutral', enemy.defenseVerb());
        Events.emit({ type: 'sound', name: 'snd_miss', pos: enemy.pos });
      }
      return false;
    }
  }

  static hit(attacker: Char, defender: Char, magic: boolean): boolean {
    const acuRoll = Random.Float(attacker.attackSkill(defender));
    const defRoll = Random.Float(defender.defenseSkill(attacker));
    return (magic ? acuRoll * 2 : acuRoll) >= defRoll;
  }

  attackSkill(_target: Char): number {
    return 0;
  }

  defenseSkill(_enemy: Char): number {
    return 0;
  }

  defenseVerb(): string {
    return 'dodged';
  }

  dr(): number {
    return 0;
  }

  damageRoll(): number {
    return 1;
  }

  attackProc(_enemy: Char, damage: number): number {
    return damage;
  }

  defenseProc(_enemy: Char, damage: number): number {
    return damage;
  }

  speed(): number {
    return this.baseSpeed;
  }

  damage(dmg: number, src: object): void {
    if (this.HP <= 0) return;
    const srcClass = src.constructor;
    if (this.immunities().has(srcClass)) dmg = 0;
    else if (this.resistances().has(srcClass)) dmg = Random.IntRange(0, dmg);

    this.HP -= dmg;
    Events.emit({ type: 'damage', id: this.id(), amount: dmg, hp: this.HP, ht: this.HT });
    if (dmg > 0 || src instanceof Char) {
      this.showStatus(this.HP > Math.trunc(this.HT / 2) ? 'warning' : 'negative', String(dmg));
    }
    if (this.HP <= 0) this.die(src);
  }

  destroy(): void {
    this.HP = 0;
    Actor.remove(this);
    Actor.freeCell(this.pos);
  }

  die(_src: object | null): void {
    this.destroy();
    Events.emit({ type: 'die', id: this.id() });
  }

  isAlive(): boolean {
    return this.HP > 0;
  }

  spend(time: number): void {
    super.spend(time);
  }

  buffs(): Set<Buff> {
    return this._buffs;
  }

  buff<T extends Buff>(c: abstract new (...args: never[]) => T): T | null {
    for (const b of this._buffs) if (b instanceof c) return b as T;
    return null;
  }

  buffsOf<T extends Buff>(c: abstract new (...args: never[]) => T): T[] {
    return [...this._buffs].filter((b): b is T => b instanceof c);
  }

  isCharmedBy(_ch: Char): boolean {
    return false;
  }

  addBuff(buff: Buff): void {
    this._buffs.add(buff);
    Actor.add(buff);
  }

  removeBuff(buff: Buff): void {
    this._buffs.delete(buff);
    Actor.remove(buff);
  }

  removeBuffs(c: BuffClass): void {
    for (const b of this.buffsOf(c)) this.removeBuff(b);
  }

  protected onRemove(): void {
    for (const buff of [...this._buffs]) buff.detach();
  }

  stealth(): number {
    return 0;
  }

  move(step: number): void {
    const level = Dungeon.level;
    if (level.map[this.pos] === Terrain.OPEN_DOOR) level.doorLeave(this.pos);
    const from = this.pos;
    this.pos = step;
    Events.emit({ type: 'move', id: this.id(), from, to: step });
    if (this.flying && level.map[this.pos] === Terrain.DOOR) level.doorEnter(this.pos);
  }

  distanceTo(other: Char): number {
    return distance(this.pos, other.pos);
  }

  adjacentTo(other: Char): boolean {
    return adjacent(this.pos, other.pos);
  }

  resistances(): Set<unknown> {
    return EMPTY;
  }

  immunities(): Set<unknown> {
    return EMPTY;
  }
}

const EMPTY = new Set<unknown>();
