// Ports of the monsters met in the Sewers (depths 1-5) and the special monsters any level can spawn.
import { Assets } from '../../../content/generated/Assets';
import { Badges } from '../../Badges';
import { Dungeon, ResultDescriptions, Statistics } from '../../Dungeon';
import { Journal } from '../../Journal';
import { Actor } from '../Actor';
import { Blob } from '../blobs/Blob';
import { ParalyticGas, ToxicGas } from '../blobs/blobs';
import { Buff } from '../buffs/Buff';
import * as B from '../buffs/buffs';
import { Char, indefinite } from '../Char';
import type { Hero } from '../hero/Hero';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { Random } from '../../core/Random';
import { Generator } from '../../items/Generator';
import type { Item } from '../../items/Item';
import { MysteryMeat } from '../../items/food';
import { SkeletonKey } from '../../items/keys';
import { Gold, LloydsBeacon, RatSkull } from '../../items/misc';
import { PotionOfHealing } from '../../items/potions/potions';
import { RingOfHaggler } from '../../items/rings/rings';
import { ScrollOfPsionicBlast } from '../../items/scrolls/scrolls';
import { Death, Leech } from '../../items/weapon/enchantments';
import { MeleeWeapon } from '../../items/weapon/melee';
import type { Weapon } from '../../items/weapon/Weapon';
import { adjacent, NEIGHBOURS4, NEIGHBOURS8, WIDTH } from '../../levels/constants';
import { Ballistica } from '../../mechanics/Ballistica';
import { Terrain } from '../../levels/Terrain';
import { observe } from '../../observe';
import { findPath, flee } from '../pathing';
import { Mob } from './Mob';
import { Ghost } from './npcs';

export class Rat extends Mob {
  constructor() {
    super();
    this.name = 'marsupial rat';
    this.spriteId = 'Rat';
    this.HP = this.HT = 8;
    this.defenseSkillValue = 3;
    this.maxLvl = 5;
  }
  damageRoll(): number {
    return Random.NormalIntRange(1, 5);
  }
  attackSkill(_target: Char): number {
    return 8;
  }
  dr(): number {
    return 1;
  }
  die(cause: object | null): void {
    Ghost.Quest.processSewersKill(this.pos);
    super.die(cause);
  }
  description(): string {
    return 'Marsupial rats are aggressive, but rather weak denizens of the sewers. They can be dangerous only in big numbers.';
  }
}

export class Albino extends Rat {
  constructor() {
    super();
    this.name = 'albino rat';
    this.spriteId = 'Albino';
    this.HP = this.HT = 15;
  }
  die(cause: object | null): void {
    super.die(cause);
    Badges.validateRare(this);
  }
  attackProc(enemy: Char, damage: number): number {
    if (Random.Int(2) === 0) Buff.affect(enemy, B.Bleeding).set(damage);
    return damage;
  }
}

export class Gnoll extends Mob {
  constructor() {
    super();
    this.name = 'gnoll scout';
    this.spriteId = 'Gnoll';
    this.HP = this.HT = 12;
    this.defenseSkillValue = 4;
    this.EXP = 2;
    this.maxLvl = 8;
    this.loot = Gold;
    this.lootChance = 0.5;
  }
  damageRoll(): number {
    return Random.NormalIntRange(2, 5);
  }
  attackSkill(_target: Char): number {
    return 11;
  }
  dr(): number {
    return 2;
  }
  die(cause: object | null): void {
    Ghost.Quest.processSewersKill(this.pos);
    super.die(cause);
  }
  description(): string {
    return 'Gnolls are hyena-like humanoids. They dwell in sewers and dungeons, venturing up to raid the surface from time to time. Gnoll scouts are regular members of their pack, they are not as strong as brutes and not as intelligent as shamans.';
  }
}

export class Crab extends Mob {
  constructor() {
    super();
    this.name = 'sewer crab';
    this.spriteId = 'Crab';
    this.HP = this.HT = 15;
    this.defenseSkillValue = 5;
    this.baseSpeed = 2;
    this.EXP = 3;
    this.maxLvl = 9;
    this.loot = new MysteryMeat();
    this.lootChance = 0.167;
  }
  damageRoll(): number {
    return Random.NormalIntRange(3, 6);
  }
  attackSkill(_target: Char): number {
    return 12;
  }
  dr(): number {
    return 4;
  }
  defenseVerb(): string {
    return 'parried';
  }
  die(cause: object | null): void {
    Ghost.Quest.processSewersKill(this.pos);
    super.die(cause);
  }
  description(): string {
    return 'These huge crabs are at the top of the food chain in the sewers. They are extremely fast and their thick exoskeleton can withstand heavy blows.';
  }
}

export class Swarm extends Mob {
  private static readonly SPLIT_DELAY = 1;
  generation = 0;

  constructor() {
    super();
    this.name = 'swarm of flies';
    this.spriteId = 'Swarm';
    this.HP = this.HT = 80;
    this.defenseSkillValue = 5;
    this.maxLvl = 10;
    this.flying = true;
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('generation', this.generation);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.generation = bundle.getInt('generation');
  }
  damageRoll(): number {
    return Random.NormalIntRange(1, 4);
  }
  defenseProc(enemy: Char, damage: number): number {
    if (this.HP >= damage + 2) {
      const level = Dungeon.level;
      const candidates: number[] = [];
      for (const n of [this.pos + 1, this.pos - 1, this.pos + WIDTH, this.pos - WIDTH]) {
        if (level.passable[n] && Actor.findChar(n) === null) candidates.push(n);
      }
      if (candidates.length > 0) {
        const clone = this.split();
        clone.HP = Math.trunc((this.HP - damage) / 2);
        clone.pos = Random.element(candidates)!;
        clone.state = 'HUNTING';
        if (level.map[clone.pos] === Terrain.DOOR) level.doorEnter(clone.pos);
        level.addMob(clone, Swarm.SPLIT_DELAY);
        Events.emit({ type: 'fx', fx: 'pushing', id: clone.id(), pos: this.pos, to: clone.pos });
        this.HP -= clone.HP;
      }
    }
    return super.defenseProc(enemy, damage);
  }
  attackSkill(_target: Char): number {
    return 12;
  }
  defenseVerb(): string {
    return 'evaded';
  }
  private split(): Swarm {
    const clone = new Swarm();
    clone.generation = this.generation + 1;
    if (this.buff(B.Burning) !== null) Buff.affect(clone, B.Burning).reignite(clone);
    if (this.buff(B.Poison) !== null) Buff.affect(clone, B.Poison).set(2);
    return clone;
  }
  protected dropLoot(): void {
    if (Random.Int(5 * (this.generation + 1)) === 0)
      Dungeon.level.drop(new PotionOfHealing(), this.pos).dropFX(this.pos);
  }
  description(): string {
    return 'The deadly swarm of flies buzzes angrily. Every non-magical attack will split it into two smaller but equally dangerous swarms.';
  }
}

export class Skeleton extends Mob {
  private static readonly IMMUNITIES = new Set<unknown>([Death]);

  constructor() {
    super();
    this.name = 'skeleton';
    this.spriteId = 'Skeleton';
    this.HP = this.HT = 25;
    this.defenseSkillValue = 9;
    this.EXP = 5;
    this.maxLvl = 10;
  }
  damageRoll(): number {
    return Random.NormalIntRange(3, 8);
  }
  die(cause: object | null): void {
    super.die(cause);
    let heroKilled = false;
    for (const n of NEIGHBOURS8) {
      const ch = Actor.findChar(this.pos + n);
      if (ch && ch.isAlive()) {
        const damage = Math.max(0, this.damageRoll() - Random.IntRange(0, Math.trunc(ch.dr() / 2)));
        ch.damage(damage, this);
        if (ch === Dungeon.hero && !ch.isAlive()) heroKilled = true;
      }
    }
    if (Dungeon.visible[this.pos]) Sample.play(Assets.SND_BONES);
    if (heroKilled) {
      Dungeon.fail(ResultDescriptions.MOB(indefinite(this.name), Dungeon.depth));
      GLog.n('You were killed by the explosion of bones...');
    }
  }
  protected dropLoot(): void {
    if (Random.Int(5) === 0) {
      let loot = Generator.random('WEAPON');
      for (let i = 0; i < 2; i++) {
        const l = Generator.random('WEAPON');
        if (l.level() < loot.level()) loot = l;
      }
      Dungeon.level.drop(loot, this.pos).dropFX(this.pos);
    }
  }
  attackSkill(_target: Char): number {
    return 12;
  }
  dr(): number {
    return 5;
  }
  defenseVerb(): string {
    return 'blocked';
  }
  description(): string {
    return 'Skeletons are composed of corpses bones from unlucky adventurers and inhabitants of the dungeon, animated by emanations of evil magic from the depths below. After they have been damaged enough, they disintegrate in an explosion of bones.';
  }
  immunities(): Set<unknown> {
    return Skeleton.IMMUNITIES;
  }
}

export class Thief extends Mob {
  item: Item | null = null;

  constructor() {
    super();
    this.name = 'crazy thief';
    this.spriteId = 'Thief';
    this.HP = this.HT = 20;
    this.defenseSkillValue = 12;
    this.EXP = 5;
    this.maxLvl = 10;
    this.loot = RingOfHaggler;
    this.lootChance = 0.01;
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('item', this.item);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.item = bundle.get<Item>('item');
  }
  damageRoll(): number {
    return Random.NormalIntRange(1, 7);
  }
  protected attackDelay(): number {
    return 0.5;
  }
  die(cause: object | null): void {
    super.die(cause);
    if (this.item !== null) Dungeon.level.drop(this.item, this.pos).dropFX(this.pos);
  }
  attackSkill(_target: Char): number {
    return 12;
  }
  dr(): number {
    return 3;
  }
  attackProc(enemy: Char, damage: number): number {
    if (this.item === null && enemy === Dungeon.hero && this.steal(Dungeon.hero)) this.state = 'FLEEING';
    return damage;
  }
  defenseProc(_enemy: Char, damage: number): number {
    if (this.state === 'FLEEING') Dungeon.level.drop(new Gold(), this.pos).dropFX(this.pos);
    return damage;
  }
  protected steal(hero: Hero): boolean {
    const item = hero.belongings.randomUnequipped();
    if (item !== null) {
      GLog.w(`${this.name} stole ${item.name_()} from you!`);
      item.detachAll(hero.belongings.backpack);
      this.item = item;
      return true;
    }
    return false;
  }
  protected nowhereToRun(): void {
    if (this.buff(B.Terror) === null) {
      this.showStatus('negative', '#$%^');
      this.state = 'HUNTING';
    }
  }
  description(): string {
    let desc =
      'Deeper levels of the dungeon have always been a hiding place for all kinds of criminals. Not all of them could keep a clear mind during their extended periods so far from daylight. Long ago, these crazy thieves and bandits have forgotten who they are and why they steal.';
    if (this.item !== null)
      desc += `\n\n${this.name.charAt(0).toUpperCase() + this.name.slice(1)} is carrying a _${this.item.name_()}_. Stolen obviously.`;
    return desc;
  }
}

export class Bandit extends Thief {
  constructor() {
    super();
    this.name = 'crazy bandit';
    this.spriteId = 'Bandit';
  }
  protected steal(hero: Hero): boolean {
    if (super.steal(hero)) {
      Buff.prolong(hero, B.Blindness, Random.Int(5, 12));
      observe();
      return true;
    }
    return false;
  }
  die(cause: object | null): void {
    super.die(cause);
    Badges.validateRare(this);
  }
}

export class FetidRat extends Mob {
  private static readonly IMMUNITIES = new Set<unknown>([B.Paralysis]);

  constructor() {
    super();
    this.name = 'fetid rat';
    this.spriteId = 'FetidRat';
    this.HP = this.HT = 15;
    this.defenseSkillValue = 5;
    this.EXP = 3;
    this.maxLvl = 5;
    this.state = 'WANDERING';
  }
  damageRoll(): number {
    return Random.NormalIntRange(2, 6);
  }
  attackSkill(_target: Char): number {
    return 12;
  }
  dr(): number {
    return 2;
  }
  defenseVerb(): string {
    return 'evaded';
  }
  defenseProc(enemy: Char, damage: number): number {
    Dungeon.level.addBlob(Blob.seed(this.pos, 20, ParalyticGas));
    return super.defenseProc(enemy, damage);
  }
  die(cause: object | null): void {
    super.die(cause);
    Dungeon.level.drop(new RatSkull(), this.pos).dropFX(this.pos);
  }
  description(): string {
    return 'This marsupial rat is much larger than a regular one. It is surrounded by a foul cloud.';
  }
  immunities(): Set<unknown> {
    return FetidRat.IMMUNITIES;
  }
}

export class CursePersonification extends Mob {
  private static readonly IMMUNITIES = new Set<unknown>([Death, B.Terror, B.Paralysis, B.Roots]);

  constructor() {
    super();
    this.name = 'curse personification';
    this.spriteId = 'CursePersonification';
    this.HP = this.HT = 10 + Dungeon.depth * 3;
    this.defenseSkillValue = 10 + Dungeon.depth;
    this.EXP = 3;
    this.maxLvl = 5;
    this.state = 'HUNTING';
    this.baseSpeed = 0.5;
    this.flying = true;
  }
  damageRoll(): number {
    return Random.NormalIntRange(3, 5);
  }
  attackSkill(_target: Char): number {
    return 10 + Dungeon.depth;
  }
  dr(): number {
    return 1;
  }
  attackProc(enemy: Char, damage: number): number {
    const level = Dungeon.level;
    for (const ofs of NEIGHBOURS8) {
      if (enemy.pos - this.pos === ofs) {
        const newPos = enemy.pos + ofs;
        if ((level.passable[newPos] || level.avoid[newPos]) && Actor.findChar(newPos) === null) {
          Events.emit({ type: 'fx', fx: 'pushing', id: enemy.id(), pos: enemy.pos, to: newPos });
          enemy.pos = newPos;
          if (enemy === Dungeon.hero) level.press(newPos, enemy);
          else level.mobPress(enemy as Mob);
        }
        break;
      }
    }
    return super.attackProc(enemy, damage);
  }
  protected act(): boolean {
    if (this.HP > 0 && this.HP < this.HT) this.HP++;
    return super.act();
  }
  die(_cause: object | null): void {
    const ghost = new Ghost();
    ghost.state = 'PASSIVE';
    Ghost.replace(this, ghost);
  }
  description(): string {
    return 'This creature resembles the sad ghost, but it swirls with darkness. Its face bears an expression of despair.';
  }
  immunities(): Set<unknown> {
    return CursePersonification.IMMUNITIES;
  }
}

export class Mimic extends Mob {
  private static readonly IMMUNITIES = new Set<unknown>([ScrollOfPsionicBlast]);
  private levelValue = 0;
  items: Item[] = [];

  constructor() {
    super();
    this.name = 'mimic';
    this.spriteId = 'Mimic';
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('items', this.items);
    bundle.put('level', this.levelValue);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.items = bundle.getCollection<Item>('items');
    this.adjustStats(bundle.getInt('level'));
  }
  damageRoll(): number {
    return Random.NormalIntRange(Math.trunc(this.HT / 10), Math.trunc(this.HT / 4));
  }
  attackSkill(_target: Char | null): number {
    return 9 + this.levelValue;
  }
  attackProc(enemy: Char, damage: number): number {
    if (enemy === Dungeon.hero && Random.Int(3) === 0) {
      const gold = new Gold(Random.Int(Math.trunc(Dungeon.gold / 10), Math.trunc(Dungeon.gold / 2)));
      if (gold.quantity > 0) {
        Dungeon.gold -= gold.quantity;
        Dungeon.level.drop(gold, Dungeon.hero.pos).dropFX(Dungeon.hero.pos);
      }
    }
    return super.attackProc(enemy, damage);
  }
  adjustStats(level: number): void {
    this.levelValue = level;
    this.HT = (3 + level) * 4;
    this.EXP = 2 + Math.trunc((2 * (level - 1)) / 5);
    this.defenseSkillValue = Math.trunc(this.attackSkill(null) / 2);
    this.enemySeen = true;
  }
  die(cause: object | null): void {
    super.die(cause);
    for (const item of this.items) Dungeon.level.drop(item, this.pos).dropFX(this.pos);
  }
  reset(): boolean {
    this.state = 'WANDERING';
    return true;
  }
  description(): string {
    return 'Mimics are magical creatures which can take any shape they wish. In dungeons they almost always choose a shape of a treasure chest, because they know how to beckon an adventurer.';
  }
  immunities(): Set<unknown> {
    return Mimic.IMMUNITIES;
  }

  static spawnAt(pos: number, items: Item[]): Mimic | null {
    const level = Dungeon.level;
    const ch = Actor.findChar(pos);
    if (ch !== null) {
      const candidates: number[] = [];
      for (const n of NEIGHBOURS8) {
        const cell = pos + n;
        if ((level.passable[cell] || level.avoid[cell]) && Actor.findChar(cell) === null) candidates.push(cell);
      }
      if (candidates.length === 0) return null;
      const newPos = Random.element(candidates)!;
      Events.emit({ type: 'fx', fx: 'pushing', id: ch.id(), pos: ch.pos, to: newPos });
      ch.pos = newPos;
      if (ch === Dungeon.hero) level.press(newPos, ch);
      else level.mobPress(ch as Mob);
    }
    const m = new Mimic();
    m.items = [...items];
    m.adjustStats(Dungeon.depth);
    m.HP = m.HT;
    m.pos = pos;
    m.state = 'HUNTING';
    level.addMob(m, 1);
    Events.emit({ type: 'turn', id: m.id(), from: pos, to: Dungeon.hero.pos });
    if (Dungeon.visible[m.pos]) {
      Fx.burst('Speck.STAR', { pos }, 10);
      Sample.play(Assets.SND_MIMIC);
    }
    return m;
  }
}

export class Wraith extends Mob {
  private static readonly SPAWN_DELAY = 2;
  private static readonly IMMUNITIES = new Set<unknown>([Death, B.Terror]);
  private levelValue = 0;

  constructor() {
    super();
    this.name = 'wraith';
    this.spriteId = 'Wraith';
    this.HP = this.HT = 1;
    this.EXP = 0;
    this.flying = true;
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('level', this.levelValue);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.adjustStats(bundle.getInt('level'));
  }
  damageRoll(): number {
    return Random.NormalIntRange(1, 3 + this.levelValue);
  }
  attackSkill(_target: Char | null): number {
    return 10 + this.levelValue;
  }
  adjustStats(level: number): void {
    this.levelValue = level;
    this.defenseSkillValue = this.attackSkill(null) * 5;
    this.enemySeen = true;
  }
  defenseVerb(): string {
    return 'evaded';
  }
  reset(): boolean {
    this.state = 'WANDERING';
    return true;
  }
  description(): string {
    return 'A wraith is a vengeful spirit of a sinner, whose grave or tomb was disturbed. Being an ethereal entity, it is very hard to hit with a regular weapon.';
  }
  immunities(): Set<unknown> {
    return Wraith.IMMUNITIES;
  }

  static spawnAround(pos: number): void {
    for (const n of NEIGHBOURS4) {
      const cell = pos + n;
      if (Dungeon.level.passable[cell] && Actor.findChar(cell) === null) Wraith.spawnAt(cell);
    }
  }

  static spawnAt(pos: number): Wraith | null {
    if (Dungeon.level.passable[pos] && Actor.findChar(pos) === null) {
      const w = new Wraith();
      w.adjustStats(Dungeon.depth);
      w.pos = pos;
      w.state = 'HUNTING';
      Dungeon.level.addMob(w, Wraith.SPAWN_DELAY);
      Events.emit({ type: 'fx', fx: 'fadeIn', id: w.id(), v: 0.5 });
      Fx.burst('ShadowParticle.CURSE', { id: w.id() }, 5);
      return w;
    }
    return null;
  }
}

export class Piranha extends Mob {
  private static readonly IMMUNITIES = new Set<unknown>([B.Burning, B.Paralysis, ToxicGas, B.Roots, B.Frost]);

  constructor() {
    super();
    this.name = 'giant piranha';
    this.spriteId = 'Piranha';
    this.baseSpeed = 2;
    this.EXP = 0;
    this.HP = this.HT = 10 + Dungeon.depth * 5;
    this.defenseSkillValue = 10 + Dungeon.depth * 2;
  }
  realtimeTurn(): void {
    if (!Dungeon.level.water[this.pos]) this.die(null);
  }

  protected act(): boolean {
    if (!Dungeon.level.water[this.pos]) {
      this.die(null);
      return true;
    }
    return super.act();
  }
  damageRoll(): number {
    return Random.NormalIntRange(Dungeon.depth, 4 + Dungeon.depth * 2);
  }
  attackSkill(_target: Char): number {
    return 20 + Dungeon.depth * 2;
  }
  dr(): number {
    return Dungeon.depth;
  }
  die(cause: object | null): void {
    Dungeon.level.drop(new MysteryMeat(), this.pos).dropFX(this.pos);
    super.die(cause);
    Statistics.piranhasKilled++;
    Badges.validatePiranhasKilled();
  }
  reset(): boolean {
    return true;
  }
  protected getCloser(target: number): boolean {
    if (this.rooted) return false;
    const step = findPath(this, this.pos, target, Dungeon.level.water, Dungeon.level.fieldOfView);
    if (step !== -1) {
      this.move(step);
      return true;
    }
    return false;
  }
  protected getFurther(target: number): boolean {
    const step = flee(this, this.pos, target, Dungeon.level.water, Dungeon.level.fieldOfView);
    if (step !== -1) {
      this.move(step);
      return true;
    }
    return false;
  }
  description(): string {
    return 'These carnivorous fish are not natural inhabitants of underground pools. They were bred specifically to protect flooded treasure vaults.';
  }
  immunities(): Set<unknown> {
    return Piranha.IMMUNITIES;
  }
}

export class Statue extends Mob {
  private static readonly RESISTANCES = new Set<unknown>([ToxicGas, B.Poison, Death, ScrollOfPsionicBlast]);
  private static readonly IMMUNITIES = new Set<unknown>([Leech]);
  private weapon!: Weapon;

  constructor() {
    super();
    this.name = 'animated statue';
    this.spriteId = 'Statue';
    this.EXP = 0;
    this.state = 'PASSIVE';
    let weapon: Weapon;
    do {
      weapon = Generator.random('WEAPON') as Weapon;
    } while (!(weapon instanceof MeleeWeapon) || weapon.level() < 0);
    weapon.identify();
    weapon.enchant();
    this.weapon = weapon;
    this.HP = this.HT = 15 + Dungeon.depth * 5;
    this.defenseSkillValue = 4 + Dungeon.depth;
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('weapon', this.weapon);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.weapon = bundle.get<Weapon>('weapon')!;
  }
  protected act(): boolean {
    if (Dungeon.visible[this.pos]) Journal.add('STATUE');
    return super.act();
  }
  damageRoll(): number {
    return Random.NormalIntRange(this.weapon.min(), this.weapon.max());
  }
  attackSkill(_target: Char): number {
    return Math.trunc((9 + Dungeon.depth) * this.weapon.ACU);
  }
  protected attackDelay(): number {
    return this.weapon.DLY;
  }
  dr(): number {
    return Dungeon.depth;
  }
  damage(dmg: number, src: object): void {
    if (this.state === 'PASSIVE') this.state = 'HUNTING';
    super.damage(dmg, src);
  }
  attackProc(enemy: Char, damage: number): number {
    this.weapon.proc(this, enemy, damage);
    return damage;
  }
  beckon(_cell: number): void {}
  die(cause: object | null): void {
    Dungeon.level.drop(this.weapon, this.pos).dropFX(this.pos);
    super.die(cause);
  }
  destroy(): void {
    Journal.remove('STATUE');
    super.destroy();
  }
  reset(): boolean {
    this.state = 'PASSIVE';
    return true;
  }
  description(): string {
    return `You would think that it's just another ugly statue of this dungeon, but its red glowing eyes give itself away. While the statue itself is made of stone, the _${this.weapon.name_()}_, it's wielding, looks real.`;
  }
  resistances(): Set<unknown> {
    return Statue.RESISTANCES;
  }
  immunities(): Set<unknown> {
    return Statue.IMMUNITIES;
  }
}

export class Goo extends Mob {
  private static readonly PUMP_UP_DELAY = 2;
  private static readonly RESISTANCES = new Set<unknown>([ToxicGas, Death, ScrollOfPsionicBlast]);
  private pumpedUp = false;
  private jumped = false;

  constructor() {
    super();
    this.name = Dungeon.depth === Statistics.deepestFloor ? 'Goo' : 'spawn of Goo';
    this.HP = this.HT = 80;
    this.EXP = 10;
    this.defenseSkillValue = 12;
    this.spriteId = 'Goo';
    this.loot = new LloydsBeacon();
    this.lootChance = 0.333;
  }
  damageRoll(): number {
    return this.pumpedUp ? Random.NormalIntRange(5, 30) : Random.NormalIntRange(2, 12);
  }
  attackSkill(_target: Char): number {
    return this.pumpedUp && !this.jumped ? 30 : 15;
  }
  dr(): number {
    return 2;
  }
  protected act(): boolean {
    if (Dungeon.level.water[this.pos] && this.HP < this.HT) {
      Fx.burst('Speck.HEALING', { id: this.id() }, 1);
      this.heal(1);
    }
    return super.act();
  }
  protected canAttack(enemy: Char): boolean {
    return this.pumpedUp ? this.distanceTo(enemy) <= 2 : super.canAttack(enemy);
  }
  attackProc(enemy: Char, damage: number): number {
    if (Random.Int(3) === 0) {
      Buff.affect(enemy, B.Ooze);
      Events.emit({ type: 'fx', fx: 'burst', id: enemy.id(), color: 0x000000, n: 5 });
    }
    return damage;
  }
  protected doAttack(enemy: Char): boolean {
    if (this.pumpedUp) {
      if (adjacent(this.pos, enemy.pos)) {
        // Pumped up attack WITHOUT accuracy penalty
        this.jumped = false;
        return super.doAttack(enemy);
      }
      // Pumped up attack WITH accuracy penalty
      this.jumped = true;
      if (Ballistica.cast(this.pos, enemy.pos, false, true) === enemy.pos) {
        const dest = Ballistica.trace[Ballistica.distance - 2];
        Events.emit({ type: 'fx', fx: 'jump', id: this.id(), pos: this.pos, to: dest });
        this.move(dest);
        Dungeon.level.mobPress(this);
        return super.doAttack(enemy);
      }
      Events.emit({ type: 'fx', fx: 'idle', id: this.id() });
      this.pumpedUp = false;
      return true;
    }
    if (Random.Int(3) > 0) return super.doAttack(enemy);
    // Pumping up
    this.pumpedUp = true;
    this.spend(Goo.PUMP_UP_DELAY);
    Events.emit({ type: 'fx', fx: 'pumpUp', id: this.id() });
    if (Dungeon.visible[this.pos]) {
      this.showStatus('negative', '!!!');
      GLog.n('Goo is pumping itself up!');
    }
    return true;
  }
  attack(enemy: Char): boolean {
    const result = super.attack(enemy);
    this.pumpedUp = false;
    return result;
  }
  protected getCloser(target: number): boolean {
    this.pumpedUp = false;
    return super.getCloser(target);
  }
  move(step: number): void {
    Dungeon.level.seal();
    super.move(step);
  }
  die(cause: object | null): void {
    super.die(cause);
    Dungeon.level.unseal();
    Events.emit({ type: 'fx', fx: 'bossSlain' });
    Dungeon.level.drop(new SkeletonKey(), this.pos).dropFX(this.pos);
    Badges.validateBossSlain();
    this.yell('glurp... glurp...');
  }
  notice(): void {
    super.notice();
    this.yell('GLURP-GLURP!');
  }
  description(): string {
    return "Little known about The Goo. It's quite possible that it is not even a creature, but rather a conglomerate of substances from the sewers that gained rudiments of free will.";
  }
  resistances(): Set<unknown> {
    return Goo.RESISTANCES;
  }
}

for (const [name, cls] of Object.entries({
  Rat,
  Albino,
  Gnoll,
  Crab,
  Swarm,
  Skeleton,
  Thief,
  Bandit,
  FetidRat,
  CursePersonification,
  Mimic,
  Wraith,
  Piranha,
  Statue,
  Goo,
})) {
  registerClass(name, cls);
}
