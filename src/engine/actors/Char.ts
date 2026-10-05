// Port of actors/Char.java: anything with a position, HP and buffs. Sprite calls become events.
import { Assets } from '../../content/generated/Assets';
import { Dungeon, ResultDescriptions } from '../Dungeon';
import type { Bundle } from '../core/Bundle';
import { Events, GLog, type CharState, type StatusColor } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { lazy } from '../core/lazy';
import { Random } from '../core/Random';
import { adjacent, distance, NEIGHBOURS8 } from '../levels/constants';
import { Terrain } from '../levels/Terrain';
import { Actor } from './Actor';
import { Buff, type BuffClass } from './buffs/Buff';
import * as B from './buffs/buffs';

/** Hero.Doom: causes of death that write their own epitaph. */
export interface Doom {
  onDeath(): void;
}
export function isDoom(x: unknown): x is Doom {
  return !!x && typeof (x as Doom).onDeath === 'function';
}

/** Action mode: share of a blow that lands on a miss. */
export const GRAZE = 0.25;

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

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('pos', this.pos);
    bundle.put('HP', this.HP);
    bundle.put('HT', this.HT);
    bundle.put(
      'buffs',
      [...this._buffs].filter((b) => !b.isTransient()),
    );
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.pos = bundle.getInt('pos');
    this.HP = bundle.getInt('HP');
    this.HT = bundle.getInt('HT');
    for (const b of bundle.getCollection<Buff>('buffs')) b.attachTo(this);
  }

  /**
   * Action mode: this character still takes PD turns on the world clock (it never moves, only times out, like
   * the Wand of Flock's sheep). Everyone else is driven by the real-time brain.
   */
  realtimeScheduled(): boolean {
    return false;
  }

  /** Action mode: appear right beside this character (a swarm's split) rather than in the middle of a cell. */
  realtimeSpawnNear: Char | null = null;

  showStatus(color: StatusColor, text: string): void {
    Events.emit({ type: 'status', id: this.id(), text, color });
  }

  setState(state: CharState, on: boolean): void {
    Events.emit({ type: 'charState', id: this.id(), state, on });
  }

  attack(enemy: Char): boolean {
    const visibleFight = !!(Dungeon.visible[this.pos] || Dungeon.visible[enemy.pos]);
    const hero = Dungeon.hero;
    const isHero = (this as Char) === hero;

    if (Char.hit(this, enemy, false)) {
      if (visibleFight) GLog.i(`${this.name} hit ${enemy.name}`);

      const dr =
        isHero && hero.rangedWeapon !== null && hero.subClass === 'SNIPER' ? 0 : Random.IntRange(0, enemy.dr());
      const dmg = this.damageRoll();
      let effectiveDamage = Math.max(dmg - dr, 0);
      effectiveDamage = this.attackProc(enemy, effectiveDamage);
      effectiveDamage = enemy.defenseProc(this, effectiveDamage);
      enemy.damage(effectiveDamage, this);

      if (visibleFight) Sample.play(Assets.SND_HIT, enemy.pos);
      if (enemy === hero) {
        hero.interrupt();
        if (effectiveDamage > Math.trunc(enemy.HT / 4)) {
          Fx.shake(Math.max(1, Math.min(5, Math.trunc(effectiveDamage / Math.trunc(enemy.HT / 4)))), 0.3);
        }
      }
      Fx.blood(enemy.id(), effectiveDamage);

      if (!enemy.isAlive() && visibleFight) {
        if (enemy === hero) {
          if (hero.killerGlyph !== null) {
            // FIXME in the original: glyph deaths are reported by the glyph itself.
          } else {
            const isBoss = lazy<{ isBoss(m: Char): boolean }>('Bestiary').isBoss(this);
            Dungeon.fail(
              isBoss
                ? ResultDescriptions.BOSS(this.name, Dungeon.depth)
                : ResultDescriptions.MOB(indefinite(this.name), Dungeon.depth),
            );
            GLog.n(`${this.name} killed you...`);
          }
        } else {
          GLog.i(`${this.name} defeated ${enemy.name}`);
        }
      }
      return true;
    } else if (Dungeon.realtime) {
      // Action mode: a miss still grazes (a fraction of the blow, no special effects), so swings never whiff.
      const dmg = Math.max(0, this.damageRoll() - Random.IntRange(0, enemy.dr()));
      const graze = Math.round(dmg * GRAZE);
      if (visibleFight) {
        GLog.i(isHero ? `You graze ${enemy.name}` : `${this.name} grazes ${enemy.name}`);
        Sample.play(Assets.SND_MISS, enemy.pos);
      }
      if (graze > 0) enemy.damage(graze, this);
      else if (visibleFight) enemy.showStatus('neutral', enemy.defenseVerb());
      if (!enemy.isAlive() && enemy === hero) {
        Dungeon.fail(ResultDescriptions.MOB(indefinite(this.name), Dungeon.depth));
        GLog.n(`${this.name} killed you...`);
      }
      return false;
    } else {
      if (visibleFight) {
        enemy.showStatus('neutral', enemy.defenseVerb());
        if (isHero) GLog.i(`${enemy.name} ${enemy.defenseVerb()} your attack`);
        else GLog.i(`${enemy.name} ${enemy.defenseVerb()} ${this.name}'s attack`);
        Sample.play(Assets.SND_MISS, enemy.pos);
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
    return this.buff(B.Cripple) === null ? this.baseSpeed : this.baseSpeed * 0.5;
  }

  damage(dmg: number, src: object): void {
    if (this.HP <= 0) return;

    Buff.detach(this, B.Frost);

    const srcClass = src.constructor;
    if (this.immunities().has(srcClass)) dmg = 0;
    else if (this.resistances().has(srcClass)) dmg = Random.IntRange(0, dmg);

    if (this.buff(B.Paralysis) !== null) {
      if (Random.Int(dmg) >= Random.Int(this.HP)) {
        Buff.detach(this, B.Paralysis);
        if (Dungeon.visible[this.pos]) GLog.i(`The pain snapped ${this.name} out of paralysis`);
      }
    }

    this.HP -= dmg;
    Events.emit({ type: 'damage', id: this.id(), amount: dmg, hp: this.HP, ht: this.HT });
    if (dmg > 0 || src instanceof Char) {
      this.showStatus(this.HP > Math.trunc(this.HT / 2) ? 'warning' : 'negative', String(dmg));
    }
    if (this.HP <= 0) this.die(src);
  }

  /** HP gain that isn't damage (healing, regeneration): keeps the view's health bar in sync. */
  heal(amount: number): void {
    this.HP = Math.min(this.HT, this.HP + amount);
    this.notifyHp();
  }

  notifyHp(): void {
    Events.emit({ type: 'hp', id: this.id(), hp: this.HP, ht: this.HT });
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
    let timeScale = 1;
    if (this.buff(B.Slow) !== null) timeScale *= 0.5;
    if (this.buff(B.Speed) !== null) timeScale *= 2;
    super.spend(time / timeScale);
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

  isCharmedBy(ch: Char): boolean {
    const chID = ch.id();
    for (const b of this._buffs) if (b instanceof B.Charm && b.object === chID) return true;
    return false;
  }

  add(buff: Buff): void {
    this._buffs.add(buff);
    Actor.add(buff);

    if (buff instanceof B.Poison) {
      Fx.burst('PoisonParticle.SPLASH', { pos: this.pos }, 5);
      this.showStatus('negative', 'poisoned');
    } else if (buff instanceof B.Amok) {
      this.showStatus('negative', 'amok');
    } else if (buff instanceof B.Slow) {
      this.showStatus('negative', 'slowed');
    } else if (buff instanceof B.MindVision) {
      this.showStatus('positive', 'mind');
      this.showStatus('positive', 'vision');
    } else if (buff instanceof B.Paralysis) {
      this.setState('PARALYSED', true);
      this.showStatus('negative', 'paralysed');
    } else if (buff instanceof B.Terror) {
      this.showStatus('negative', 'frightened');
    } else if (buff instanceof B.Roots) {
      this.showStatus('negative', 'rooted');
    } else if (buff instanceof B.Cripple) {
      this.showStatus('negative', 'crippled');
    } else if (buff instanceof B.Bleeding) {
      this.showStatus('negative', 'bleeding');
    } else if (buff instanceof B.Vertigo) {
      this.showStatus('negative', 'dizzy');
    } else if (buff instanceof B.Burning) {
      this.setState('BURNING', true);
    } else if (buff instanceof B.Levitation) {
      this.setState('LEVITATING', true);
    } else if (buff instanceof B.Frost) {
      this.setState('FROZEN', true);
    } else if (buff instanceof B.Invisibility) {
      if (!(buff instanceof B.Shadows)) this.showStatus('positive', 'invisible');
      this.setState('INVISIBLE', true);
    }
  }

  remove(buff: Buff): void;
  remove(buffClass: BuffClass): void;
  remove(b: Buff | BuffClass): void {
    if (!(b instanceof Buff)) {
      for (const buff of this.buffsOf(b)) this.remove(buff);
      return;
    }
    const buff = b;
    this._buffs.delete(buff);
    Actor.remove(buff);
    if (buff instanceof B.Burning) this.setState('BURNING', false);
    else if (buff instanceof B.Levitation) this.setState('LEVITATING', false);
    else if (buff instanceof B.Invisibility && this.invisible <= 0) this.setState('INVISIBLE', false);
    else if (buff instanceof B.Paralysis) this.setState('PARALYSED', false);
    else if (buff instanceof B.Frost) this.setState('FROZEN', false);
  }

  onRemove(): void {
    for (const buff of [...this._buffs]) buff.detach();
  }

  /** CharSprite states implied by current buffs (sent when a character's view is created). */
  spriteStates(): CharState[] {
    const out: CharState[] = [];
    for (const buff of this._buffs) {
      if (buff instanceof B.Burning) out.push('BURNING');
      else if (buff instanceof B.Levitation) out.push('LEVITATING');
      else if (buff instanceof B.Invisibility) out.push('INVISIBLE');
      else if (buff instanceof B.Paralysis) out.push('PARALYSED');
      else if (buff instanceof B.Frost) out.push('FROZEN');
      else if (buff instanceof B.Light) out.push('ILLUMINATED');
    }
    return out;
  }

  stealth(): number {
    return 0;
  }

  move(step: number): void {
    const level = Dungeon.level;
    if (adjacent(step, this.pos) && this.buff(B.Vertigo) !== null) {
      step = this.pos + NEIGHBOURS8[Random.Int(8)];
      if (!(level.passable[step] || level.avoid[step]) || Actor.findChar(step) !== null) return;
    }
    // In action mode doors follow whoever is near them (ActionGame), not cell-by-cell moves.
    if (!Dungeon.realtime && level.map[this.pos] === Terrain.OPEN_DOOR) level.doorLeave(this.pos);
    const from = this.pos;
    this.pos = step;
    Events.emit({ type: 'move', id: this.id(), from, to: step });
    if (this.flying && level.map[this.pos] === Terrain.DOOR) level.doorEnter(this.pos);
  }

  distanceTo(other: Char): number {
    return distance(this.pos, other.pos);
  }

  resistances(): Set<unknown> {
    return EMPTY;
  }

  immunities(): Set<unknown> {
    return EMPTY;
  }
}

const EMPTY = new Set<unknown>();

/** Utils.indefinite: "a rat", "an eye". */
export function indefinite(noun: string): string {
  if (noun.length === 0) return 'a';
  return (/[aeiou]/i.test(noun[0]) ? 'an ' : 'a ') + noun;
}

export function capitalize(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}
