// Port of actors/mobs/Mob.java: the shared monster AI (SLEEPING / WANDERING / HUNTING / FLEEING / PASSIVE).
import { Dungeon } from '../../Dungeon';
import { Events, GLog } from '../../core/events';
import { Random } from '../../core/Random';
import { adjacent, distance } from '../../levels/constants';
import { TICK } from '../Actor';
import { Char } from '../Char';
import { findPath, flee } from '../pathing';

export type AiStateName = 'SLEEPING' | 'WANDERING' | 'HUNTING' | 'FLEEING' | 'PASSIVE';

const TIME_TO_WAKE_UP = 1;

export abstract class Mob extends Char {
  state: AiStateName = 'SLEEPING';
  protected target = -1;
  protected defenseSkillValue = 0;
  protected EXP = 1;
  protected maxLvl = 30;
  protected enemy: Char | null = null;
  protected enemySeen = false;
  protected alerted = false;
  hostile = true;

  protected act(): boolean {
    super.act();
    const justAlerted = this.alerted;
    this.alerted = false;

    if (this.paralysed) {
      this.enemySeen = false;
      this.spend(TICK);
      return true;
    }

    this.enemy = this.chooseEnemy();
    const enemy = this.enemy;
    const enemyInFOV =
      enemy !== null && enemy.isAlive() && !!Dungeon.level.fieldOfView[enemy.pos] && enemy.invisible <= 0;

    switch (this.state) {
      case 'SLEEPING':
        return this.actSleeping(enemyInFOV);
      case 'WANDERING':
        return this.actWandering(enemyInFOV, justAlerted);
      case 'HUNTING':
        return this.actHunting(enemyInFOV);
      case 'FLEEING':
        return this.actFleeing(enemyInFOV);
      case 'PASSIVE':
        this.enemySeen = false;
        this.spend(TICK);
        return true;
    }
  }

  protected chooseEnemy(): Char | null {
    return this.enemy !== null && this.enemy.isAlive() ? this.enemy : Dungeon.hero;
  }

  protected canAttack(enemy: Char): boolean {
    return adjacent(this.pos, enemy.pos) && !this.isCharmedBy(enemy);
  }

  protected getCloser(target: number): boolean {
    if (this.rooted) return false;
    const step = findPath(this, this.pos, target, Dungeon.level.passable, Dungeon.level.fieldOfView);
    if (step !== -1) {
      this.move(step);
      return true;
    }
    return false;
  }

  protected getFurther(target: number): boolean {
    const step = flee(this, this.pos, target, Dungeon.level.passable, Dungeon.level.fieldOfView);
    if (step !== -1) {
      this.move(step);
      return true;
    }
    return false;
  }

  move(step: number): void {
    super.move(step);
    if (!this.flying) Dungeon.level.mobPress(this);
  }

  protected attackDelay(): number {
    return 1;
  }

  protected doAttack(enemy: Char): boolean {
    this.attack(enemy);
    this.spend(this.attackDelay());
    return true;
  }

  defenseSkill(_enemy: Char): number {
    return this.enemySeen && !this.paralysed ? this.defenseSkillValue : 0;
  }

  aggro(ch: Char): void {
    this.enemy = ch;
  }

  damage(dmg: number, src: object): void {
    if (this.state === 'SLEEPING') this.state = 'WANDERING';
    this.alerted = true;
    super.damage(dmg, src);
  }

  destroy(): void {
    super.destroy();
    Dungeon.level.mobs.delete(this);
    if (Dungeon.hero.isAlive()) {
      const exp = this.exp();
      if (exp > 0) {
        Dungeon.hero.showStatus('positive', `+${exp}EXP`);
        Dungeon.hero.earnExp(exp);
      }
    }
  }

  exp(): number {
    return Dungeon.hero.lvl <= this.maxLvl ? this.EXP : 0;
  }

  die(cause: object | null): void {
    super.die(cause);
    if (Dungeon.hero.lvl <= this.maxLvl + 2) this.dropLoot();
    if (Dungeon.hero.isAlive() && !Dungeon.visible[this.pos]) GLog.i('You hear something died in the distance.');
  }

  protected dropLoot(): void {}

  reset(): boolean {
    return false;
  }

  beckon(cell: number): void {
    this.notice();
    if (this.state !== 'HUNTING') this.state = 'WANDERING';
    this.target = cell;
  }

  description(): string {
    return 'Real description is coming soon!';
  }

  notice(): void {
    Events.emit({ type: 'alert', id: this.id() });
  }

  yell(str: string): void {
    GLog.n(`${this.name}: "${str}" `);
  }

  status(): string {
    return `This ${this.name} is ${this.state.toLowerCase()}`;
  }

  // ---- AI states ----

  private actSleeping(enemyInFOV: boolean): boolean {
    const enemy = this.enemy!;
    if (enemyInFOV && Random.Int(this.distanceTo(enemy) + enemy.stealth() + (enemy.flying ? 2 : 0)) === 0) {
      this.enemySeen = true;
      this.notice();
      this.state = 'HUNTING';
      this.target = enemy.pos;
      this.spend(TIME_TO_WAKE_UP);
    } else {
      this.enemySeen = false;
      this.spend(TICK);
    }
    return true;
  }

  private actWandering(enemyInFOV: boolean, justAlerted: boolean): boolean {
    const enemy = this.enemy!;
    if (
      enemyInFOV &&
      (justAlerted || Random.Int(Math.trunc(distance(this.pos, enemy.pos) / 2) + enemy.stealth()) === 0)
    ) {
      this.enemySeen = true;
      this.notice();
      this.state = 'HUNTING';
      this.target = enemy.pos;
    } else {
      this.enemySeen = false;
      if (this.target !== -1 && this.getCloser(this.target)) {
        this.spend(1 / this.speed());
      } else {
        this.target = Dungeon.level.randomDestination();
        this.spend(TICK);
      }
    }
    return true;
  }

  private actHunting(enemyInFOV: boolean): boolean {
    const enemy = this.enemy!;
    this.enemySeen = enemyInFOV;
    if (enemyInFOV && this.canAttack(enemy)) {
      return this.doAttack(enemy);
    }
    if (enemyInFOV) this.target = enemy.pos;
    if (this.target !== -1 && this.getCloser(this.target)) {
      this.spend(1 / this.speed());
    } else {
      this.spend(TICK);
      this.state = 'WANDERING';
      this.target = Dungeon.level.randomDestination();
    }
    return true;
  }

  private actFleeing(enemyInFOV: boolean): boolean {
    this.enemySeen = enemyInFOV;
    if (enemyInFOV) this.target = this.enemy!.pos;
    if (this.target !== -1 && this.getFurther(this.target)) {
      this.spend(1 / this.speed());
    } else {
      this.spend(TICK);
      this.nowhereToRun();
    }
    return true;
  }

  protected nowhereToRun(): void {}
}
