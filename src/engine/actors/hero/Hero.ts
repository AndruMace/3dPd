// Port of actors/hero/Hero.java and HeroClass/HeroSubClass.
import { Assets } from '../../../content/generated/Assets';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { QuickSlot } from '../../QuickSlot';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { ClothArmor } from '../../items/armor/Armor';
import { Keyring } from '../../items/bags';
import { Food } from '../../items/food';
import type { Item } from '../../items/Item';
import { GoldenKey, IronKey, Key, SkeletonKey } from '../../items/keys';
import { Amulet, Ankh, Dewdrop, DewVial } from '../../items/misc';
import { PotionOfMight, PotionOfStrength } from '../../items/potions/potions';
import type { Potion } from '../../items/potions/Potion';
import {
  RingOfAccuracy,
  RingOfDetection,
  RingOfEvasion,
  RingOfHaste,
  RingOfShadows,
  RingOfThorns,
  Resistance,
} from '../../items/rings/rings';
import type { Scroll } from '../../items/scrolls/Scroll';
import {
  ScrollOfEnchantment,
  ScrollOfIdentify,
  ScrollOfMagicMapping,
  ScrollOfRecharging,
  ScrollOfUpgrade,
} from '../../items/scrolls/scrolls';
import { Wand } from '../../items/wands/Wand';
import { WandOfMagicMissile } from '../../items/wands/wands';
import type { KindOfWeapon } from '../../items/KindOfWeapon';
import { Dagger, Knuckles, MeleeWeapon, ShortSword } from '../../items/weapon/melee';
import { Boomerang, Dart, type MissileWeapon } from '../../items/weapon/missiles';
import { adjacent, distance, HEIGHT, LENGTH, NEIGHBOURS8, WIDTH } from '../../levels/constants';
import { AlchemyPot, Chasm, Sign } from '../../levels/features';
import { discover, flags, Terrain } from '../../levels/Terrain';
import { ScrollOfMagicMapping as MagicMapping } from '../../items/scrolls/scrolls';
import { observe } from '../../observe';
import { EarthrootArmor } from '../../plants/plants';
import { Actor, TICK } from '../Actor';
import { Buff } from '../buffs/Buff';
import * as B from '../buffs/buffs';
import { Char, isDoom } from '../Char';
import type { Mob } from '../mobs/Mob';
import type { NPC } from '../mobs/npcs';
import { findPath } from '../pathing';
import { Belongings } from './Belongings';
import { STARTING_STR } from './constants';
import type { HeroAction } from './HeroAction';

export type HeroClass = 'WARRIOR' | 'MAGE' | 'ROGUE' | 'HUNTRESS';
export type HeroSubClass =
  'NONE' | 'GLADIATOR' | 'BERSERKER' | 'WARLOCK' | 'BATTLEMAGE' | 'ASSASSIN' | 'FREERUNNER' | 'SNIPER' | 'WARDEN';

export const HERO_CLASS_TITLES: Record<HeroClass, string> = {
  WARRIOR: 'warrior',
  MAGE: 'mage',
  ROGUE: 'rogue',
  HUNTRESS: 'huntress',
};
const SUBCLASS_TITLES: Record<HeroSubClass, string> = {
  NONE: '',
  GLADIATOR: 'gladiator',
  BERSERKER: 'berserker',
  WARLOCK: 'warlock',
  BATTLEMAGE: 'battlemage',
  ASSASSIN: 'assassin',
  FREERUNNER: 'freerunner',
  SNIPER: 'sniper',
  WARDEN: 'warden',
};

export const HERO_PERKS: Record<HeroClass, string[]> = {
  WARRIOR: [
    'Warriors start with 11 points of Strength.',
    'Warriors start with a unique short sword. This sword can be later "reforged" to upgrade another melee weapon.',
    'Warriors are less proficient with missile weapons.',
    'Any piece of food restores some health when eaten.',
    'Potions of Strength are identified from the beginning.',
  ],
  MAGE: [
    'Mages start with a unique Wand of Magic Missile. This wand can be later "disenchanted" to upgrade another wand.',
    'Mages recharge their wands faster.',
    'When eaten, any piece of food restores 1 charge for all wands in the inventory.',
    'Mages can use wands as a melee weapon.',
    'Scrolls of Identify are identified from the beginning.',
  ],
  ROGUE: [
    'Rogues start with a Ring of Shadows+1.',
    'Rogues identify a type of a ring on equipping it.',
    'Rogues are proficient with light armor, dodging better while wearing one.',
    'Rogues are proficient in detecting hidden doors and traps.',
    'Rogues can go without food longer.',
    'Scrolls of Magic Mapping are identified from the beginning.',
  ],
  HUNTRESS: [
    'Huntresses start with 15 points of Health.',
    'Huntresses start with a unique upgradeable boomerang.',
    'Huntresses are proficient with missile weapons and get a damage bonus for excessive strength when using them.',
    'Huntresses gain more health from dewdrops.',
    'Huntresses sense neighbouring monsters even if they are hidden behind obstacles.',
  ],
};

export type Transition =
  'descend' | 'ascend' | 'fall' | 'fallIntoPit' | 'win' | { mode: 'return'; depth: number; pos: number };

const TIME_TO_REST = 1;
const TIME_TO_SEARCH = 2;

export class Hero extends Char {
  heroClass: HeroClass = 'ROGUE';
  subClass: HeroSubClass = 'NONE';

  private attackSkillValue = 10;
  private defenseSkillValue = 5;

  ready = false;
  curAction: HeroAction | null = null;
  lastAction: HeroAction | null = null;
  /** The last attacked enemy (AttackIndicator target in PD). */
  enemy: Char | null = null;
  killerGlyph: unknown = null;
  private theKey: Item | null = null;
  restoreHealth = false;
  rangedWeapon: MissileWeapon | null = null;
  readonly belongings: Belongings;

  STRValue = STARTING_STR;
  weakened = false;
  awareness = 0.1;
  lvl = 1;
  exp = 0;

  private visibleEnemies: Mob[] = [];

  /** Set when the hero takes the stairs, falls, or uses a beacon; the game performs it once the view catches up. */
  pendingTransition: Transition | null = null;

  constructor() {
    super();
    this.name = 'you';
    this.HP = this.HT = 20;
    this.STRValue = STARTING_STR;
    this.belongings = new Belongings(this);
  }

  get spriteSheet(): string {
    return { WARRIOR: 'HeroWarrior', MAGE: 'HeroMage', ROGUE: 'HeroRogue', HUNTRESS: 'HeroHuntress' }[this.heroClass];
  }

  STR(): number {
    return this.weakened ? this.STRValue - 2 : this.STRValue;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('class', this.heroClass);
    bundle.put('subClass', this.subClass);
    bundle.put('attackSkill', this.attackSkillValue);
    bundle.put('defenseSkill', this.defenseSkillValue);
    bundle.put('STR', this.STRValue);
    bundle.put('lvl', this.lvl);
    bundle.put('exp', this.exp);
    this.belongings.storeInBundle(bundle);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.heroClass = bundle.getEnum<HeroClass>('class', 'ROGUE');
    this.subClass = bundle.getEnum<HeroSubClass>('subClass', 'NONE');
    this.spriteId = this.spriteSheet;
    this.attackSkillValue = bundle.getInt('attackSkill');
    this.defenseSkillValue = bundle.getInt('defenseSkill');
    this.STRValue = bundle.getInt('STR');
    this.updateAwareness();
    this.lvl = bundle.getInt('lvl');
    this.exp = bundle.getInt('exp');
    this.belongings.restoreFromBundle(bundle);
  }

  className(): string {
    return this.subClass === 'NONE' ? HERO_CLASS_TITLES[this.heroClass] : SUBCLASS_TITLES[this.subClass];
  }

  live(): void {
    Buff.affect(this, B.Regeneration);
    Buff.affect(this, B.Hunger);
  }

  /** HeroClass.initHero: starting kit and class traits. */
  initClass(heroClass: HeroClass): void {
    this.heroClass = heroClass;
    this.spriteId = this.spriteSheet;
    // initCommon
    (this.belongings.armor = new ClothArmor()).identify();
    new Food().identify().collect();
    new Keyring().collect();

    switch (heroClass) {
      case 'WARRIOR':
        this.STRValue += 1;
        (this.belongings.weapon = new ShortSword()).identify();
        new Dart(8).identify().collect();
        QuickSlot.primaryValue = 'Dart';
        new PotionOfStrength().setKnown();
        break;
      case 'MAGE': {
        (this.belongings.weapon = new Knuckles()).identify();
        const wand = new WandOfMagicMissile();
        wand.identify().collect();
        QuickSlot.primaryValue = wand;
        new ScrollOfIdentify().setKnown();
        break;
      }
      case 'ROGUE':
        (this.belongings.weapon = new Dagger()).identify();
        (this.belongings.ring1 = new RingOfShadows()).upgrade().identify();
        new Dart(8).identify().collect();
        this.belongings.ring1.activate(this);
        QuickSlot.primaryValue = 'Dart';
        new ScrollOfMagicMapping().setKnown();
        break;
      case 'HUNTRESS': {
        this.HP = this.HT -= 5;
        (this.belongings.weapon = new Dagger()).identify();
        const boomerang = new Boomerang();
        boomerang.identify().collect();
        QuickSlot.primaryValue = boomerang;
        break;
      }
    }
    this.updateAwareness();
  }

  tier(): number {
    return this.belongings.armor === null ? 0 : this.belongings.armor.tier;
  }

  shoot(enemy: Char, wep: MissileWeapon): boolean {
    this.rangedWeapon = wep;
    const result = this.attack(enemy);
    this.rangedWeapon = null;
    return result;
  }

  private weapon(): KindOfWeapon | null {
    return this.rangedWeapon ?? this.belongings.weapon;
  }

  attackSkill(target: Char): number {
    let bonus = 0;
    for (const buff of this.buffsOf(RingOfAccuracy.Effect)) bonus += buff.level;
    let accuracy = bonus === 0 ? 1 : Math.pow(1.4, bonus);
    if (this.rangedWeapon !== null && distance(this.pos, target.pos) === 1) accuracy *= 0.5;
    const wep = this.weapon();
    return wep
      ? Math.trunc(this.attackSkillValue * accuracy * wep.acuracyFactor(this))
      : Math.trunc(this.attackSkillValue * accuracy);
  }

  defenseSkill(_enemy: Char): number {
    let bonus = 0;
    for (const buff of this.buffsOf(RingOfEvasion.Effect)) bonus += buff.level;
    let evasion = bonus === 0 ? 1 : Math.pow(1.2, bonus);
    if (this.paralysed) evasion /= 2;
    const aEnc = this.belongings.armor !== null ? this.belongings.armor.STR - this.STR() : 0;
    if (aEnc > 0) return Math.trunc((this.defenseSkillValue * evasion) / Math.pow(1.5, aEnc));
    if (this.heroClass === 'ROGUE') {
      if (this.curAction !== null && this.subClass === 'FREERUNNER' && !this.isStarving()) evasion *= 2;
      return Math.trunc((this.defenseSkillValue - aEnc) * evasion);
    }
    return Math.trunc(this.defenseSkillValue * evasion);
  }

  dr(): number {
    let dr = this.belongings.armor !== null ? Math.max(this.belongings.armor.DR(), 0) : 0;
    const barkskin = this.buff(B.Barkskin);
    if (barkskin !== null) dr += barkskin.level();
    return dr;
  }

  damageRoll(): number {
    const wep = this.weapon();
    const dmg = wep ? wep.damageRoll(this) : this.STR() > 10 ? Random.IntRange(1, this.STR() - 9) : 1;
    return this.buff(B.Fury) !== null ? Math.trunc(dmg * 1.5) : dmg;
  }

  speed(): number {
    const aEnc = this.belongings.armor !== null ? this.belongings.armor.STR - this.STR() : 0;
    if (aEnc > 0) return super.speed() * Math.pow(1.3, -aEnc);
    const speed = super.speed();
    return this.subClass === 'FREERUNNER' && !this.isStarving() ? 1.6 * speed : speed;
  }

  attackDelay(): number {
    const wep = this.weapon();
    return wep ? wep.speedFactor(this) : 1;
  }

  spend(time: number): void {
    let hasteLevel = 0;
    for (const buff of this.buffsOf(RingOfHaste.Effect)) hasteLevel += buff.level;
    super.spend(hasteLevel === 0 ? time : time * Math.pow(1.1, -hasteLevel));
  }

  spendAndNext(time: number): void {
    this.busy();
    this.spend(time);
  }

  /** Returns true when the scheduler should continue, false when the hero waits for input. */
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
        if (this.isStarving() || this.HP >= this.HT) {
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
    const a = this.curAction;
    switch (a.kind) {
      case 'move':
        this.actMove(a.dst);
        break;
      case 'interact':
        this.actInteract(a.npc);
        break;
      case 'buy':
        this.actBuy(a.dst);
        break;
      case 'pickUp':
        this.actPickUp(a.dst);
        break;
      case 'openChest':
        this.actOpenChest(a.dst);
        break;
      case 'unlock':
        this.actUnlock(a.dst);
        break;
      case 'descend':
        this.actDescend(a.dst);
        break;
      case 'ascend':
        this.actAscend(a.dst);
        break;
      case 'attack':
        this.actAttack(a.target);
        break;
      case 'cook':
        this.actCook(a.dst);
        break;
    }
    return !this.ready && this.pendingTransition === null;
  }

  busy(): void {
    this.ready = false;
  }

  private markReady(): void {
    this.curAction = null;
    this.ready = true;
  }

  interrupt(): void {
    if (this.isAlive() && this.curAction !== null && this.curAction.dst !== this.pos) this.lastAction = this.curAction;
    this.curAction = null;
  }

  /** Hero.resume(): continue the interrupted action (used after confirming a chasm jump). */
  resumeAction(): void {
    this.curAction = this.lastAction;
    this.lastAction = null;
    this.ready = false;
    this.act();
  }

  private actMove(dst: number): void {
    if (this.getCloser(dst)) return;
    if (Dungeon.level.map[this.pos] === Terrain.SIGN) Sign.read(this.pos);
    this.markReady();
  }

  private actInteract(npc: NPC): void {
    if (adjacent(this.pos, npc.pos)) {
      this.markReady();
      Events.emit({ type: 'turn', id: this.id(), from: this.pos, to: npc.pos });
      npc.interact();
    } else if (!(Dungeon.level.fieldOfView[npc.pos] && this.getCloser(npc.pos))) {
      this.markReady();
    }
  }

  private actBuy(dst: number): void {
    if (this.pos === dst || adjacent(this.pos, dst)) {
      this.markReady();
      const heap = Dungeon.level.heaps.get(dst);
      if (heap && heap.type === 'FOR_SALE' && heap.size() === 1) Events.emit({ type: 'fx', fx: 'tradeItem', pos: dst });
    } else if (!this.getCloser(dst)) {
      this.markReady();
    }
  }

  private actCook(dst: number): void {
    if (Dungeon.visible[dst]) {
      this.markReady();
      AlchemyPot.operate(this, dst);
    } else if (!this.getCloser(dst)) {
      this.markReady();
    }
  }

  isImportantPickup(item: Item): boolean {
    return (
      ((item instanceof ScrollOfUpgrade || item instanceof ScrollOfEnchantment) && (item as Scroll).isKnown()) ||
      ((item instanceof PotionOfStrength || item instanceof PotionOfMight) && (item as Potion).isKnown())
    );
  }

  private actPickUp(dst: number): void {
    if (this.pos === dst) {
      const heap = Dungeon.level.heaps.get(this.pos);
      if (heap) {
        const item = heap.pickUp();
        if (item.doPickUp(this)) {
          if (!(item instanceof Dewdrop)) {
            if (this.isImportantPickup(item)) GLog.p(`You now have ${item.name_()}`);
            else GLog.i(`You now have ${item.name_()}`);
          }
          if (!heap.isEmpty()) GLog.i('There is something else here');
          this.curAction = null;
        } else {
          Dungeon.level.drop(item, this.pos).dropFX(this.pos);
          this.markReady();
        }
      } else {
        this.markReady();
      }
    } else if (!this.getCloser(dst)) {
      this.markReady();
    }
  }

  private actOpenChest(dst: number): void {
    if (adjacent(this.pos, dst) || this.pos === dst) {
      const heap = Dungeon.level.heaps.get(dst);
      if (heap && heap.type !== 'HEAP' && heap.type !== 'FOR_SALE') {
        this.theKey = null;
        if (heap.type === 'LOCKED_CHEST' || heap.type === 'CRYSTAL_CHEST') {
          this.theKey = this.belongings.getKey(GoldenKey, Dungeon.depth);
          if (this.theKey === null) {
            GLog.w("This chest is locked and you don't have matching key");
            this.markReady();
            return;
          }
        }
        switch (heap.type) {
          case 'TOMB':
            Sample.play(Assets.SND_TOMB);
            Fx.shake(1, 0.5);
            break;
          case 'SKELETON':
            break;
          default:
            Sample.play(Assets.SND_UNLOCK);
        }
        this.spend(Key.TIME_TO_UNLOCK);
        Events.emit({ type: 'anim', id: this.id(), anim: 'operate', target: dst });
        this.onOperateComplete();
      } else {
        this.markReady();
      }
    } else if (!this.getCloser(dst)) {
      this.markReady();
    }
  }

  private actUnlock(doorCell: number): void {
    if (adjacent(this.pos, doorCell)) {
      this.theKey = null;
      const door = Dungeon.level.map[doorCell];
      if (door === Terrain.LOCKED_DOOR) this.theKey = this.belongings.getKey(IronKey, Dungeon.depth);
      else if (door === Terrain.LOCKED_EXIT) this.theKey = this.belongings.getKey(SkeletonKey, Dungeon.depth);
      if (this.theKey !== null) {
        this.spend(Key.TIME_TO_UNLOCK);
        Events.emit({ type: 'anim', id: this.id(), anim: 'operate', target: doorCell });
        Sample.play(Assets.SND_UNLOCK);
        this.onOperateComplete();
      } else {
        GLog.w("You don't have a matching key");
        this.markReady();
      }
    } else if (!this.getCloser(doorCell)) {
      this.markReady();
    }
  }

  private actDescend(stairs: number): void {
    if (this.pos === stairs && this.pos === Dungeon.level.exit) {
      this.curAction = null;
      const hunger = this.buff(B.Hunger);
      if (hunger !== null && !hunger.isStarving()) hunger.satisfy(-B.Hunger.STARVING / 10);
      this.pendingTransition = 'descend';
    } else if (!this.getCloser(stairs)) {
      this.markReady();
    }
  }

  private actAscend(stairs: number): void {
    if (this.pos === stairs && this.pos === Dungeon.level.entrance) {
      if (Dungeon.depth === 1) {
        if (this.belongings.getItem(Amulet) === null) {
          UI.message('One does not simply leave Pixel Dungeon.');
          this.markReady();
        } else {
          this.pendingTransition = 'win';
        }
      } else {
        this.curAction = null;
        const hunger = this.buff(B.Hunger);
        if (hunger !== null && !hunger.isStarving()) hunger.satisfy(-B.Hunger.STARVING / 10);
        this.pendingTransition = 'ascend';
      }
    } else if (!this.getCloser(stairs)) {
      this.markReady();
    }
  }

  private actAttack(enemy: Char): void {
    this.enemy = enemy;
    if (adjacent(this.pos, enemy.pos) && enemy.isAlive() && !this.isCharmedBy(enemy)) {
      this.spend(this.attackDelay());
      Events.emit({ type: 'turn', id: this.id(), from: this.pos, to: enemy.pos });
      this.onAttackComplete();
    } else if (!(Dungeon.level.fieldOfView[enemy.pos] && this.getCloser(enemy.pos))) {
      this.markReady();
    }
  }

  /** The toolbar's hourglass: wait one turn, or rest until healthy. */
  rest(tillHealthy: boolean): void {
    this.spendAndNext(TIME_TO_REST);
    if (!tillHealthy) this.showStatus('default', '...');
    this.restoreHealth = tillHealthy;
  }

  attackProc(enemy: Char, damage: number): number {
    const wep = this.weapon();
    if (wep) {
      wep.proc(this, enemy, damage);
      switch (this.subClass) {
        case 'GLADIATOR':
          if (wep instanceof MeleeWeapon) damage += Buff.affect(this, B.Combo).hit(enemy, damage);
          break;
        case 'BATTLEMAGE':
          if (wep instanceof Wand) {
            if (wep.curCharges >= wep.maxCharges) {
              wep.use();
            } else if (damage > 0) {
              wep.curCharges++;
              ScrollOfRecharging.charge(this);
            }
            damage += wep.curCharges;
          }
        // falls through (as in the original)
        case 'SNIPER':
          if (this.rangedWeapon !== null)
            Buff.prolong(this, B.SnipersMark, this.attackDelay() * 1.1).object = enemy.id();
          break;
        default:
      }
    }
    return damage;
  }

  defenseProc(enemy: Char, damage: number): number {
    const thorns = this.buff(RingOfThorns.Effect);
    if (thorns !== null) {
      const dmg = Random.IntRange(0, damage);
      if (dmg > 0) enemy.damage(dmg, thorns);
    }
    const armor = this.buff(EarthrootArmor);
    if (armor !== null) damage = armor.absorb(damage);
    if (this.belongings.armor !== null) damage = this.belongings.armor.proc(enemy, this, damage);
    return damage;
  }

  damage(dmg: number, src: object): void {
    this.restoreHealth = false;
    super.damage(dmg, src);
    if (this.subClass === 'BERSERKER' && 0 < this.HP && this.HP <= this.HT * B.Fury.LEVEL) Buff.affect(this, B.Fury);
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

  visibleEnemy(index: number): Mob {
    return this.visibleEnemies[index % this.visibleEnemies.length];
  }

  private getCloser(target: number): boolean {
    if (this.rooted) {
      Fx.shake(1, 1);
      return false;
    }
    const level = Dungeon.level;
    let step = -1;
    if (adjacent(this.pos, target)) {
      if (Actor.findChar(target) === null) {
        if (level.pit[target] && !this.flying && !Chasm.jumpConfirmed) {
          Chasm.heroJump(this);
          this.interrupt();
          return false;
        }
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
    const heap = level.fieldOfView[cell] ? level.heaps.get(cell) : undefined;

    if (level.map[cell] === Terrain.ALCHEMY && cell !== this.pos) {
      this.curAction = { kind: 'cook', dst: cell };
    } else if (ch && ch !== this) {
      if ((ch as Mob).hostile === false && 'interact' in ch)
        this.curAction = { kind: 'interact', dst: cell, npc: ch as NPC };
      else this.curAction = { kind: 'attack', dst: cell, target: ch };
    } else if (heap && heap.type !== 'HIDDEN') {
      switch (heap.type) {
        case 'HEAP':
          this.curAction = { kind: 'pickUp', dst: cell };
          break;
        case 'FOR_SALE':
          this.curAction =
            heap.size() === 1 && heap.peek()!.price() > 0 ? { kind: 'buy', dst: cell } : { kind: 'pickUp', dst: cell };
          break;
        default:
          this.curAction = { kind: 'openChest', dst: cell };
      }
    } else if (level.map[cell] === Terrain.LOCKED_DOOR || level.map[cell] === Terrain.LOCKED_EXIT) {
      this.curAction = { kind: 'unlock', dst: cell };
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
      this.notifyHp();
      GLog.p(
        `Welcome to level ${this.lvl}! Now you are healthier and more focused. It's easier for you to hit enemies and dodge their attacks.`,
      );
      this.showStatus('positive', 'level up!');
      Sample.play(Assets.SND_LEVELUP);
      Badges.validateLevelReached();
    }
    if (this.subClass === 'WARLOCK') {
      const value = Math.min(this.HT - this.HP, 1 + Math.trunc((Dungeon.depth - 1) / 5));
      if (value > 0) {
        this.heal(value);
        Fx.burst('Speck.HEALING', { id: this.id() }, 1);
      }
      this.buff(B.Hunger)!.satisfy(10);
    }
  }

  maxExp(): number {
    return 5 + this.lvl * 5;
  }

  updateAwareness(): void {
    this.awareness = 1 - Math.pow(this.heroClass === 'ROGUE' ? 0.85 : 0.9, (1 + Math.min(this.lvl, 9)) * 0.5);
  }

  isStarving(): boolean {
    return this.buff(B.Hunger)?.isStarving() ?? false;
  }

  add(buff: Buff): void {
    super.add(buff);
    if (buff instanceof B.Burning) {
      GLog.w('You catch fire!');
      this.interrupt();
    } else if (buff instanceof B.Paralysis) {
      GLog.w('You are paralysed!');
      this.interrupt();
    } else if (buff instanceof B.Poison) {
      GLog.w('You are poisoned!');
      this.interrupt();
    } else if (buff instanceof B.Ooze) {
      GLog.w('Caustic ooze eats your flesh. Wash away it!');
    } else if (buff instanceof B.Roots) {
      GLog.w("You can't move!");
    } else if (buff instanceof B.Weakness) {
      GLog.w('You feel weakened!');
    } else if (buff instanceof B.Blindness) {
      GLog.w('You are blinded!');
    } else if (buff instanceof B.Fury) {
      GLog.w('You become furious!');
      this.showStatus('positive', 'furious');
    } else if (buff instanceof B.Charm) {
      GLog.w('You are charmed!');
    } else if (buff instanceof B.Cripple) {
      GLog.w('You are crippled!');
    } else if (buff instanceof B.Bleeding) {
      GLog.w('You are bleeding!');
    } else if (buff instanceof B.Vertigo) {
      GLog.w('Everything is spinning around you!');
      this.interrupt();
    }
  }

  stealth(): number {
    let stealth = super.stealth();
    for (const buff of this.buffsOf(RingOfShadows.Effect)) stealth += buff.level;
    return stealth;
  }

  die(cause: object | null): void {
    this.curAction = null;
    DewVial.autoDrink(this);
    if (this.isAlive()) {
      Fx.flare(this.id(), 0xffff66, 8);
      return;
    }
    Actor.fixTime();
    super.die(cause);
    const ankh = this.belongings.getItem(Ankh);
    if (ankh === null) {
      Hero.reallyDie(cause);
    } else {
      Events.emit({ type: 'fx', fx: 'resurrect', v: ankh.uid });
    }
  }

  static reallyDie(cause: object | null): void {
    const level = Dungeon.level;
    const hero = Dungeon.hero;
    for (let i = 0; i < LENGTH; i++) {
      const terr = level.map[i];
      if (level.discoverable[i]) {
        level.visited[i] = 1;
        if (flags[terr] & Terrain.SECRET) level.set(i, discover(terr));
      }
    }
    observe();
    hero.belongings.identify();

    const pos = hero.pos;
    const passable: number[] = [];
    for (const ofs of NEIGHBOURS8) {
      const cell = pos + ofs;
      if ((level.passable[cell] || level.avoid[cell]) && !level.heaps.has(cell)) passable.push(cell);
    }
    Random.shuffle(passable);
    const items = [...hero.belongings.backpack.items];
    for (const cell of passable) {
      if (items.length === 0) break;
      const item = Random.element(items)!;
      level.drop(item, cell).dropFX(pos);
      items.splice(items.indexOf(item), 1);
    }

    if (isDoom(cause)) cause.onDeath();
    Events.emit({ type: 'heroDied' });
  }

  move(step: number): void {
    super.move(step);
    if (!this.flying) {
      if (Dungeon.level.water[this.pos]) Sample.play(Assets.SND_WATER);
      else Sample.play(Assets.SND_STEP);
      Dungeon.level.press(this.pos, this);
    }
    // PD runs this when the move animation completes; nothing else observes in between, so do it now.
    this.onMotionComplete();
  }

  onMotionComplete(): void {
    observe();
    this.search(false);
  }

  /** The attack animation finished: resolve the blow. */
  private onAttackComplete(): void {
    this.attack(this.enemy!);
    this.curAction = null;
    B.Invisibility.dispel();
  }

  /** The operate animation finished: use the key on a door or open the chest. */
  private onOperateComplete(): void {
    const a = this.curAction;
    if (a?.kind === 'unlock') {
      if (this.theKey !== null) {
        this.theKey.detach(this.belongings.backpack);
        this.theKey = null;
      }
      const door = Dungeon.level.map[a.dst];
      Dungeon.level.set(a.dst, door === Terrain.LOCKED_DOOR ? Terrain.DOOR : Terrain.UNLOCKED_EXIT);
    } else if (a?.kind === 'openChest') {
      if (this.theKey !== null) {
        this.theKey.detach(this.belongings.backpack);
        this.theKey = null;
      }
      const heap = Dungeon.level.heaps.get(a.dst)!;
      if (heap.type === 'SKELETON') Sample.play(Assets.SND_BONES);
      heap.open(this);
    }
    this.curAction = null;
  }

  search(intentional: boolean): boolean {
    let smthFound = false;
    let positive = 0;
    let negative = 0;
    for (const buff of this.buffsOf(RingOfDetection.Effect)) {
      const bonus = buff.level;
      if (bonus > positive) positive = bonus;
      else if (bonus < 0) negative += bonus;
    }
    let distance = 1 + positive + negative;
    let level = intentional ? 2 * this.awareness - this.awareness * this.awareness : this.awareness;
    if (distance <= 0) {
      level /= 2 - distance;
      distance = 1;
    }

    const lvl = Dungeon.level;
    const cx = this.pos % WIDTH;
    const cy = Math.floor(this.pos / WIDTH);
    const ax = Math.max(0, cx - distance);
    const bx = Math.min(WIDTH - 1, cx + distance);
    const ay = Math.max(0, cy - distance);
    const by = Math.min(HEIGHT - 1, cy + distance);

    for (let y = ay; y <= by; y++) {
      for (let x = ax, p = ax + y * WIDTH; x <= bx; x++, p++) {
        if (Dungeon.visible[p]) {
          if (intentional) Fx.at('checkedCell', p);
          if (lvl.secret[p] && (intentional || Random.Float() < level)) {
            const oldValue = lvl.map[p];
            Fx.at('discoverTile', p, oldValue);
            lvl.set(p, discover(oldValue));
            MagicMapping.discover(p);
            smthFound = true;
          }
          if (intentional) {
            const heap = lvl.heaps.get(p);
            if (heap && heap.type === 'HIDDEN') {
              heap.open(this);
              smthFound = true;
            }
          }
        }
      }
    }

    if (intentional) {
      this.showStatus('default', 'search');
      Events.emit({ type: 'anim', id: this.id(), anim: 'operate', target: this.pos });
      if (smthFound) this.spendAndNext(Random.Float() < level ? TIME_TO_SEARCH : TIME_TO_SEARCH * 2);
      else this.spendAndNext(TIME_TO_SEARCH);
    }

    if (smthFound) {
      GLog.w('You noticed something');
      Sample.play(Assets.SND_SECRET);
      this.interrupt();
    }
    return smthFound;
  }

  resurrect(resetLevel: number): void {
    this.HP = this.HT;
    Dungeon.gold = 0;
    this.exp = 0;
    this.belongings.resurrect(resetLevel);
    this.live();
  }

  resistances(): Set<unknown> {
    const r = this.buff(Resistance);
    return r === null ? super.resistances() : r.resistances();
  }

  immunities(): Set<unknown> {
    return this.buff(B.GasesImmunity) === null ? super.immunities() : B.GasesImmunity.IMMUNITIES;
  }
}

registerClass('Hero', Hero);
