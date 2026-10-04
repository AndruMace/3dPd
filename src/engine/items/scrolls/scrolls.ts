// Ports of the twelve scrolls in items/scrolls/, plus the Scroll of Wipe Out.
import { Assets } from '../../../content/generated/Assets';
import { ItemSpriteSheet } from '../../../content/generated/ItemSpriteSheet';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import { Buff } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Mob } from '../../actors/mobs/Mob';
import { registerClass } from '../../core/Bundle';
import { Events, GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { distance, LENGTH, NEIGHBOURS8 } from '../../levels/constants';
import { discover, flags, Terrain } from '../../levels/Terrain';
import { observe } from '../../observe';
import type { Armor } from '../armor/Armor';
import { Item } from '../Item';
import type { Weapon } from '../weapon/Weapon';
import { InventoryScroll, Scroll } from './Scroll';

const appear = (ch: Char, pos: number) => lazy<{ appear(ch: Char, pos: number): void }>('WandOfBlink').appear(ch, pos);
const mobs = (): Mob[] => [...Dungeon.level.mobs];

export class ScrollOfIdentify extends InventoryScroll {
  constructor() {
    super();
    this.name = 'Scroll of Identify';
    this.inventoryTitle = 'Select an item to identify';
    this.mode = 'UNIDENTIFED';
  }
  protected onItemSelected(item: Item): void {
    Fx.at('identification', this.curUser.pos);
    item.identify();
    GLog.i(`It is ${item.toString()}`);
    Badges.validateItemLevelAquired(item);
  }
  desc(): string {
    return 'Permanently reveals all of the secrets of a single item.';
  }
  price(): number {
    return this.isKnown() ? 30 * this.quantity : super.price();
  }
}

export class ScrollOfTeleportation extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Teleportation';
  }
  protected doRead(): void {
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    ScrollOfTeleportation.teleportHero(this.curUser);
    this.setKnown();
    this.readAnimation();
  }
  static teleportHero(hero: Hero): void {
    let count = 10;
    let pos: number;
    do {
      pos = Dungeon.level.randomRespawnCell();
      if (count-- <= 0) break;
    } while (pos === -1);
    if (pos === -1) {
      GLog.w('Strong magic aura of this place prevents you from teleporting!');
    } else {
      appear(hero, pos);
      Dungeon.level.press(pos, hero);
      observe();
      GLog.i('In a blink of an eye you were teleported to another location of the level.');
    }
  }
  desc(): string {
    return 'The spell on this parchment instantly transports the reader to a random location on the dungeon level. It can be used to escape a dangerous situation, but the unlucky reader might find himself in an even more dangerous place.';
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class ScrollOfRemoveCurse extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Remove Curse';
  }
  protected doRead(): void {
    const user = this.curUser;
    Fx.flare(user.id(), 0xffffff, 6);
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    let procced = ScrollOfRemoveCurse.uncurse(user, ...user.belongings.backpack.items);
    const b = user.belongings;
    procced = ScrollOfRemoveCurse.uncurse(user, b.weapon, b.armor, b.ring1, b.ring2) || procced;
    Buff.detach(user, B.Weakness);
    if (procced) GLog.p('Your pack glows with a cleansing light, and a malevolent energy disperses.');
    else GLog.i('Your pack glows with a cleansing light, but nothing happens.');
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return "The incantation on this scroll will instantly strip from the reader's weapon, armor, rings and carried items any evil enchantments that might prevent the wearer from removing them.";
  }
  static uncurse(hero: Hero, ...items: (Item | null)[]): boolean {
    let procced = false;
    for (const item of items) {
      if (item && item.cursed) {
        item.cursed = false;
        procced = true;
      }
    }
    if (procced) Fx.start('ShadowParticle.UP', hero.pos, 0.05, 10);
    return procced;
  }
  price(): number {
    return this.isKnown() ? 30 * this.quantity : super.price();
  }
}

export class ScrollOfRecharging extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Recharging';
  }
  protected doRead(): void {
    const count = this.curUser.belongings.charge(true);
    ScrollOfRecharging.charge(this.curUser);
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    if (count > 0) {
      GLog.i(`a surge of energy courses through your pack, recharging your wand${count > 1 ? 's' : ''}`);
      Fx.burst('SpellSprite.CHARGE', { id: this.curUser.id() }, 1);
    } else {
      GLog.i('a surge of energy courses through your pack, but nothing happens');
    }
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return "The raw magical power bound up in this parchment will, when released, recharge all of the reader's wands to full power.";
  }
  static charge(hero: Hero): void {
    Fx.burst('EnergyParticle', { id: hero.id() }, 15);
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class ScrollOfMagicMapping extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Magic Mapping';
  }
  protected doRead(): void {
    const level = Dungeon.level;
    let noticed = false;
    for (let i = 0; i < LENGTH; i++) {
      const terr = level.map[i];
      if (level.discoverable[i]) {
        level.mapped[i] = 1;
        if (flags[terr] & Terrain.SECRET) {
          level.set(i, discover(terr));
          if (Dungeon.visible[i]) {
            Fx.at('discoverTile', i, terr);
            ScrollOfMagicMapping.discover(i);
            noticed = true;
          }
        }
      }
    }
    observe();
    GLog.i('You are now aware of the level layout.');
    if (noticed) Sample.play(Assets.SND_SECRET);
    Fx.burst('SpellSprite.MAP', { id: this.curUser.id() }, 1);
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return 'When this scroll is read, an image of crystal clarity will be etched into your memory, alerting you to the precise layout of the level and revealing all hidden secrets. The locations of items and creatures will remain unknown.';
  }
  price(): number {
    return this.isKnown() ? 25 * this.quantity : super.price();
  }
  static discover(cell: number): void {
    Fx.start('Speck.DISCOVER', cell, 0.1, 4);
  }
}

export class ScrollOfChallenge extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Challenge';
  }
  protected doRead(): void {
    const user = this.curUser;
    for (const mob of mobs()) {
      mob.beckon(user.pos);
      if (Dungeon.visible[mob.pos]) Buff.affect(mob, B.Rage, distance(user.pos, mob.pos));
    }
    for (const heap of [...Dungeon.level.heaps.values()]) {
      if (heap.type === 'MIMIC') {
        const m = lazy<{ spawnAt(pos: number, items: Item[]): Mob | null }>('Mimic').spawnAt(heap.pos, heap.items);
        if (m) {
          m.beckon(user.pos);
          heap.destroy();
        }
      }
    }
    GLog.w('The scroll emits a challenging roar that echoes throughout the dungeon!');
    this.setKnown();
    Fx.start('Speck.SCREAM', user.pos, 0.3, 3);
    Sample.play(Assets.SND_CHALLENGE);
    B.Invisibility.dispel();
    this.readAnimation();
  }
  desc(): string {
    return "When read aloud, this scroll will unleash a challenging roar that will awaken all monsters and alert them to the reader's location.";
  }
}

export class ScrollOfTerror extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Terror';
  }
  protected doRead(): void {
    const user = this.curUser;
    Fx.flare(user.id(), 0xff0000, 5);
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    let count = 0;
    let affected: Mob | null = null;
    for (const mob of mobs()) {
      if (Dungeon.level.fieldOfView[mob.pos]) {
        Buff.affect(mob, B.Terror, B.Terror.DURATION).object = user.id();
        count++;
        affected = mob;
      }
    }
    if (count === 0) GLog.i('The scroll emits a brilliant flash of red light');
    else if (count === 1) GLog.i(`The scroll emits a brilliant flash of red light and the ${affected!.name} flees!`);
    else GLog.i('The scroll emits a brilliant flash of red light and the monsters flee!');
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return 'A flash of red light will overwhelm all creatures in your field of view with terror, and they will turn and flee. Attacking a fleeing enemy will dispel the effect.';
  }
  price(): number {
    return this.isKnown() ? 50 * this.quantity : super.price();
  }
}

export class ScrollOfLullaby extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Lullaby';
  }
  protected doRead(): void {
    Fx.start('Speck.NOTE', this.curUser.pos, 0.3, 5);
    Sample.play(Assets.SND_LULLABY);
    B.Invisibility.dispel();
    let count = 0;
    let affected: Mob | null = null;
    for (const mob of mobs()) {
      if (Dungeon.level.fieldOfView[mob.pos]) {
        Buff.affect(mob, B.Sleep);
        if (mob.buff(B.Sleep) !== null) {
          affected = mob;
          count++;
        }
      }
    }
    if (count === 0) GLog.i('The scroll utters a soothing melody.');
    else if (count === 1) GLog.i(`The scroll utters a soothing melody and the ${affected!.name} falls asleep!`);
    else GLog.i('The scroll utters a soothing melody and the monsters fall asleep!');
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return 'A soothing melody will put all creatures in your field of view into a deep sleep, giving you a chance to flee or make a surprise attack on them.';
  }
  price(): number {
    return this.isKnown() ? 50 * this.quantity : super.price();
  }
}

export class ScrollOfPsionicBlast extends Scroll {
  constructor() {
    super();
    this.name = 'Scroll of Psionic Blast';
  }
  protected doRead(): void {
    Events.emit({ type: 'fx', fx: 'flash', color: 0xffffff });
    Sample.play(Assets.SND_BLAST);
    B.Invisibility.dispel();
    for (const mob of mobs()) {
      if (Dungeon.level.fieldOfView[mob.pos]) {
        Buff.prolong(mob, B.Blindness, Random.Int(3, 6));
        mob.damage(Random.IntRange(1, Math.trunc((mob.HT * 2) / 3)), this);
      }
    }
    Buff.prolong(this.curUser, B.Blindness, Random.Int(3, 6));
    observe();
    this.setKnown();
    this.readAnimation();
  }
  desc(): string {
    return 'This scroll contains destructive energy, that can be psionically channeled to inflict a massive damage to all creatures within a field of view. An accompanying flash of light will temporarily blind everybody in the area of effect including the reader of the scroll.';
  }
  price(): number {
    return this.isKnown() ? 80 * this.quantity : super.price();
  }
}

export class ScrollOfMirrorImage extends Scroll {
  private static readonly NIMAGES = 3;
  constructor() {
    super();
    this.name = 'Scroll of Mirror Image';
  }
  protected doRead(): void {
    const user = this.curUser;
    const level = Dungeon.level;
    const respawnPoints: number[] = [];
    for (const n of NEIGHBOURS8) {
      const p = user.pos + n;
      if (Actor.findChar(p) === null && (level.passable[p] || level.avoid[p])) respawnPoints.push(p);
    }
    let nImages = ScrollOfMirrorImage.NIMAGES;
    const MirrorImage = lazy<new () => Mob & { duplicate(h: Hero): void }>('MirrorImage');
    while (nImages > 0 && respawnPoints.length > 0) {
      const index = Random.index(respawnPoints);
      const mob = new MirrorImage();
      mob.duplicate(user);
      level.addMob(mob);
      appear(mob, respawnPoints[index]);
      respawnPoints.splice(index, 1);
      nImages--;
    }
    if (nImages < ScrollOfMirrorImage.NIMAGES) this.setKnown();
    Sample.play(Assets.SND_READ);
    B.Invisibility.dispel();
    this.readAnimation();
  }
  desc(): string {
    return 'The incantation on this scroll will create illusionary twins of the reader, which will chase his enemies.';
  }
}

export class ScrollOfUpgrade extends InventoryScroll {
  constructor() {
    super();
    this.name = 'Scroll of Upgrade';
    this.inventoryTitle = 'Select an item to upgrade';
    this.mode = 'UPGRADEABLE';
  }
  protected onItemSelected(item: Item): void {
    ScrollOfRemoveCurse.uncurse(Dungeon.hero, item);
    if (item.isBroken()) item.fix();
    else item.upgrade();
    ScrollOfUpgrade.upgrade(this.curUser);
    GLog.p(`your ${item.name_()} certainly looks better now`);
    Badges.validateItemLevelAquired(item);
  }
  static upgrade(hero: Hero): void {
    Fx.start('Speck.UP', hero.pos, 0.2, 3);
  }
  desc(): string {
    return 'This scroll will upgrade a single item, improving its quality. A wand will increase in power and in number of charges; a weapon will inflict more damage or find its mark more frequently; a suit of armor will deflect additional blows; the effect of a ring on its wearer will intensify. Weapons and armor will also require less strength to use, and any curses on the item will be lifted.';
  }
}

export class ScrollOfEnchantment extends InventoryScroll {
  constructor() {
    super();
    this.name = 'Scroll of Enchantment';
    this.inventoryTitle = 'Select an enchantable item';
    this.mode = 'ENCHANTABLE';
  }
  protected onItemSelected(item: Item): void {
    ScrollOfRemoveCurse.uncurse(Dungeon.hero, item);
    const Weapon = lazy<abstract new () => Weapon>('Weapon');
    if (item instanceof Weapon) item.enchant();
    else (item as Armor).inscribe();
    item.fix();
    Fx.start('Speck.LIGHT', this.curUser.pos, 0.1, 5);
    Events.emit({ type: 'fx', fx: 'enchanting', id: this.curUser.id(), v: item.imageIndex() });
    GLog.w(`your ${item.name_()} glows in the dark`);
  }
  desc(): string {
    return 'This scroll is able to imbue a weapon or an armor with a random enchantment, granting it a special power.';
  }
}

export class ScrollOfWipeOut extends Item {
  static readonly AC_READ = 'READ';
  private static readonly TIME_TO_READ = 1;

  constructor() {
    super();
    this.name = 'Scroll of Wipe Out';
    this.image = ItemSpriteSheet.SCROLL_WIPE_OUT;
    this.stackable = true;
    this.defaultAction = ScrollOfWipeOut.AC_READ;
  }
  actions(hero: Hero): string[] {
    return [...super.actions(hero), ScrollOfWipeOut.AC_READ];
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== ScrollOfWipeOut.AC_READ) {
      super.execute(hero, action);
      return;
    }
    if (hero.buff(B.Blindness) !== null) {
      GLog.w("You can't read a scroll while blinded");
      return;
    }
    this.detach(hero.belongings.backpack);
    Events.emit({ type: 'fx', fx: 'flash', color: 0xff6644 });
    B.Invisibility.dispel();
    const isBoss = lazy<{ isBoss(m: Char): boolean }>('Bestiary').isBoss;
    for (const mob of mobs()) {
      if (!isBoss(mob)) {
        Sample.play(Assets.SND_CURSED);
        mob.die(this);
      }
    }
    for (const heap of Dungeon.level.heaps.values()) {
      if (heap.type === 'FOR_SALE') {
        heap.type = 'HEAP';
        if (Dungeon.visible[heap.pos]) Fx.burst('Speck.COIN', { pos: heap.pos }, 2);
        heap.refresh();
      } else if (heap.type === 'MIMIC') {
        heap.type = 'HEAP';
        heap.refresh();
        Sample.play(Assets.SND_CURSED);
      }
    }
    hero.spend(ScrollOfWipeOut.TIME_TO_READ);
    hero.busy();
    Events.emit({ type: 'anim', id: hero.id(), anim: 'read' });
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  desc(): string {
    return 'Read this scroll to unleash the wrath of the dungeon spirits, killing everything on the current level. Well, almost everything. Some of the more powerful creatures may be not affected.';
  }
  price(): number {
    return 100 * this.quantity;
  }
}

Scroll.setClasses([
  ScrollOfIdentify,
  ScrollOfMagicMapping,
  ScrollOfRecharging,
  ScrollOfRemoveCurse,
  ScrollOfTeleportation,
  ScrollOfChallenge,
  ScrollOfTerror,
  ScrollOfLullaby,
  ScrollOfPsionicBlast,
  ScrollOfMirrorImage,
  ScrollOfUpgrade,
  ScrollOfEnchantment,
]);

for (const [name, cls] of Object.entries({
  ScrollOfIdentify,
  ScrollOfTeleportation,
  ScrollOfRemoveCurse,
  ScrollOfRecharging,
  ScrollOfMagicMapping,
  ScrollOfChallenge,
  ScrollOfTerror,
  ScrollOfLullaby,
  ScrollOfPsionicBlast,
  ScrollOfMirrorImage,
  ScrollOfUpgrade,
  ScrollOfEnchantment,
  ScrollOfWipeOut,
})) {
  registerClass(name, cls);
}
