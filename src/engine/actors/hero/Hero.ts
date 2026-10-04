// Port of actors/hero/Hero.java (movement, melee, levelling, stairs). Items, search, hunger etc. arrive in M2.
import { Dungeon } from '../../Dungeon';
import { Events, GLog } from '../../core/events';
import { Random } from '../../core/Random';
import { adjacent, LENGTH } from '../../levels/constants';
import { Terrain } from '../../levels/Terrain';
import type { MeleeWeapon } from '../../items/weapon/MeleeWeapon';
import { Actor, TICK } from '../Actor';
import { Char } from '../Char';
import type { Mob } from '../mobs/Mob';
import { findPath } from '../pathing';
import { observe } from '../../observe';
import type { HeroAction } from './HeroAction';

export type HeroClass = 'WARRIOR' | 'MAGE' | 'ROGUE' | 'HUNTRESS';

export const STARTING_STR = 10;
const TIME_TO_REST = 1;

export class Hero extends Char {
  heroClass: HeroClass = 'ROGUE';
  private attackSkillValue = 10;
  private defenseSkillValue = 5;

  ready = false;
  curAction: HeroAction | null = null;
  lastAction: HeroAction | null = null;
  /** The last attacked enemy (AttackIndicator target in PD). */
  enemy: Char | null = null;

  belongings: { weapon: MeleeWeapon | null; armor: { tier: number } | null } = { weapon: null, armor: null };

  STRValue = STARTING_STR;
  lvl = 1;
  exp = 0;
  awareness = 0.1;
  restoreHealth = false;

  private visibleEnemies: Mob[] = [];

  /** Set by the level-switching code when the hero takes the stairs. */
  pendingTransition: 'descend' | 'ascend' | null = null;

  constructor() {
    super();
    this.name = 'you';
    this.HP = this.HT = 20;
    this.STRValue = STARTING_STR;
  }

  get spriteSheet(): string {
    return { WARRIOR: 'HeroWarrior', MAGE: 'HeroMage', ROGUE: 'HeroRogue', HUNTRESS: 'HeroHuntress' }[this.heroClass];
  }

  STR(): number {
    return this.STRValue;
  }

  tier(): number {
    return this.belongings.armor?.tier ?? 0;
  }

  attackSkill(_target: Char): number {
    const wep = this.belongings.weapon;
    return wep ? Math.trunc(this.attackSkillValue * wep.acuracyFactor(this)) : this.attackSkillValue;
  }

  defenseSkill(_enemy: Char): number {
    const evasion = this.paralysed ? 0.5 : 1;
    return Math.trunc(this.defenseSkillValue * evasion);
  }

  dr(): number {
    return 0;
  }

  damageRoll(): number {
    const wep = this.belongings.weapon;
    return wep ? wep.damageRoll(this) : this.STR() > 10 ? Random.IntRange(1, this.STR() - 9) : 1;
  }

  attackDelay(): number {
    return this.belongings.weapon ? this.belongings.weapon.speedFactor(this) : 1;
  }

  spendAndNext(time: number): void {
    this.busy();
    this.spend(time);
  }

  act(): boolean {
    super.act();

    if (this.paralysed) {
      this.curAction = null;
      this.spendAndNext(TICK);
      return true;
    }

    this.checkVisibleMobs();

    if (this.curAction === null) {
      if (this.restoreHealth) {
        if (this.HP >= this.HT) {
          this.restoreHealth = false;
        } else {
          this.spend(TIME_TO_REST);
          return true;
        }
      }
      this.markReady();
      return false;
    }

    this.restoreHealth = false;
    this.ready = false;
    switch (this.curAction.kind) {
      case 'move':
        return this.actMove(this.curAction.dst);
      case 'attack':
        return this.actAttack(this.curAction.target);
      case 'descend':
        return this.actDescend(this.curAction.dst);
      case 'ascend':
        return this.actAscend(this.curAction.dst);
    }
  }

  busy(): void {
    this.ready = false;
  }

  private markReady(): void {
    this.curAction = null;
    this.ready = true;
  }

  interrupt(): void {
    if (this.isAlive() && this.curAction !== null && this.curAction.dst !== this.pos) {
      this.lastAction = this.curAction;
    }
    this.curAction = null;
  }

  resume(): boolean {
    this.curAction = this.lastAction;
    this.lastAction = null;
    return this.act();
  }

  private actMove(dst: number): boolean {
    if (this.getCloser(dst)) return true;
    if (Dungeon.level.map[this.pos] === Terrain.SIGN) GLog.i('A sign: the ink has faded.');
    this.markReady();
    return false;
  }

  private actAttack(enemy: Char): boolean {
    this.enemy = enemy;
    if (adjacent(this.pos, enemy.pos) && enemy.isAlive() && !this.isCharmedBy(enemy)) {
      this.spend(this.attackDelay());
      Events.emit({ type: 'turn', id: this.id(), from: this.pos, to: enemy.pos });
      this.attack(enemy);
      this.curAction = null;
      return true;
    }
    if (Dungeon.level.fieldOfView[enemy.pos] && this.getCloser(enemy.pos)) return true;
    this.markReady();
    return false;
  }

  private actDescend(stairs: number): boolean {
    if (this.pos === stairs && this.pos === Dungeon.level.exit) {
      this.curAction = null;
      this.pendingTransition = 'descend';
      this.ready = true;
      return false;
    }
    if (this.getCloser(stairs)) return true;
    this.markReady();
    return false;
  }

  private actAscend(stairs: number): boolean {
    if (this.pos === stairs && this.pos === Dungeon.level.entrance) {
      if (Dungeon.depth === 1) {
        GLog.i('One does not simply leave Pixel Dungeon.');
        this.markReady();
        return false;
      }
      this.curAction = null;
      this.pendingTransition = 'ascend';
      this.ready = true;
      return false;
    }
    if (this.getCloser(stairs)) return true;
    this.markReady();
    return false;
  }

  /** Wait a turn (the toolbar's hourglass). */
  rest(tillHealthy: boolean): void {
    this.spendAndNext(TIME_TO_REST);
    if (!tillHealthy) this.showStatus('default', '...');
    this.restoreHealth = tillHealthy;
  }

  private checkVisibleMobs(): void {
    const visible: Mob[] = [];
    let newMob = false;
    for (const m of Dungeon.level.mobs) {
      if (Dungeon.level.fieldOfView[m.pos] && m.hostile) {
        visible.push(m);
        if (!this.visibleEnemies.includes(m)) newMob = true;
      }
    }
    if (newMob) {
      this.interrupt();
      this.restoreHealth = false;
    }
    this.visibleEnemies = visible;
  }

  visibleEnemyCount(): number {
    return this.visibleEnemies.length;
  }

  private getCloser(target: number): boolean {
    if (this.rooted) return false;
    const level = Dungeon.level;
    let step = -1;
    if (adjacent(this.pos, target)) {
      if (Actor.findChar(target) === null) {
        if (level.passable[target] || level.avoid[target]) step = target;
      }
    } else {
      const passable = new Uint8Array(LENGTH);
      for (let i = 0; i < LENGTH; i++) passable[i] = level.passable[i] && (level.visited[i] || level.mapped[i]) ? 1 : 0;
      step = findPath(this, this.pos, target, passable, level.fieldOfView);
    }
    if (step === -1) return false;
    this.move(step);
    this.spend(1 / this.speed());
    return true;
  }

  /** Sets the action for a tapped cell and acts on it. Returns true if the scheduler should continue. */
  handle(cell: number): boolean {
    if (cell === -1) return false;
    const level = Dungeon.level;
    const ch = level.fieldOfView[cell] ? Actor.findChar(cell) : null;
    if (ch && ch !== this) {
      this.curAction = { kind: 'attack', dst: cell, target: ch };
    } else if (cell === level.exit) {
      this.curAction = { kind: 'descend', dst: cell };
    } else if (cell === level.entrance) {
      this.curAction = { kind: 'ascend', dst: cell };
    } else {
      this.curAction = { kind: 'move', dst: cell };
      this.lastAction = null;
    }
    return this.act();
  }

  move(step: number): void {
    super.move(step);
    if (!this.flying) {
      Events.emit({ type: 'sound', name: Dungeon.level.water[this.pos] ? 'snd_water' : 'snd_step' });
      Dungeon.level.press(this.pos, this);
    }
    // PD runs this when the move animation completes; nothing else observes in between, so do it now.
    this.onMotionComplete();
  }

  onMotionComplete(): void {
    observe();
  }

  earnExp(exp: number): void {
    this.exp += exp;
    let levelUp = false;
    while (this.exp >= this.maxExp()) {
      this.exp -= this.maxExp();
      this.lvl++;
      this.HT += 5;
      this.HP += 5;
      this.attackSkillValue++;
      this.defenseSkillValue++;
      if (this.lvl < 10) this.updateAwareness();
      levelUp = true;
    }
    if (levelUp) {
      GLog.p(
        `Welcome to level ${this.lvl}! Now you are healthier and more focused. It's easier for you to hit enemies and dodge their attacks.`,
      );
      this.showStatus('positive', 'level up!');
      Events.emit({ type: 'sound', name: 'snd_levelup' });
    }
  }

  maxExp(): number {
    return 5 + this.lvl * 5;
  }

  updateAwareness(): void {
    this.awareness = 1 - Math.pow(this.heroClass === 'ROGUE' ? 0.85 : 0.9, (1 + Math.min(this.lvl, 9)) * 0.5);
  }

  killedBy(src: Char): void {
    GLog.n(`You were killed by ${src.name}...`);
  }

  die(cause: object | null): void {
    this.curAction = null;
    super.die(cause);
    Events.emit({ type: 'heroDied' });
  }
}
