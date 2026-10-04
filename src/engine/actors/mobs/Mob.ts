// Port of actors/mobs/Mob.java: the shared monster AI (SLEEPING / WANDERING / HUNTING / FLEEING / PASSIVE).
import { Badges } from '../../Badges';
import { Dungeon, Statistics } from '../../Dungeon';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx } from '../../core/fx';
import { Random } from '../../core/Random';
import type { Category } from '../../items/Generator';
import type { Item } from '../../items/Item';
import { lazy } from '../../core/lazy';
import { adjacent, distance } from '../../levels/constants';
import { Actor, TICK } from '../Actor';
import type { Buff } from '../buffs/Buff';
import { Amok, Sleep, Terror } from '../buffs/buffs';
import { Char } from '../Char';
import { findPath, flee } from '../pathing';

export type AiStateName = 'SLEEPING' | 'WANDERING' | 'HUNTING' | 'FLEEING' | 'PASSIVE';

const TIME_TO_WAKE_UP = 1;

type Loot = Category | (new () => Item) | Item | null;

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

  protected loot: Loot = null;
  protected lootChance = 0;

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('state', this.state);
    bundle.put('target', this.target);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.state = bundle.getEnum<AiStateName>('state', 'SLEEPING');
    this.target = bundle.getInt('target');
  }

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
    if (this.buff(Amok) !== null) {
      if (this.enemy === Dungeon.hero || this.enemy === null) {
        const enemies = new Set<Mob>();
        for (const mob of Dungeon.level.mobs) if (mob !== this && Dungeon.level.fieldOfView[mob.pos]) enemies.add(mob);
        if (enemies.size > 0) return Random.element(enemies);
      }
    }
    const terror = this.buff(Terror);
    if (terror !== null) {
      const source = Actor.findById(terror.object);
      if (source && source.isChar()) return source;
    }
    return this.enemy !== null && this.enemy.isAlive() ? this.enemy : Dungeon.hero;
  }

  /** Moving is animated only when the hero can see it, otherwise the sprite is just placed. */
  protected moveSprite(_from: number, _to: number): boolean {
    return true;
  }

  add(buff: Buff): void {
    super.add(buff);
    if (buff instanceof Amok) {
      this.showStatus('negative', '#$%^');
      this.state = 'HUNTING';
    } else if (buff instanceof Terror) {
      this.state = 'FLEEING';
    } else if (buff instanceof Sleep) {
      Fx.flare(this.id(), 0x44ffff, 4);
      this.state = 'SLEEPING';
      this.postpone(Sleep.SWS);
    }
  }

  remove(b: Buff | (new () => Buff)): void {
    super.remove(b as never);
    if (b instanceof Terror) {
      this.showStatus('negative', '#$%^');
      this.state = 'HUNTING';
    }
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

  defenseProc(enemy: Char, damage: number): number {
    if (!this.enemySeen && enemy === Dungeon.hero && Dungeon.hero.subClass === 'ASSASSIN') {
      damage += Random.Int(1, damage);
      Fx.at('wound', this.pos);
    }
    return damage;
  }

  aggro(ch: Char): void {
    this.enemy = ch;
  }

  damage(dmg: number, src: object): void {
    Terror.recover(this);
    if (this.state === 'SLEEPING') this.state = 'WANDERING';
    this.alerted = true;
    super.damage(dmg, src);
  }

  destroy(): void {
    super.destroy();
    Dungeon.level.mobs.delete(this);
    if (Dungeon.hero.isAlive()) {
      if (this.hostile) {
        Statistics.enemiesSlain++;
        Badges.validateMonstersSlain();
        Statistics.qualifiedForNoKilling = false;
        if (Dungeon.nightMode) Statistics.nightHunt++;
        else Statistics.nightHunt = 0;
        Badges.validateNightHunter();
      }
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
    if (Dungeon.hero.isAlive() && !Dungeon.visible[this.pos]) GLog.i('You hear something died in the distance');
  }

  protected dropLoot(): void {
    if (this.loot !== null && Random.Float() < this.lootChance) {
      const Generator = lazy<{ random(cat: Category): Item; randomOf(cl: new () => Item): Item }>('Generator');
      let item: Item;
      if (typeof this.loot === 'string') item = Generator.random(this.loot);
      else if (typeof this.loot === 'function') item = Generator.randomOf(this.loot);
      else item = this.loot;
      Dungeon.level.drop(item, this.pos).dropFX(this.pos);
    }
  }

  /** Called when the hero returns to a level: true keeps this mob. */
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
    switch (this.state) {
      case 'SLEEPING':
        return `This ${this.name} is sleeping`;
      case 'WANDERING':
        return `This ${this.name} is wandering`;
      case 'HUNTING':
        return `This ${this.name} is hunting`;
      case 'FLEEING':
        return `This ${this.name} is fleeing`;
      case 'PASSIVE':
        return `This ${this.name} is passive`;
    }
  }

  // ---- AI states (overridable, as PD subclasses replaced state objects) ----

  protected actSleeping(enemyInFOV: boolean): boolean {
    const enemy = this.enemy;
    if (enemyInFOV && enemy && Random.Int(this.distanceTo(enemy) + enemy.stealth() + (enemy.flying ? 2 : 0)) === 0) {
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

  protected actWandering(enemyInFOV: boolean, justAlerted: boolean): boolean {
    const enemy = this.enemy;
    if (
      enemyInFOV &&
      enemy &&
      (justAlerted || Random.Int(Math.trunc(distance(this.pos, enemy.pos) / 2) + enemy.stealth()) === 0)
    ) {
      this.enemySeen = true;
      this.notice();
      this.state = 'HUNTING';
      this.target = enemy.pos;
    } else {
      this.enemySeen = false;
      const oldPos = this.pos;
      if (this.target !== -1 && this.getCloser(this.target)) {
        this.spend(1 / this.speed());
        return this.moveSprite(oldPos, this.pos);
      }
      this.target = Dungeon.level.randomDestination();
      this.spend(TICK);
    }
    return true;
  }

  protected actHunting(enemyInFOV: boolean): boolean {
    const enemy = this.enemy;
    this.enemySeen = enemyInFOV;
    if (enemyInFOV && enemy && this.canAttack(enemy)) return this.doAttack(enemy);
    if (enemyInFOV && enemy) this.target = enemy.pos;
    const oldPos = this.pos;
    if (this.target !== -1 && this.getCloser(this.target)) {
      this.spend(1 / this.speed());
      return this.moveSprite(oldPos, this.pos);
    }
    this.spend(TICK);
    this.state = 'WANDERING';
    this.target = Dungeon.level.randomDestination();
    return true;
  }

  protected actFleeing(enemyInFOV: boolean): boolean {
    this.enemySeen = enemyInFOV;
    if (enemyInFOV && this.enemy) this.target = this.enemy.pos;
    const oldPos = this.pos;
    if (this.target !== -1 && this.getFurther(this.target)) {
      this.spend(1 / this.speed());
      return this.moveSprite(oldPos, this.pos);
    }
    this.spend(TICK);
    this.nowhereToRun();
    return true;
  }

  protected nowhereToRun(): void {}
}

registerClass('Mob', Mob);
