// Ports of the wands in items/wands/.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon, ResultDescriptions } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import { Blob } from '../../actors/blobs/Blob';
import { Fire, Regrowth } from '../../actors/blobs/blobs';
import { Buff } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Mob } from '../../actors/mobs/Mob';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { isA, lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { UI } from '../../core/ui';
import { LENGTH, NEIGHBOURS8 } from '../../levels/constants';
import { LIGHTNING } from '../../levels/traps/Electricity';
import { Terrain } from '../../levels/Terrain';
import { Ballistica } from '../../mechanics/Ballistica';
import { PathFinder } from '../../mechanics/PathFinder';
import { observe } from '../../observe';
import type { Heap } from '../Heap';
import { Item } from '../Item';
import { Wand } from './Wand';

const isMob = (ch: Char) => ch !== Dungeon.hero;
const press = (ch: Char | null, cell: number) => {
  if (ch && isMob(ch)) Dungeon.level.mobPress(ch as Mob);
  else Dungeon.level.press(cell, ch);
};

export class WandOfAmok extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Amok';
  }
  protected onZap(cell: number): void {
    const ch = Actor.findChar(cell);
    if (ch) {
      if (ch === Dungeon.hero) Buff.affect(ch, B.Vertigo, B.Vertigo.duration(ch));
      else Buff.affect(ch, B.Amok, 3 + this.power());
    } else {
      GLog.i('nothing happened');
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.purpleLight', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'The purple light from this wand will make the target run amok attacking random creatures in its vicinity.';
  }
}

export class WandOfAvalanche extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Avalanche';
    this.hitChars = false;
  }
  protected onZap(cell: number): void {
    Sample.play(Assets.SND_ROCKS);
    const level = this.power();
    Ballistica.distance = Math.min(Ballistica.distance, 8 + level);
    const size = 1 + Math.trunc(level / 3);
    const notSolid = Dungeon.level.solid.map((v) => (v ? 0 : 1));
    PathFinder.buildDistanceMap(cell, notSolid, size);
    let shake = 0;
    for (let i = 0; i < LENGTH; i++) {
      const d = PathFinder.distance[i];
      if (d < PathFinder.INFINITY) {
        const ch = Actor.findChar(i);
        if (ch) {
          ch.damage(Random.Int(2, 6 + (size - d) * 2), this);
          if (ch.isAlive() && Random.Int(2 + d) === 0) Buff.prolong(ch, B.Paralysis, Random.IntRange(2, 6));
        }
        if (ch && ch.isAlive()) press(ch, i);
        else Dungeon.level.press(i, null);
        if (Dungeon.visible[i]) {
          Fx.start('Speck.ROCK', i, 0.07, 3 + (size - d));
          if (Dungeon.level.water[i]) Fx.ripple(i);
          if (shake < size - d) shake = size - d;
        }
      }
    }
    Fx.shake(3, 0.07 * (3 + shake));
    if (!this.curUser.isAlive()) {
      Dungeon.fail(ResultDescriptions.WAND(this.name, Dungeon.depth));
      GLog.n('You killed yourself with your own Wand of Avalanche...');
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.earth', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'When a discharge of this wand hits a wall (or any other solid obstacle) it causes an avalanche of stones, damaging and stunning all creatures in the affected area.';
  }
}

export class WandOfBlink extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Blink';
  }
  protected onZap(cell: number): void {
    const level = this.power();
    if (Ballistica.distance > level + 4) cell = Ballistica.trace[level + 3];
    else if (Actor.findChar(cell) !== null && Ballistica.distance > 1) cell = Ballistica.trace[Ballistica.distance - 2];
    WandOfBlink.appear(Dungeon.hero, cell);
    observe();
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.whiteLight', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  /** Instantly moves a character, with PD's fade-in and sparkle. */
  static appear(ch: Char, pos: number): void {
    const from = ch.pos;
    ch.move(pos);
    Events.emit({ type: 'place', id: ch.id(), pos });
    if (ch.invisible === 0) Events.emit({ type: 'fx', fx: 'appear', id: ch.id(), pos: from, to: pos });
    Fx.start('Speck.LIGHT', pos, 0.2, 3);
    Sample.play(Assets.SND_TELEPORT);
  }
  desc(): string {
    return 'This wand will allow you to teleport in the chosen direction. Creatures and inanimate obstructions will block the teleportation.';
  }
}

export class WandOfDisintegration extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Disintegration';
    this.hitChars = false;
  }
  protected onZap(_cell: number): void {
    const level = Dungeon.level;
    let terrainAffected = false;
    const lvlPower = this.power();
    Ballistica.distance = Math.min(Ballistica.distance, this.reach());
    const chars: Char[] = [];
    for (let i = 1; i < Ballistica.distance; i++) {
      const c = Ballistica.trace[i];
      const ch = Actor.findChar(c);
      if (ch) chars.push(ch);
      const terr = level.map[c];
      if (terr === Terrain.DOOR || terr === Terrain.SIGN) {
        level.destroy(c);
        terrainAffected = true;
      } else if (terr === Terrain.HIGH_GRASS) {
        level.set(c, Terrain.GRASS);
        terrainAffected = true;
      }
      Fx.burst('PurpleParticle.BURST', { pos: c }, Random.IntRange(1, 2));
    }
    if (terrainAffected) observe();
    const lvl = lvlPower + chars.length;
    const dmgMin = lvl;
    const dmgMax = 8 + Math.trunc((lvl * lvl) / 3);
    for (const ch of chars) {
      ch.damage(Random.NormalIntRange(dmgMin, dmgMax), this);
      Fx.burst('PurpleParticle.BURST', { id: ch.id() }, Random.IntRange(1, 2));
    }
  }
  private reach(): number {
    return this.level() + 4;
  }
  protected fx(_cell: number): void {
    const cell = Ballistica.trace[Math.min(Ballistica.distance, this.reach()) - 1];
    Fx.bolt('DeathRay', this.curUser.pos, cell);
  }
  desc(): string {
    return 'This wand emits a beam of destructive energy, which pierces all creatures in its way. The more targets it hits, the more damage it inflicts to each of them.';
  }
}

export class WandOfFirebolt extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Firebolt';
  }
  protected onZap(cell: number): void {
    const level = this.power();
    for (let i = 1; i < Ballistica.distance - 1; i++) {
      const c = Ballistica.trace[i];
      if (Dungeon.level.flamable[c]) Dungeon.level.addBlob(Blob.seed(c, 1, Fire));
    }
    Dungeon.level.addBlob(Blob.seed(cell, 1, Fire));
    const ch = Actor.findChar(cell);
    if (ch) {
      ch.damage(Random.Int(1, 8 + level * level), this);
      Buff.affect(ch, B.Burning).reignite(ch);
      Fx.burst('FlameParticle', { id: ch.id() }, 5);
      if (ch === this.curUser && !ch.isAlive()) {
        Dungeon.fail(ResultDescriptions.WAND(this.name, Dungeon.depth));
        GLog.n('You killed yourself with your own Wand of Firebolt...');
      }
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.fire', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'This wand unleashes bursts of magical fire. It will ignite flammable terrain, and will damage and burn a creature it hits.';
  }
}

export class WandOfFlock extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Flock';
  }
  protected onZap(cell: number): void {
    const level = this.power();
    const n = level + 2;
    if (Actor.findChar(cell) !== null && Ballistica.distance > 2) cell = Ballistica.trace[Ballistica.distance - 2];

    const lvl = Dungeon.level;
    const passable = new Uint8Array(LENGTH);
    for (let i = 0; i < LENGTH; i++) passable[i] = lvl.passable[i] | lvl.avoid[i];
    for (const actor of Actor.all()) if (actor.isChar()) passable[actor.pos] = 0;
    PathFinder.buildDistanceMap(cell, passable, n);
    let dist = 0;
    if (Actor.findChar(cell) !== null) {
      PathFinder.distance[cell] = PathFinder.INFINITY;
      dist = 1;
    }

    const lifespan = level + 3;
    const Sheep = lazy<new () => Mob & { lifespan: number }>('WandOfFlock.Sheep');
    sheepLabel: for (let i = 0; i < n; i++) {
      do {
        for (let j = 0; j < LENGTH; j++) {
          if (PathFinder.distance[j] === dist) {
            const sheep = new Sheep();
            sheep.lifespan = lifespan;
            sheep.pos = j;
            lvl.addMob(sheep);
            lvl.mobPress(sheep);
            Fx.burst('Speck.WOOL', { pos: j }, 4);
            PathFinder.distance[j] = PathFinder.INFINITY;
            continue sheepLabel;
          }
        }
        dist++;
      } while (dist < n);
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.wool', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'A flick of this wand summons a flock of magic sheep, creating temporary impenetrable obstacle.';
  }
}

export class WandOfLightning extends Wand {
  private affected: Char[] = [];
  private points: number[] = [];

  constructor() {
    super();
    this.name = 'Wand of Lightning';
  }
  protected onZap(_cell: number): void {
    // Everything is processed in fx()
    if (!this.curUser.isAlive()) {
      Dungeon.fail(ResultDescriptions.WAND(this.name, Dungeon.depth));
      GLog.n('You killed yourself with your own Wand of Lightning...');
    }
  }
  private hit(ch: Char, damage: number): void {
    if (damage < 1) return;
    if (ch === Dungeon.hero) Fx.shake(2, 0.3);
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
  protected fx(cell: number): void {
    this.points = [Dungeon.hero.pos];
    const ch = Actor.findChar(cell);
    if (ch) {
      this.affected = [];
      const lvl = this.power();
      // The bolt is drawn before the damage resolves, as in the original's callback order.
      const pts = this.points;
      this.hit(ch, Random.Int(5 + Math.trunc(lvl / 2), 10 + lvl));
      for (let i = 1; i < pts.length; i++) Fx.bolt('Lightning', pts[i - 1], pts[i]);
    } else {
      Fx.bolt('Lightning', Dungeon.hero.pos, cell);
      Fx.burst('SparkParticle', { pos: cell }, 3);
    }
  }
  desc(): string {
    return 'This wand conjures forth deadly arcs of electricity, which deal damage to several creatures standing close to each other.';
  }
}

export class WandOfMagicMissile extends Wand {
  static readonly AC_DISENCHANT = 'DISENCHANT';
  private static readonly TIME_TO_DISENCHANT = 2;

  constructor() {
    super();
    this.name = 'Wand of Magic Missile';
    this.image = ItemSpriteSheet.WAND_MAGIC_MISSILE;
  }
  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    if (this.level() > 0) actions.push(WandOfMagicMissile.AC_DISENCHANT);
    return actions;
  }
  protected onZap(cell: number): void {
    const ch = Actor.findChar(cell);
    if (ch) {
      const level = this.power();
      ch.damage(Random.Int(1, 6 + level * 2), this);
      Events.emit({ type: 'fx', fx: 'burst', id: ch.id(), color: 0xff99ccff, n: Math.trunc(level / 2) + 2 });
      if (ch === this.curUser && !ch.isAlive()) {
        Dungeon.fail(ResultDescriptions.WAND(this.name, Dungeon.depth));
        GLog.n('You killed yourself with your own Wand of Magic Missile...');
      }
    }
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== WandOfMagicMissile.AC_DISENCHANT) {
      super.execute(hero, action);
      return;
    }
    let disenchantEquipped: boolean;
    if (hero.belongings.weapon === this) {
      disenchantEquipped = true;
      hero.belongings.weapon = null;
    } else {
      disenchantEquipped = false;
      this.detach(hero.belongings.backpack);
    }
    UI.selectItem('WAND', 'Select a wand to upgrade', (item) => {
      if (item !== null) {
        Sample.play(Assets.SND_EVOKE);
        lazy<{ upgrade(h: Hero): void }>('ScrollOfUpgrade').upgrade(hero);
        Item.evoke(hero);
        GLog.w(`you disenchanted the Wand of Magic Missile and used its essence to upgrade your ${item.name_()}`);
        item.upgrade();
        hero.spendAndNext(WandOfMagicMissile.TIME_TO_DISENCHANT);
        Badges.validateItemLevelAquired(item);
      } else if (disenchantEquipped) {
        hero.belongings.weapon = this;
      } else {
        this.collect(hero.belongings.backpack);
      }
    });
  }
  protected isKnown(): boolean {
    return true;
  }
  setKnown(): void {}
  protected initialCharges(): number {
    return 3;
  }
  desc(): string {
    return 'This wand launches missiles of pure magical energy, dealing moderate damage to a target creature.';
  }
}

export class WandOfPoison extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Poison';
  }
  protected onZap(cell: number): void {
    const ch = Actor.findChar(cell);
    if (ch) Buff.affect(ch, B.Poison).set(B.Poison.durationFactor(ch) * (5 + this.power()));
    else GLog.i('nothing happened');
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.poison', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'The vile blast of this twisted bit of wood will imbue its target with a deadly venom. A creature that is poisoned will suffer periodic damage until the effect ends. The duration of the effect increases with the level of the staff.';
  }
}

export class WandOfReach extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Reach';
    this.hitChars = false;
  }
  protected onZap(_cell: number): void {
    const level = Dungeon.level;
    const user = this.curUser;
    const reach = Math.min(Ballistica.distance, this.power() + 4);
    let mapUpdated = false;
    for (let i = 1; i < reach; i++) {
      const c = Ballistica.trace[i];
      const before = level.map[c];
      const ch = Actor.findChar(c);
      if (ch) {
        swap(user, ch);
        break;
      }
      const heap = level.heaps.get(c);
      if (heap) {
        switch (heap.type) {
          case 'HEAP':
            this.transport(heap);
            break;
          case 'CHEST':
          case 'MIMIC':
          case 'TOMB':
          case 'SKELETON':
            heap.open(user);
            break;
          default:
        }
        break;
      }
      level.press(c, null);
      if (before === Terrain.OPEN_DOOR) level.set(c, Terrain.DOOR);
      else if (level.water[c]) Fx.ripple(c);
      mapUpdated = mapUpdated || level.map[c] !== before;
    }
    if (mapUpdated) observe();
  }
  private transport(heap: Heap): void {
    const user = this.curUser;
    const item = heap.pickUp();
    if (item.doPickUp(user)) {
      if (!isA(item, 'Dewdrop')) {
        const msg = `You have magically transported ${item.name_()} into your backpack`;
        if (user.isImportantPickup(item)) GLog.p(msg);
        else GLog.i(msg);
      }
    } else {
      Dungeon.level.drop(item, user.pos).dropFX(user.pos);
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.force', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'This utility wand can be used to grab objects from a distance and to switch places with enemies. Waves of magic force radiated from it will affect all cells on their way triggering traps, trampling high vegetation, opening closed doors and closing open ones.';
  }
}

/** effects/Swap: two characters trade places. */
function swap(ch1: Char, ch2: Char): void {
  Sample.play(Assets.SND_TELEPORT);
  const pos = ch1.pos;
  ch1.pos = ch2.pos;
  ch2.pos = pos;
  Events.emit({ type: 'fx', fx: 'swap', id: ch1.id(), pos: ch2.pos, to: ch1.pos });
  Events.emit({ type: 'fx', fx: 'swap', id: ch2.id(), pos: ch1.pos, to: ch2.pos });
  if (!ch1.flying) press(ch1, ch1.pos);
  if (!ch2.flying) press(ch2, ch2.pos);
  if (ch1 === Dungeon.hero || ch2 === Dungeon.hero) observe();
}

export class WandOfRegrowth extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Regrowth';
  }
  protected onZap(cell: number): void {
    const level = Dungeon.level;
    for (let i = 1; i < Ballistica.distance - 1; i++) {
      const p = Ballistica.trace[i];
      const c = level.map[p];
      if (c === Terrain.EMPTY || c === Terrain.EMBERS || c === Terrain.EMPTY_DECO) {
        level.set(p, Terrain.GRASS);
        if (Dungeon.visible[p]) Fx.at('discoverTile', p, c);
      }
    }
    const c = level.map[cell];
    if (
      c === Terrain.EMPTY ||
      c === Terrain.EMBERS ||
      c === Terrain.EMPTY_DECO ||
      c === Terrain.GRASS ||
      c === Terrain.HIGH_GRASS
    ) {
      level.addBlob(Blob.seed(cell, (this.power() + 2) * 20, Regrowth));
    } else {
      GLog.i('nothing happened');
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.foliage', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return '"When life ceases new life always begins to grow... The eternal cycle always remains!"';
  }
}

export class WandOfSlowness extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Slowness';
  }
  protected onZap(cell: number): void {
    const ch = Actor.findChar(cell);
    if (ch) Buff.affect(ch, B.Slow, B.Slow.duration(ch) / 3 + this.power());
    else GLog.i('nothing happened');
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.slowness', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'This wand will cause a creature to move and attack at half its ordinary speed until the effect ends';
  }
}

export class WandOfTeleportation extends Wand {
  constructor() {
    super();
    this.name = 'Wand of Teleportation';
  }
  protected onZap(cell: number): void {
    const ch = Actor.findChar(cell);
    if (ch === this.curUser) {
      this.setKnown();
      lazy<{ teleportHero(h: Hero): void }>('ScrollOfTeleportation').teleportHero(this.curUser);
    } else if (ch) {
      let count = 10;
      let pos: number;
      do {
        pos = Dungeon.level.randomRespawnCell();
        if (count-- <= 0) break;
      } while (pos === -1);
      if (pos === -1) {
        GLog.w('Strong magic aura of this place prevents you from teleporting!');
      } else {
        ch.pos = pos;
        Events.emit({ type: 'place', id: ch.id(), pos });
        GLog.i(`${this.curUser.name} teleported ${ch.name} to somewhere`);
      }
    } else {
      GLog.i('nothing happened');
    }
  }
  protected fx(cell: number): void {
    Fx.bolt('MagicMissile.coldLight', this.curUser.pos, cell);
    Sample.play(Assets.SND_ZAP);
  }
  desc(): string {
    return 'A blast from this wand will teleport a creature against its will to a random place on the current level.';
  }
}

Wand.setClasses([
  WandOfTeleportation,
  WandOfSlowness,
  WandOfFirebolt,
  WandOfPoison,
  WandOfRegrowth,
  WandOfBlink,
  WandOfLightning,
  WandOfAmok,
  WandOfReach,
  WandOfFlock,
  WandOfDisintegration,
  WandOfAvalanche,
]);

for (const [name, cls] of Object.entries({
  WandOfAmok,
  WandOfAvalanche,
  WandOfBlink,
  WandOfDisintegration,
  WandOfFirebolt,
  WandOfFlock,
  WandOfLightning,
  WandOfMagicMissile,
  WandOfPoison,
  WandOfReach,
  WandOfRegrowth,
  WandOfSlowness,
  WandOfTeleportation,
})) {
  registerClass(name, cls);
}
