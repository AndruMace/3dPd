// Ports of the miscellaneous items: Gold, Dewdrop, DewVial, Ankh, Torch, Amulet, Weightstone, Bomb, Honeypot
// and the sewer quest items (DriedRose, RatSkull).
import { Assets } from '../../content/generated/Assets';
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Badges } from '../Badges';
import { Dungeon, ResultDescriptions, Statistics } from '../Dungeon';
import { Actor } from '../actors/Actor';
import { Buff } from '../actors/buffs/Buff';
import { Light, Paralysis } from '../actors/buffs/buffs';
import type { Char } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import type { Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { lazy } from '../core/lazy';
import { Random } from '../core/Random';
import { UI } from '../core/ui';
import { LENGTH, NEIGHBOURS4, NEIGHBOURS8, NEIGHBOURS9 } from '../levels/constants';
import { observe } from '../observe';
import { Item, type Glowing } from './Item';
import type { Weapon } from './weapon/Weapon';

export class Gold extends Item {
  constructor(value = 1) {
    super();
    this.name = 'gold';
    this.image = ItemSpriteSheet.GOLD;
    this.stackable = true;
    this.quantity = value;
  }

  categoryOrder(): number {
    return 8;
  }

  actions(): string[] {
    return [];
  }

  doPickUp(hero: Hero): boolean {
    Dungeon.gold += this.quantity;
    Statistics.goldCollected += this.quantity;
    Badges.validateGoldCollected();
    Events.emit({ type: 'pickUp', image: this.imageIndex() });
    hero.showStatus('neutral', `+${this.quantity}`);
    hero.spendAndNext(Item.TIME_TO_PICK_UP);
    Sample.play(Assets.SND_GOLD);
    return true;
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  info(): string {
    const collect = 'Collect gold coins to spend them later in a shop.';
    switch (this.quantity) {
      case 0:
        return collect;
      case 1:
        return 'One gold coin. ' + collect;
      default:
        return `A pile of ${this.quantity} gold coins. ` + collect;
    }
  }

  random(): Item {
    this.quantity = Random.Int(20 + Dungeon.depth * 10, 40 + Dungeon.depth * 20);
    return this;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('value', this.quantity);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.quantity = bundle.getInt('value');
  }
}

export class Dewdrop extends Item {
  constructor() {
    super();
    this.name = 'dewdrop';
    this.image = ItemSpriteSheet.DEWDROP;
    this.stackable = true;
  }

  doPickUp(hero: Hero): boolean {
    const vial = hero.belongings.getItem(DewVial);
    if (hero.HP < hero.HT || vial === null || vial.isFull()) {
      let value = 1 + Math.trunc((Dungeon.depth - 1) / 5);
      if (hero.heroClass === 'HUNTRESS') value++;
      const effect = Math.min(hero.HT - hero.HP, value * this.quantity);
      if (effect > 0) {
        hero.heal(effect);
        Fx.burst('Speck.HEALING', { id: hero.id() }, 1);
        hero.showStatus('positive', `+${effect}HP`);
      }
    } else {
      vial.collectDew(this);
    }
    Sample.play(Assets.SND_DEWDROP);
    hero.spendAndNext(Item.TIME_TO_PICK_UP);
    return true;
  }

  info(): string {
    return 'A crystal clear dewdrop.';
  }
}

export class DewVial extends Item {
  private static readonly MAX_VOLUME = 10;
  static readonly AC_DRINK = 'DRINK';
  private static readonly TIME_TO_DRINK = 1;
  private static readonly NUM = 20;
  private static readonly POW = Math.log10(DewVial.NUM);

  private volume = 0;

  constructor() {
    super();
    this.name = 'dew vial';
    this.image = ItemSpriteSheet.VIAL;
    this.defaultAction = DewVial.AC_DRINK;
    this.unique = true;
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('volume', this.volume);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.volume = bundle.getInt('volume');
  }

  actions(hero: Hero): string[] {
    const actions = super.actions(hero);
    if (this.volume > 0) actions.push(DewVial.AC_DRINK);
    return actions;
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== DewVial.AC_DRINK) {
      super.execute(hero, action);
      return;
    }
    if (this.volume > 0) {
      const value = Math.ceil((Math.pow(this.volume, DewVial.POW) / DewVial.NUM) * hero.HT);
      const effect = Math.min(hero.HT - hero.HP, value);
      if (effect > 0) {
        hero.heal(effect);
        Fx.burst('Speck.HEALING', { id: hero.id() }, this.volume > 5 ? 2 : 1);
        hero.showStatus('positive', `+${effect}HP`);
      }
      this.volume = 0;
      hero.spend(DewVial.TIME_TO_DRINK);
      hero.busy();
      Sample.play(Assets.SND_DRINK);
      Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
    } else {
      GLog.w('Your dew vial is empty!');
    }
  }

  isUpgradable(): boolean {
    return false;
  }

  isIdentified(): boolean {
    return true;
  }

  isFull(): boolean {
    return this.volume >= DewVial.MAX_VOLUME;
  }

  collectDew(dew: Dewdrop): void {
    GLog.i('You collected a dewdrop into your dew vial.');
    this.volume += dew.quantity;
    if (this.volume >= DewVial.MAX_VOLUME) {
      this.volume = DewVial.MAX_VOLUME;
      GLog.p('Your dew vial is full!');
    }
  }

  fill(): void {
    this.volume = DewVial.MAX_VOLUME;
  }

  static autoDrink(hero: Hero): void {
    const vial = hero.belongings.getItem(DewVial);
    if (vial !== null && vial.isFull()) {
      vial.execute(hero);
      Fx.start('ShaftParticle', hero.pos, 0.2, 3);
      GLog.w('The dew vial was emptied to heal your wounds.');
    }
  }

  glowing(): Glowing {
    return this.isFull() ? 0xffffcc : null;
  }

  status(): string {
    return `${this.volume}/${DewVial.MAX_VOLUME}`;
  }

  info(): string {
    return 'You can store excess dew in this tiny vessel for drinking it later. If the vial is full, in a moment of deadly peril the dew will be consumed automatically.';
  }

  toString(): string {
    return `${super.toString()} (${this.status()})`;
  }
}

export class Ankh extends Item {
  constructor() {
    super();
    this.stackable = true;
    this.name = 'Ankh';
    this.image = ItemSpriteSheet.ANKH;
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  info(): string {
    return 'The ancient symbol of immortality grants an ability to return to life after death. Upon resurrection all non-equipped items are lost.';
  }
  price(): number {
    return 50 * this.quantity;
  }
}

export class Torch extends Item {
  static readonly AC_LIGHT = 'LIGHT';
  static readonly TIME_TO_LIGHT = 1;

  constructor() {
    super();
    this.name = 'torch';
    this.image = ItemSpriteSheet.TORCH;
    this.stackable = true;
    this.defaultAction = Torch.AC_LIGHT;
  }
  actions(hero: Hero): string[] {
    return [...super.actions(hero), Torch.AC_LIGHT];
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Torch.AC_LIGHT) {
      hero.spend(Torch.TIME_TO_LIGHT);
      hero.busy();
      Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
      this.detach(hero.belongings.backpack);
      Buff.affect(hero, Light, Light.DURATION);
      Fx.start('FlameParticle', hero.pos, 0.2, 3);
    } else {
      super.execute(hero, action);
    }
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  price(): number {
    return 10 * this.quantity;
  }
  info(): string {
    return "It's an indispensable item in The Demon Halls, which are notorious for their poor ambient lighting.";
  }
}

export class Amulet extends Item {
  static readonly AC_END = 'END THE GAME';

  constructor() {
    super();
    this.name = 'Amulet of Yendor';
    this.image = ItemSpriteSheet.AMULET;
    this.unique = true;
  }
  actions(hero: Hero): string[] {
    return [...super.actions(hero), Amulet.AC_END];
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Amulet.AC_END) Events.emit({ type: 'fx', fx: 'amuletScene', n: 0 });
    else super.execute(hero, action);
  }
  doPickUp(hero: Hero): boolean {
    if (super.doPickUp(hero)) {
      if (!Statistics.amuletObtained) {
        Statistics.amuletObtained = true;
        Badges.validateVictory();
        Events.emit({ type: 'fx', fx: 'amuletScene', n: 1 });
      }
      return true;
    }
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  isUpgradable(): boolean {
    return false;
  }
  info(): string {
    return 'The Amulet of Yendor is the most powerful known artifact of unknown origin. It is said that the amulet is able to fulfil any wish if its owner\'s will-power is strong enough to "persuade" it to do it.';
  }
}

export class Weightstone extends Item {
  private static readonly TIME_TO_APPLY = 2;
  private static readonly AC_APPLY = 'APPLY';

  constructor() {
    super();
    this.name = 'weightstone';
    this.image = ItemSpriteSheet.WEIGHT;
    this.stackable = true;
  }
  actions(hero: Hero): string[] {
    return [...super.actions(hero), Weightstone.AC_APPLY];
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action !== Weightstone.AC_APPLY) {
      super.execute(hero, action);
      return;
    }
    UI.selectItem('WEAPON', 'Select a weapon to balance', (item) => {
      if (item === null) return;
      const weapon = item as Weapon;
      const options: string[] = [];
      const choices: (boolean | null)[] = [];
      if (weapon.imbue !== 'SPEED') {
        options.push('For speed');
        choices.push(true);
      }
      if (weapon.imbue !== 'ACCURACY') {
        options.push('For accuracy');
        choices.push(false);
      }
      options.push('Never mind');
      choices.push(null);
      UI.options(weapon.name_(), `How would you like to balance your ${weapon.name_()}?`, options, (i) => {
        const forSpeed = choices[i];
        if (forSpeed !== null && forSpeed !== undefined) this.apply(hero, weapon, forSpeed);
      });
    });
  }
  private apply(hero: Hero, weapon: Weapon, forSpeed: boolean): void {
    this.detach(hero.belongings.backpack);
    weapon.fix();
    if (forSpeed) {
      weapon.imbue = 'SPEED';
      GLog.p(`you balanced your ${weapon.name_()} to make it faster`);
    } else {
      weapon.imbue = 'ACCURACY';
      GLog.p(`you balanced your ${weapon.name_()} to make it more accurate`);
    }
    Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
    Sample.play(Assets.SND_MISS);
    hero.spend(Weightstone.TIME_TO_APPLY);
    hero.busy();
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  price(): number {
    return 40 * this.quantity;
  }
  info(): string {
    return 'Using a weightstone, you can balance your melee weapon to increase its speed or accuracy.';
  }
}

export class Bomb extends Item {
  constructor() {
    super();
    this.name = 'bomb';
    this.image = ItemSpriteSheet.BOMB;
    this.defaultAction = Item.AC_THROW;
    this.stackable = true;
  }
  protected onThrow(cell: number): void {
    const level = Dungeon.level;
    if (level.pit[cell]) {
      super.onThrow(cell);
      return;
    }
    Sample.play(Assets.SND_BLAST, cell);
    if (Dungeon.visible[cell]) Fx.burst('BlastParticle', { pos: cell }, 30);
    let terrainAffected = false;
    for (const n of NEIGHBOURS9) {
      const c = cell + n;
      if (c < 0 || c >= LENGTH) continue;
      if (Dungeon.visible[c]) Fx.burst('SmokeParticle', { pos: c }, 4);
      if (level.flamable[c]) {
        level.destroy(c);
        terrainAffected = true;
      }
      const ch = Actor.findChar(c);
      if (ch) {
        const dmg = Random.Int(1 + Dungeon.depth, 10 + Dungeon.depth * 2) - Random.Int(ch.dr());
        if (dmg > 0) {
          ch.damage(dmg, this);
          if (ch.isAlive()) {
            Buff.prolong(ch, Paralysis, 2);
          } else if (ch === Dungeon.hero) {
            Dungeon.fail(ResultDescriptions.BOMB(Dungeon.depth));
            GLog.n('You killed yourself with a bomb...');
          }
        }
      }
    }
    if (terrainAffected) observe();
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  random(): Item {
    this.quantity = Random.IntRange(1, 3);
    return this;
  }
  price(): number {
    return 10 * this.quantity;
  }
  info(): string {
    return 'This is a relatively small bomb, filled with black powder. Conveniently, its fuse is lit automatically when the bomb is thrown.';
  }
}

export class Honeypot extends Item {
  static readonly AC_SHATTER = 'SHATTER';

  constructor() {
    super();
    this.name = 'honeypot';
    this.image = ItemSpriteSheet.HONEYPOT;
    this.defaultAction = Item.AC_THROW;
    this.stackable = true;
  }
  actions(hero: Hero): string[] {
    return [...super.actions(hero), Honeypot.AC_SHATTER];
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Honeypot.AC_SHATTER) {
      Events.emit({ type: 'anim', id: hero.id(), anim: 'zap', target: hero.pos });
      this.shatter(hero.pos);
      this.detach(hero.belongings.backpack);
      hero.spendAndNext(Item.TIME_TO_THROW);
    } else {
      super.execute(hero, action);
    }
  }
  protected onThrow(cell: number): void {
    if (Dungeon.level.pit[cell]) super.onThrow(cell);
    else this.shatter(cell);
  }
  private shatter(pos: number): void {
    Sample.play(Assets.SND_SHATTER);
    if (Dungeon.visible[pos]) Fx.splash(pos, 0xffd500, 5);
    let newPos = pos;
    if (Actor.findChar(pos) !== null) {
      const candidates: number[] = [];
      for (const n of NEIGHBOURS4) {
        const c = pos + n;
        if (Dungeon.level.passable[c] && Actor.findChar(c) === null) candidates.push(c);
      }
      newPos = candidates.length > 0 ? Random.element(candidates)! : -1;
    }
    if (newPos !== -1) {
      const Bee = lazy<new () => Char & { spawn(depth: number): void }>('Bee');
      const bee = new Bee();
      bee.spawn(Dungeon.depth);
      bee.HP = bee.HT;
      bee.pos = newPos;
      Dungeon.level.addMob(bee as never);
      Events.emit({ type: 'fx', fx: 'pushing', id: bee.id(), pos, to: newPos });
      Sample.play(Assets.SND_BEE);
    }
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  price(): number {
    return 50 * this.quantity;
  }
  info(): string {
    return "There is not much honey in this small honeypot, but there is a golden bee there and it doesn't want to leave it.";
  }
}

export class LloydsBeacon extends Item {
  static readonly TIME_TO_USE = 1;
  static readonly AC_SET = 'SET';
  static readonly AC_RETURN = 'RETURN';
  private returnDepth = -1;
  private returnPos = 0;

  constructor() {
    super();
    this.name = "lloyd's beacon";
    this.image = ItemSpriteSheet.BEACON;
    this.unique = true;
  }
  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('depth', this.returnDepth);
    if (this.returnDepth !== -1) bundle.put('pos', this.returnPos);
  }
  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.returnDepth = bundle.getInt('depth');
    this.returnPos = bundle.getInt('pos');
  }
  actions(hero: Hero): string[] {
    const actions = [...super.actions(hero), LloydsBeacon.AC_SET];
    if (this.returnDepth !== -1) actions.push(LloydsBeacon.AC_RETURN);
    return actions;
  }
  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === LloydsBeacon.AC_SET || action === LloydsBeacon.AC_RETURN) {
      if (Dungeon.bossLevel()) {
        hero.spend(LloydsBeacon.TIME_TO_USE);
        GLog.w("Strong magic aura of this place prevents you from using the lloyd's beacon!");
        return;
      }
      for (const n of NEIGHBOURS8) {
        if (Actor.findChar(hero.pos + n) !== null) {
          GLog.w("Psychic aura of neighbouring creatures doesn't allow you to use the lloyd's beacon at this moment.");
          return;
        }
      }
    }
    if (action === LloydsBeacon.AC_SET) {
      this.returnDepth = Dungeon.depth;
      this.returnPos = hero.pos;
      hero.spend(LloydsBeacon.TIME_TO_USE);
      hero.busy();
      Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
      Sample.play(Assets.SND_BEACON);
      GLog.i("The lloyd's beacon is successfully set at your current location, now you can return here anytime.");
    } else if (action === LloydsBeacon.AC_RETURN) {
      if (this.returnDepth === Dungeon.depth) {
        this.reset();
        lazy<{ appear(ch: Char, pos: number): void }>('WandOfBlink').appear(hero, this.returnPos);
        Dungeon.level.press(this.returnPos, hero);
        observe();
      } else {
        hero.pendingTransition = { mode: 'return', depth: this.returnDepth, pos: this.returnPos };
        this.reset();
      }
    } else {
      super.execute(hero, action);
    }
  }
  reset(): void {
    this.returnDepth = -1;
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  glowing(): Glowing {
    return this.returnDepth !== -1 ? 0xffffff : null;
  }
  info(): string {
    return (
      "Lloyd's beacon is an intricate magic device, that allows you to return to a place you have already been." +
      (this.returnDepth === -1
        ? ''
        : `\n\nThis beacon was set somewhere on the level ${this.returnDepth} of Pixel Dungeon.`)
    );
  }
}

export class DriedRose extends Item {
  constructor() {
    super();
    this.name = 'dried rose';
    this.image = ItemSpriteSheet.ROSE;
    this.unique = true;
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  info(): string {
    return 'The rose has dried long ago, but it has kept all its petals somehow.';
  }
}

export class RatSkull extends Item {
  constructor() {
    super();
    this.name = 'giant rat skull';
    this.image = ItemSpriteSheet.SKULL;
    this.unique = true;
  }
  isUpgradable(): boolean {
    return false;
  }
  isIdentified(): boolean {
    return true;
  }
  info(): string {
    return 'It could be a nice hunting trophy, but it smells too bad to place it on a wall.';
  }
  price(): number {
    return 100;
  }
}

for (const [name, cls] of Object.entries({
  Gold,
  Dewdrop,
  DewVial,
  Ankh,
  Torch,
  Amulet,
  Weightstone,
  Bomb,
  Honeypot,
  LloydsBeacon,
  DriedRose,
  RatSkull,
})) {
  registerClass(name, cls);
}
