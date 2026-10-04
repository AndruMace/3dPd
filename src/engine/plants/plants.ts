// Ports of plants/: the Plant and Plant.Seed bases and the eight plants with their seeds.
import { Assets } from '../../content/generated/Assets';
import { ItemSpriteSheet } from '../../content/generated/ItemSpriteSheet';
import { Dungeon } from '../Dungeon';
import { TICK } from '../actors/Actor';
import { Blob } from '../actors/blobs/Blob';
import { ConfusionGas, Fire, freezeCell, ToxicGas } from '../actors/blobs/blobs';
import { Buff, BuffIndicator } from '../actors/buffs/Buff';
import { Barkskin, Poison, Roots } from '../actors/buffs/buffs';
import type { Char } from '../actors/Char';
import { indefinite } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import type { Bundlable, Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { lazy } from '../core/lazy';
import { Random } from '../core/Random';
import type { Bag } from '../items/bags';
import { Item } from '../items/Item';
import { LENGTH } from '../levels/constants';
import { Terrain } from '../levels/Terrain';
import { PathFinder } from '../mechanics/PathFinder';

export abstract class Plant implements Bundlable {
  plantName = '';
  /** Index into plants.png. */
  image = 0;
  pos = 0;

  activate(ch: Char | null): void {
    if (ch !== null && ch === Dungeon.hero && Dungeon.hero.subClass === 'WARDEN') {
      Buff.affect(ch, Barkskin).setLevel(Math.trunc(ch.HT / 3));
    }
    this.wither();
  }

  wither(): void {
    Dungeon.level.uproot(this.pos);
    if (Dungeon.visible[this.pos]) Fx.burst('LeafParticle.GENERAL', { pos: this.pos }, 6);
    if (Dungeon.hero.subClass === 'WARDEN') {
      if (Random.Int(5) === 0) {
        Dungeon.level.drop(lazy<{ random(cat: string): Item }>('Generator').random('SEED'), this.pos).dropFX(this.pos);
      }
      if (Random.Int(5) === 0) Dungeon.level.drop(new (lazy<new () => Item>('Dewdrop'))(), this.pos).dropFX(this.pos);
    }
  }

  restoreFromBundle(bundle: Bundle): void {
    this.pos = bundle.getInt('pos');
  }

  storeInBundle(bundle: Bundle): void {
    bundle.put('pos', this.pos);
  }

  desc(): string | null {
    return null;
  }
}

export abstract class Seed extends Item {
  static readonly AC_PLANT = 'PLANT';
  private static readonly TIME_TO_PLANT = 1;

  protected plantClass!: new () => Plant;
  protected plantName = '';
  alchemyClass: (new () => Item) | null = null;

  constructor() {
    super();
    this.stackable = true;
    this.defaultAction = Item.AC_THROW;
  }

  categoryOrder(): number {
    return 6;
  }

  actions(hero: Hero): string[] {
    return [...super.actions(hero), Seed.AC_PLANT];
  }

  protected onThrow(cell: number): void {
    if (Dungeon.level.map[cell] === Terrain.ALCHEMY || Dungeon.level.pit[cell]) super.onThrow(cell);
    else Dungeon.level.plant(this, cell);
  }

  execute(hero: Hero, action: string | null = this.defaultAction): void {
    if (action === Seed.AC_PLANT) {
      hero.spend(Seed.TIME_TO_PLANT);
      hero.busy();
      (this.detach(hero.belongings.backpack) as Seed).onThrow(hero.pos);
      Events.emit({ type: 'anim', id: hero.id(), anim: 'operate', target: hero.pos });
    } else {
      super.execute(hero, action);
    }
  }

  couch(pos: number): Plant {
    if (Dungeon.visible[pos]) Sample.play(Assets.SND_PLANT);
    const plant = new this.plantClass();
    plant.pos = pos;
    return plant;
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
    return `Throw this seed to the place where you want to grow ${indefinite(this.plantName)}.\n\n${this.desc()}`;
  }
}

/** Defines a plant and its seed (a static inner class in PD). */
function plant(plantName: string, image: number, seedImage: number, desc: string, alchemy: () => new () => Item) {
  abstract class P extends Plant {
    constructor() {
      super();
      this.image = image;
      this.plantName = plantName;
    }
    desc(): string {
      return desc;
    }
  }
  abstract class S extends Seed {
    constructor() {
      super();
      this.plantName = plantName;
      this.name = `seed of ${plantName}`;
      this.image = seedImage;
      this.alchemyClass = alchemy();
    }
    desc(): string {
      return desc;
    }
  }
  return { P, S };
}

const potion = (name: string) => () => lazy<new () => Item>(name);

const firebloom = plant(
  'Firebloom',
  0,
  ItemSpriteSheet.SEED_FIREBLOOM,
  'When something touches a Firebloom, it bursts into flames.',
  potion('PotionOfLiquidFlame'),
);
export class Firebloom extends firebloom.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    Dungeon.level.addBlob(Blob.seed(this.pos, 2, Fire));
    if (Dungeon.visible[this.pos]) Fx.burst('FlameParticle', { pos: this.pos }, 5);
  }
}
export class FirebloomSeed extends firebloom.S {
  protected plantClass = Firebloom;
}

const icecap = plant(
  'Icecap',
  1,
  ItemSpriteSheet.SEED_ICECAP,
  'Upon touching an Icecap excretes a pollen, which freezes everything in its vicinity.',
  potion('PotionOfFrost'),
);
export class Icecap extends icecap.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    const notBlocking = Dungeon.level.losBlocking.map((v) => (v ? 0 : 1));
    PathFinder.buildDistanceMap(this.pos, notBlocking, 1);
    const fire = (Dungeon.level.blobs.get('Fire') as Fire | undefined) ?? null;
    for (let i = 0; i < LENGTH; i++) if (PathFinder.distance[i] < PathFinder.INFINITY) freezeCell(i, fire);
    fire?.notifyView();
  }
}
export class IcecapSeed extends icecap.S {
  protected plantClass = Icecap;
}

const sorrowmoss = plant(
  'Sorrowmoss',
  2,
  ItemSpriteSheet.SEED_SORROWMOSS,
  'A Sorrowmoss is a flower (not a moss) with razor-sharp petals, coated with a deadly venom.',
  potion('PotionOfToxicGas'),
);
export class Sorrowmoss extends sorrowmoss.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    if (ch !== null) Buff.affect(ch, Poison).set(Poison.durationFactor(ch) * (4 + Math.trunc(Dungeon.depth / 2)));
    if (Dungeon.visible[this.pos]) Fx.burst('PoisonParticle.SPLASH', { pos: this.pos }, 3);
  }
}
export class SorrowmossSeed extends sorrowmoss.S {
  protected plantClass = Sorrowmoss;
}

const dreamweed = plant(
  'Dreamweed',
  3,
  ItemSpriteSheet.SEED_DREAMWEED,
  'Upon touching a Dreamweed it secretes a glittering cloud of confusing gas.',
  potion('PotionOfInvisibility'),
);
export class Dreamweed extends dreamweed.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    if (ch !== null) Dungeon.level.addBlob(Blob.seed(this.pos, 400, ConfusionGas));
  }
}
export class DreamweedSeed extends dreamweed.S {
  protected plantClass = Dreamweed;
}

const sungrass = plant(
  'Sungrass',
  4,
  ItemSpriteSheet.SEED_SUNGRASS,
  "Sungrass is renowned for its sap's healing properties.",
  potion('PotionOfHealing'),
);
export class Sungrass extends sungrass.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    if (ch !== null) Buff.affect(ch, SungrassHealth);
    if (Dungeon.visible[this.pos]) Fx.start('ShaftParticle', this.pos, 0.2, 3);
  }
}
export class SungrassSeed extends sungrass.S {
  protected plantClass = Sungrass;
}

/** Sungrass.Health: heals while standing still. */
export class SungrassHealth extends Buff {
  private static readonly STEP = 5;
  private pos = 0;

  attachTo(target: Char): boolean {
    this.pos = target.pos;
    return super.attachTo(target);
  }

  protected act(): boolean {
    const t = this.target;
    if (t.pos !== this.pos || t.HP >= t.HT) {
      this.detach();
    } else {
      t.heal(Math.trunc(t.HT / 10));
      Fx.burst('Speck.HEALING', { id: t.id() }, 1);
    }
    this.spend(SungrassHealth.STEP);
    return true;
  }

  icon(): number {
    return BuffIndicator.HEALING;
  }

  toString(): string {
    return 'Herbal healing';
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('pos', this.pos);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.pos = bundle.getInt('pos');
  }
}

const earthroot = plant(
  'Earthroot',
  5,
  ItemSpriteSheet.SEED_EARTHROOT,
  'When a creature touches an Earthroot, its roots create a kind of natural armor around it.',
  potion('PotionOfParalyticGas'),
);
export class Earthroot extends earthroot.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    if (ch !== null) Buff.affect(ch, EarthrootArmor).levelValue = ch.HT;
    if (Dungeon.visible[this.pos]) {
      Fx.start('EarthParticle', this.pos, 0.05, 8);
      Fx.shake(1, 0.4);
    }
  }
}
export class EarthrootSeed extends earthroot.S {
  protected plantClass = Earthroot;
}

/** Earthroot.Armor: absorbs damage while standing still. */
export class EarthrootArmor extends Buff {
  private static readonly STEP = 1;
  private pos = 0;
  levelValue = 0;

  attachTo(target: Char): boolean {
    this.pos = target.pos;
    return super.attachTo(target);
  }

  protected act(): boolean {
    if (this.target.pos !== this.pos) this.detach();
    this.spend(EarthrootArmor.STEP);
    return true;
  }

  absorb(damage: number): number {
    if (damage >= this.levelValue) {
      this.detach();
      return damage - this.levelValue;
    }
    this.levelValue -= damage;
    return 0;
  }

  level(value: number): void {
    if (this.levelValue < value) this.levelValue = value;
  }

  icon(): number {
    return BuffIndicator.ARMOR;
  }

  toString(): string {
    return 'Herbal armor';
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('pos', this.pos);
    bundle.put('level', this.levelValue);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.pos = bundle.getInt('pos');
    this.levelValue = bundle.getInt('level');
  }
}

const fadeleaf = plant(
  'Fadeleaf',
  6,
  ItemSpriteSheet.SEED_FADELEAF,
  'Touching a Fadeleaf will teleport any creature to a random place on the current level.',
  potion('PotionOfMindVision'),
);
export class Fadeleaf extends fadeleaf.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    if (ch !== null && ch === Dungeon.hero) {
      lazy<{ teleportHero(h: Hero): void }>('ScrollOfTeleportation').teleportHero(Dungeon.hero);
      Dungeon.hero.curAction = null;
    } else if (ch !== null) {
      let count = 10;
      let newPos: number;
      do {
        newPos = Dungeon.level.randomRespawnCell();
        if (count-- <= 0) break;
      } while (newPos === -1);
      if (newPos !== -1) {
        ch.pos = newPos;
        Events.emit({ type: 'place', id: ch.id(), pos: newPos });
      }
    }
    if (Dungeon.visible[this.pos]) Fx.start('Speck.LIGHT', this.pos, 0.2, 3);
  }
}
export class FadeleafSeed extends fadeleaf.S {
  protected plantClass = Fadeleaf;
}

const rotberry = plant(
  'Rotberry',
  7,
  ItemSpriteSheet.SEED_ROTBERRY,
  'Berries of this shrub taste like sweet, sweet death.',
  potion('PotionOfStrength'),
);
export class Rotberry extends rotberry.P {
  activate(ch: Char | null): void {
    super.activate(ch);
    Dungeon.level.addBlob(Blob.seed(this.pos, 100, ToxicGas));
    Dungeon.level.drop(new RotberrySeed(), this.pos).dropFX(this.pos);
    if (ch !== null) Buff.prolong(ch, Roots, TICK * 3);
  }
}
export class RotberrySeed extends rotberry.S {
  protected plantClass = Rotberry;

  collect(container?: Bag): boolean {
    if (super.collect(container)) {
      if (Dungeon.level) {
        for (const mob of Dungeon.level.mobs) mob.beckon(Dungeon.hero.pos);
        GLog.w('The seed emits a roar that echoes throughout the dungeon!');
        Fx.start('Speck.SCREAM', Dungeon.hero.pos, 0.3, 3);
        Sample.play(Assets.SND_CHALLENGE);
      }
      return true;
    }
    return false;
  }
}

registerClass('Plant', Plant);
registerClass('Plant.Seed', Seed);
for (const [name, cls] of Object.entries({
  Firebloom,
  Icecap,
  Sorrowmoss,
  Dreamweed,
  Sungrass,
  Earthroot,
  Fadeleaf,
  Rotberry,
})) {
  registerClass(name, cls);
}
for (const [name, cls] of Object.entries({
  Firebloom: FirebloomSeed,
  Icecap: IcecapSeed,
  Sorrowmoss: SorrowmossSeed,
  Dreamweed: DreamweedSeed,
  Sungrass: SungrassSeed,
  Earthroot: EarthrootSeed,
  Fadeleaf: FadeleafSeed,
  Rotberry: RotberrySeed,
})) {
  registerClass(`${name}.Seed`, cls);
}
registerClass('Sungrass.Health', SungrassHealth);
registerClass('Earthroot.Armor', EarthrootArmor);
