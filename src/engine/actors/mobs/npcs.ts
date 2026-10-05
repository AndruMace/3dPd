// Ports of actors/mobs/npcs/* used so far: NPC, the Sad Ghost and its quest, the Rat King, golden bees, mirror
// images and the Wand of Flock's sheep.
import { Assets } from '../../../content/generated/Assets';
import { Dungeon } from '../../Dungeon';
import { Journal } from '../../Journal';
import { Actor, TICK } from '../Actor';
import type { Buff } from '../buffs/Buff';
import * as B from '../buffs/buffs';
import { ToxicGas } from '../blobs/blobs';
import type { Char } from '../Char';
import type { Hero } from '../hero/Hero';
import { Bundle, registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import type { Armor } from '../../items/armor/Armor';
import { Generator } from '../../items/Generator';
import type { Item } from '../../items/Item';
import { DriedRose, RatSkull } from '../../items/misc';
import { MissileWeapon } from '../../items/weapon/missiles';
import type { Weapon } from '../../items/weapon/Weapon';
import { NEIGHBOURS8 } from '../../levels/constants';
import type { Level } from '../../levels/Level';
import { Mob } from './Mob';

export abstract class NPC extends Mob {
  constructor() {
    super();
    this.HP = this.HT = 1;
    this.EXP = 0;
    this.hostile = false;
    this.state = 'PASSIVE';
  }

  protected throwItem(): void {
    const heap = Dungeon.level.heaps.get(this.pos);
    if (heap) {
      let n: number;
      do {
        n = this.pos + NEIGHBOURS8[Random.Int(8)];
      } while (!Dungeon.level.passable[n] && !Dungeon.level.avoid[n]);
      Dungeon.level.drop(heap.pickUp(), n).dropFX(this.pos);
    }
  }

  beckon(_cell: number): void {}

  abstract interact(): void;
}

/** Bee and MirrorImage pick a hostile mob in view as their enemy. */
function chooseHostileInView(_self: Mob, current: Char | null): Char | null {
  if (current === null || !current.isAlive()) {
    const enemies = new Set<Mob>();
    for (const mob of Dungeon.level.mobs) if (mob.hostile && Dungeon.level.fieldOfView[mob.pos]) enemies.add(mob);
    return enemies.size > 0 ? Random.element(enemies) : null;
  }
  return current;
}

/** Bee.interact / MirrorImage.interact: swap places with the hero. */
function swapWithHero(self: Mob): void {
  const hero = Dungeon.hero;
  const curPos = self.pos;
  self.move(hero.pos);
  hero.move(curPos);
  hero.spend(1 / hero.speed());
  hero.busy();
}

// ---- The Sad Ghost ----

type QuestType = 'ROSE' | 'RAT' | 'CURSE';

const QuestState = {
  type: 'ROSE' as QuestType,
  spawned: false,
  given: false,
  processed: false,
  depth: 0,
  left2kill: 0,
  weapon: null as Weapon | null,
  armor: null as Armor | null,
};

export class Ghost extends NPC {
  private static readonly IMMUNITIES = new Set<unknown>([B.Paralysis, B.Roots]);

  constructor() {
    super();
    this.name = 'sad ghost';
    this.spriteId = 'Ghost';
    this.flying = true;
    this.state = 'WANDERING';
  }

  defenseSkill(_enemy: Char): number {
    return 1000;
  }
  defenseVerb(): string {
    return 'evaded';
  }
  speed(): number {
    return 0.5;
  }
  protected chooseEnemy(): Char | null {
    return null;
  }
  damage(_dmg: number, _src: object): void {}
  add(_buff: Buff): void {}
  reset(): boolean {
    return true;
  }

  interact(): void {
    Events.emit({ type: 'turn', id: this.id(), from: this.pos, to: Dungeon.hero.pos });
    Sample.play(Assets.SND_GHOST);
    QUEST_HANDLERS[QuestState.type].interact(this);
  }

  description(): string {
    return 'The ghost is barely visible. It looks like a shapeless spot of faint light with a sorrowful face.';
  }

  immunities(): Set<unknown> {
    return Ghost.IMMUNITIES;
  }

  /** Ghost.replace: one mob fades into another on the same cell. */
  static replace(a: Mob, b: Mob): void {
    a.destroy();
    Events.emit({ type: 'fx', fx: 'fadeOut', id: a.id(), v: 0.5 });
    Events.emit({ type: 'remove', id: a.id() });
    b.pos = a.pos;
    Dungeon.level.addMob(b);
    Events.emit({ type: 'fx', fx: 'fadeIn', id: b.id(), v: 0.5 });
  }

  static readonly Quest = {
    reset(): void {
      QuestState.spawned = false;
      QuestState.weapon = null;
      QuestState.armor = null;
    },

    storeInBundle(bundle: Bundle): void {
      const node = new Bundle();
      node.put('spawned', QuestState.spawned);
      if (QuestState.spawned) {
        node.put('type', QuestState.type);
        if (QuestState.type === 'ROSE') node.put('left2kill', QuestState.left2kill);
        node.put('given', QuestState.given);
        node.put('depth', QuestState.depth);
        node.put('processed', QuestState.processed);
        node.put('weapon', QuestState.weapon);
        node.put('armor', QuestState.armor);
      }
      bundle.put('sadGhost', node);
    },

    restoreFromBundle(bundle: Bundle): void {
      const node = bundle.getBundle('sadGhost');
      if (!node.isNull() && (QuestState.spawned = node.getBoolean('spawned'))) {
        QuestState.type = node.getEnum<QuestType>('type', 'ROSE');
        if (QuestState.type === 'ROSE') QuestState.left2kill = node.getInt('left2kill');
        QuestState.given = node.getBoolean('given');
        QuestState.depth = node.getInt('depth');
        QuestState.processed = node.getBoolean('processed');
        QuestState.weapon = node.get<Weapon>('weapon');
        QuestState.armor = node.get<Armor>('armor');
      } else {
        Ghost.Quest.reset();
      }
    },

    spawn(level: Level): void {
      if (!QuestState.spawned && Dungeon.depth > 1 && Random.Int(5 - Dungeon.depth) === 0) {
        const ghost = new Ghost();
        do {
          ghost.pos = level.randomRespawnCell();
        } while (ghost.pos === -1);
        level.mobs.add(ghost);
        Actor.occupyCell(ghost);

        QuestState.spawned = true;
        switch (Random.Int(3)) {
          case 0:
            QuestState.type = 'ROSE';
            QuestState.left2kill = 8;
            break;
          case 1:
            QuestState.type = 'RAT';
            break;
          case 2:
            QuestState.type = 'CURSE';
            break;
        }
        QuestState.given = false;
        QuestState.processed = false;
        QuestState.depth = Dungeon.depth;

        for (let i = 0; i < 4; i++) {
          let another: Item;
          do {
            another = Generator.random('WEAPON');
          } while (another instanceof MissileWeapon);
          if (QuestState.weapon === null || another.level() > QuestState.weapon.level())
            QuestState.weapon = another as Weapon;
        }
        let armor = Generator.random('ARMOR') as Armor;
        for (let i = 0; i < 3; i++) {
          const another = Generator.random('ARMOR');
          if (another.level() > armor.level()) armor = another as Armor;
        }
        QuestState.armor = armor;
        QuestState.weapon!.identify();
        QuestState.armor.identify();
      }
    },

    processSewersKill(pos: number): void {
      if (QuestState.spawned && QuestState.given && !QuestState.processed && QuestState.depth === Dungeon.depth) {
        switch (QuestState.type) {
          case 'ROSE':
            if (Random.Int(QuestState.left2kill) === 0) {
              Dungeon.level.drop(new DriedRose(), pos).dropFX(pos);
              QuestState.processed = true;
            } else {
              QuestState.left2kill--;
            }
            break;
          case 'RAT': {
            const FetidRat = lazy<new () => Mob>('FetidRat');
            const rat = new FetidRat();
            rat.pos = Dungeon.level.randomRespawnCell();
            if (rat.pos !== -1) {
              Dungeon.level.addMob(rat);
              QuestState.processed = true;
            }
            break;
          }
          default:
        }
      }
    },

    complete(): void {
      QuestState.weapon = null;
      QuestState.armor = null;
      Journal.remove('GHOST');
    },
  };
}

function relocate(ghost: Ghost): void {
  let newPos = -1;
  for (let i = 0; i < 10; i++) {
    newPos = Dungeon.level.randomRespawnCell();
    if (newPos !== -1) break;
  }
  if (newPos !== -1) {
    Actor.freeCell(ghost.pos);
    Fx.start('Speck.LIGHT', ghost.pos, 0.2, 3);
    ghost.pos = newPos;
    Events.emit({ type: 'place', id: ghost.id(), pos: newPos });
  }
}

/** WndSadGhost: choose the ghost's weapon or armor as the reward. */
function sadGhostReward(ghost: Ghost, questItem: Item | null, text: string): void {
  UI.quest(ghost, text, ["Ghost's weapon", "Ghost's armor"], (index) => {
    const hero = Dungeon.hero;
    if (questItem !== null) questItem.detach(hero.belongings.backpack);
    const reward = (index === 0 ? QuestState.weapon : QuestState.armor)!;
    if (reward.doPickUp(hero)) GLog.i(`You now have ${reward.name_()}`);
    else Dungeon.level.drop(reward, ghost.pos).dropFX(ghost.pos);
    ghost.yell('Farewell, adventurer!');
    ghost.die(null);
    Ghost.Quest.complete();
  });
}

const QUEST_HANDLERS: Record<QuestType, { interact(ghost: Ghost): void }> = {
  ROSE: {
    interact(ghost) {
      if (QuestState.given) {
        const item = Dungeon.hero.belongings.getItem(DriedRose);
        if (item !== null) {
          sadGhostReward(
            ghost,
            item,
            'Yes! Yes!!! This is it! Please give it to me! And you can take one of these items, maybe they will be useful to you in your journey...',
          );
        } else {
          UI.quest(ghost, 'Please... Help me... _Find the rose_...');
          relocate(ghost);
        }
      } else {
        UI.quest(
          ghost,
          "Hello adventurer... Once I was like you - strong and confident... And now I'm dead... But I can't leave this place... Not until I have my _dried rose_... It's very important to me... Some monster stole it from my body...",
        );
        QuestState.given = true;
        Journal.add('GHOST');
      }
    },
  },
  RAT: {
    interact(ghost) {
      if (QuestState.given) {
        const item = Dungeon.hero.belongings.getItem(RatSkull);
        if (item !== null) {
          sadGhostReward(
            ghost,
            item,
            'Yes! The ugly creature is slain and I can finally rest... Please take one of these items, maybe they will be useful to you in your journey...',
          );
        } else {
          UI.quest(ghost, 'Please... Help me... _Slay the abomination_...');
          relocate(ghost);
        }
      } else {
        UI.quest(
          ghost,
          "Hello adventurer... Once I was like you - strong and confident... And now I'm dead... But I can't leave this place... Not until I have my revenge... Slay the _fetid rat_, that has taken my life...",
        );
        QuestState.given = true;
        Journal.add('GHOST');
      }
    },
  },
  CURSE: {
    interact(ghost) {
      if (QuestState.given) {
        sadGhostReward(
          ghost,
          null,
          `Thank you, ${Dungeon.hero.className()}! The curse is broken and I can finally rest... Please take one of these items, maybe they will be useful to you in your journey...`,
        );
      } else {
        UI.quest(
          ghost,
          "Hello adventurer... Once I was like you - strong and confident... And now I'm dead... But I can't leave this place, as I am bound by a horrid curse... Please... Help me... _Destroy the curse_...",
          ['Yes, I will do it for you', "No, I can't help you"],
          (index) => {
            if (index === 0) {
              QuestState.given = true;
              const d = new (lazy<new () => Mob>('CursePersonification'))();
              Ghost.replace(ghost, d);
              Fx.burst('ShadowParticle.CURSE', { id: d.id() }, 5);
              Sample.play(Assets.SND_GHOST);
              Dungeon.hero.busy();
            } else {
              relocate(ghost);
            }
          },
        );
        Journal.add('GHOST');
      }
    },
  },
};

// ---- Others ----

export class RatKing extends NPC {
  constructor() {
    super();
    this.name = 'rat king';
    this.spriteId = 'RatKing';
    this.state = 'SLEEPING';
  }
  defenseSkill(_enemy: Char): number {
    return 1000;
  }
  speed(): number {
    return 2;
  }
  protected chooseEnemy(): Char | null {
    return null;
  }
  damage(_dmg: number, _src: object): void {}
  add(_buff: Buff): void {}
  reset(): boolean {
    return true;
  }
  interact(): void {
    Events.emit({ type: 'turn', id: this.id(), from: this.pos, to: Dungeon.hero.pos });
    if (this.state === 'SLEEPING') {
      this.notice();
      this.yell("I'm not sleeping!");
      this.state = 'WANDERING';
    } else {
      this.yell("What is it? I have no time for this nonsense. My kingdom won't rule itself!");
    }
  }
  description(): string {
    return "This rat is a little bigger than a regular marsupial rat and it's wearing a tiny crown on its head.";
  }
}

export class Bee extends NPC {
  private static readonly IMMUNITIES = new Set<unknown>([B.Poison]);
  private levelValue = 0;

  constructor() {
    super();
    this.name = 'golden bee';
    this.spriteId = 'Bee';
    this.viewDistance = 4;
    this.flying = true;
    this.state = 'WANDERING';
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('level', this.levelValue);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.spawn(bundle.getInt('level'));
  }
  spawn(level: number): void {
    this.levelValue = level;
    this.HT = (3 + level) * 5;
    this.defenseSkillValue = 9 + level;
  }
  attackSkill(_target: Char): number {
    return this.defenseSkillValue;
  }
  damageRoll(): number {
    return Random.NormalIntRange(Math.trunc(this.HT / 10), Math.trunc(this.HT / 4));
  }
  attackProc(enemy: Char, damage: number): number {
    if (enemy !== Dungeon.hero) (enemy as Mob).aggro(this);
    return damage;
  }
  protected act(): boolean {
    this.HP--;
    if (this.HP <= 0) {
      this.die(null);
      return true;
    }
    return super.act();
  }
  realtimeTurn(): void {
    this.HP--;
    if (this.HP <= 0) this.die(null);
  }
  protected chooseEnemy(): Char | null {
    return chooseHostileInView(this, this.enemy);
  }
  /** Bee.Wandering: follow the hero until an enemy shows up. */
  protected actWandering(enemyInFOV: boolean): boolean {
    if (enemyInFOV && this.enemy) {
      this.enemySeen = true;
      this.notice();
      this.state = 'HUNTING';
      this.target = this.enemy.pos;
    } else {
      this.enemySeen = false;
      const oldPos = this.pos;
      if (this.getCloser(Dungeon.hero.pos)) {
        this.spend(1 / this.speed());
        return this.moveSprite(oldPos, this.pos);
      }
      this.spend(TICK);
    }
    return true;
  }
  description(): string {
    return "Despite their small size, golden bees tend to protect their master fiercely. They don't live long though.";
  }
  interact(): void {
    swapWithHero(this);
  }
  immunities(): Set<unknown> {
    return Bee.IMMUNITIES;
  }
}

export class MirrorImage extends NPC {
  private static readonly IMMUNITIES = new Set<unknown>([ToxicGas, B.Burning]);
  tier = 0;
  private attackValue = 0;
  private damageValue = 0;

  constructor() {
    super();
    this.name = 'mirror image';
    this.spriteId = Dungeon.hero ? Dungeon.hero.spriteSheet : 'HeroWarrior';
    this.state = 'HUNTING';
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('tier', this.tier);
    bundle.put('attack', this.attackValue);
    bundle.put('damage', this.damageValue);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.tier = bundle.getInt('tier');
    this.attackValue = bundle.getInt('attack');
    this.damageValue = bundle.getInt('damage');
  }
  duplicate(hero: Hero): void {
    this.tier = hero.tier();
    this.attackValue = hero.attackSkill(hero);
    this.damageValue = hero.damageRoll();
    this.spriteId = hero.spriteSheet;
  }
  attackSkill(_target: Char): number {
    return this.attackValue;
  }
  damageRoll(): number {
    return this.damageValue;
  }
  attackProc(enemy: Char, damage: number): number {
    const dmg = super.attackProc(enemy, damage);
    this.destroy();
    Events.emit({ type: 'die', id: this.id() });
    return dmg;
  }
  protected chooseEnemy(): Char | null {
    return chooseHostileInView(this, this.enemy);
  }
  description(): string {
    return "This illusion bears a close resemblance to you, but it's paler and twitches a little.";
  }
  interact(): void {
    swapWithHero(this);
  }
  immunities(): Set<unknown> {
    return MirrorImage.IMMUNITIES;
  }
}

/** WandOfFlock.Sheep: an unkillable obstacle that fades away. */
export class Sheep extends NPC {
  private static readonly QUOTES = ['Baa!', 'Baa?', 'Baa.', 'Baa...'];
  lifespan = 0;
  private initialized = false;

  constructor() {
    super();
    this.name = 'sheep';
    this.spriteId = 'Sheep';
  }
  protected act(): boolean {
    if (this.initialized) {
      this.HP = 0;
      this.destroy();
      Events.emit({ type: 'die', id: this.id() });
    } else {
      this.initialized = true;
      this.spend(this.lifespan + Random.Float(2));
    }
    return true;
  }
  damage(_dmg: number, _src: object): void {}
  realtimeScheduled(): boolean {
    return true;
  }
  description(): string {
    return "This is a magic sheep. What's so magical about it? You can't kill it. It will stand there until it magcially fades away, all the while chewing cud with a blank stare.";
  }
  interact(): void {
    this.yell(Random.element(Sheep.QUOTES)!);
  }
}

registerClass('NPC', NPC);
registerClass('Ghost', Ghost);
registerClass('RatKing', RatKing);
registerClass('Bee', Bee);
registerClass('MirrorImage', MirrorImage);
registerClass('WandOfFlock.Sheep', Sheep);
