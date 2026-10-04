// Ports of the twelve potions in items/potions/.
import { Assets } from '../../../content/generated/Assets';
import { Badges } from '../../Badges';
import { Dungeon } from '../../Dungeon';
import { Blob, type BlobClass } from '../../actors/blobs/Blob';
import { Fire, freezeCell, ParalyticGas, ToxicGas } from '../../actors/blobs/blobs';
import { Buff } from '../../actors/buffs/Buff';
import * as B from '../../actors/buffs/buffs';
import type { Hero } from '../../actors/hero/Hero';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { LENGTH } from '../../levels/constants';
import { PathFinder } from '../../mechanics/PathFinder';
import { observe } from '../../observe';
import { Potion, type PotionKind } from './Potion';

function seedGas(cell: number, amount: number, type: BlobClass): void {
  Dungeon.level.addBlob(Blob.seed(cell, amount, type));
}

/** Cells within `distance` steps of `cell` that are not blocked from sight. */
function areaAround(cell: number, distance: number): number[] {
  const notBlocking = Dungeon.level.losBlocking.map((v) => (v ? 0 : 1));
  PathFinder.buildDistanceMap(cell, notBlocking, distance);
  const out: number[] = [];
  for (let i = 0; i < LENGTH; i++) if (PathFinder.distance[i] < PathFinder.INFINITY) out.push(i);
  return out;
}

export class PotionOfHealing extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Healing';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(_hero: Hero): void {
    this.setKnown();
    PotionOfHealing.heal(Dungeon.hero);
    GLog.p('Your wounds heal completely.');
  }
  static heal(hero: Hero): void {
    hero.HP = hero.HT;
    hero.notifyHp();
    Buff.detach(hero, B.Poison);
    Buff.detach(hero, B.Cripple);
    Buff.detach(hero, B.Weakness);
    Buff.detach(hero, B.Bleeding);
    Fx.start('Speck.HEALING', hero.pos, 0.4, 4);
  }
  desc(): string {
    return 'An elixir that will instantly return you to full health and cure poison.';
  }
  price(): number {
    return this.isKnown() ? 30 * this.quantity : super.price();
  }
}

export class PotionOfExperience extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Experience';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    hero.earnExp(hero.maxExp() - hero.exp);
  }
  desc(): string {
    return 'The storied experiences of multitudes of battles reduced to liquid form, this draught will instantly raise your experience level.';
  }
  price(): number {
    return this.isKnown() ? 80 * this.quantity : super.price();
  }
}

abstract class GasPotion extends Potion {
  protected abstract readonly gas: BlobClass;
  protected abstract readonly amount: number;
  protected kind(): PotionKind {
    return 'harmful';
  }
  shatter(cell: number): void {
    if (Dungeon.visible[cell]) {
      this.setKnown();
      this.splash(cell);
      Sample.play(Assets.SND_SHATTER);
    }
    seedGas(cell, this.amount, this.gas);
  }
}

export class PotionOfToxicGas extends GasPotion {
  protected readonly gas = ToxicGas;
  protected readonly amount = 1000;
  constructor() {
    super();
    this.name = 'Potion of Toxic Gas';
  }
  desc(): string {
    return 'Uncorking or shattering this pressurized glass will cause its contents to explode into a deadly cloud of toxic green gas. You might choose to fling this potion at distant enemies instead of uncorking it by hand.';
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class PotionOfParalyticGas extends GasPotion {
  protected readonly gas = ParalyticGas;
  protected readonly amount = 1000;
  constructor() {
    super();
    this.name = 'Potion of Paralytic Gas';
  }
  desc(): string {
    return 'Upon exposure to open air, the liquid in this flask will vaporize into a numbing yellow haze. Anyone who inhales the cloud will be paralyzed instantly, unable to move for some time after the cloud dissipates. This item can be thrown at distant enemies to catch them within the effect of the gas.';
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class PotionOfLiquidFlame extends GasPotion {
  protected readonly gas = Fire;
  protected readonly amount = 2;
  constructor() {
    super();
    this.name = 'Potion of Liquid Flame';
  }
  desc(): string {
    return 'This flask contains an unstable compound which will burst violently into flame upon exposure to open air.';
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class PotionOfLevitation extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Levitation';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    Buff.affect(hero, B.Levitation, B.Levitation.DURATION);
    GLog.i('You float into the air!');
  }
  desc(): string {
    return 'Drinking this curious liquid will cause you to hover in the air, able to drift effortlessly over traps. Flames and gases fill the air, however, and cannot be bypassed while airborne.';
  }
  price(): number {
    return this.isKnown() ? 35 * this.quantity : super.price();
  }
}

export class PotionOfStrength extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Strength';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    hero.STRValue++;
    hero.showStatus('positive', '+1 str');
    GLog.p('Newfound strength surges through your body.');
    Badges.validateStrengthAttained();
  }
  desc(): string {
    return 'This powerful liquid will course through your muscles, permanently increasing your strength by one point.';
  }
  price(): number {
    return this.isKnown() ? 100 * this.quantity : super.price();
  }
}

export class PotionOfMindVision extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Mind Vision';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    Buff.affect(hero, B.MindVision, B.MindVision.DURATION);
    observe();
    if (Dungeon.level.mobs.size > 0) GLog.i("You can somehow feel the presence of other creatures' minds!");
    else GLog.i('You can somehow tell that you are alone on this level at the moment.');
  }
  desc(): string {
    return 'After drinking this, your mind will become attuned to the psychic signature of distant creatures, enabling you to sense biological presences through walls. Also this potion will permit you to see through nearby walls and doors.';
  }
  price(): number {
    return this.isKnown() ? 35 * this.quantity : super.price();
  }
}

export class PotionOfPurity extends Potion {
  private static readonly DISTANCE = 2;
  constructor() {
    super();
    this.name = 'Potion of Purification';
  }
  shatter(cell: number): void {
    const area = areaAround(cell, PotionOfPurity.DISTANCE);
    const inArea = new Set(area);
    let procd = false;
    for (const name of ['ToxicGas', 'ParalyticGas']) {
      const blob = Dungeon.level.blobs.get(name);
      if (!blob) continue;
      for (const i of area) {
        const value = blob.cur[i];
        if (value > 0) {
          blob.cur[i] = 0;
          blob.volume -= value;
          procd = true;
          if (Dungeon.visible[i]) Fx.burst('Speck.DISCOVER', { pos: i }, 1);
        }
      }
      blob.notifyView();
    }
    const heroAffected = inArea.has(Dungeon.hero.pos);
    if (procd) {
      if (Dungeon.visible[cell]) {
        this.splash(cell);
        Sample.play(Assets.SND_SHATTER);
      }
      this.setKnown();
      if (heroAffected) GLog.p('You feel uncommon freshness in the air.');
    } else {
      super.shatter(cell);
      if (heroAffected) {
        GLog.i('You feel uncommon freshness in the air.');
        this.setKnown();
      }
    }
  }
  protected apply(hero: Hero): void {
    GLog.w("You've stopped sensing any smells!");
    Buff.prolong(hero, B.GasesImmunity, B.GasesImmunity.DURATION);
    this.setKnown();
  }
  desc(): string {
    return 'This reagent will quickly neutralize all harmful gases in the area of effect. Drinking it will give you a temporary immunity to such gases.';
  }
  price(): number {
    return this.isKnown() ? 50 * this.quantity : super.price();
  }
}

export class PotionOfInvisibility extends Potion {
  constructor() {
    super();
    this.name = 'Potion of Invisibility';
  }
  protected kind(): PotionKind {
    return 'beneficial';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    Buff.affect(hero, B.Invisibility, B.Invisibility.DURATION);
    GLog.i('You see your hands turn invisible!');
    Sample.play(Assets.SND_MELD);
  }
  desc(): string {
    return "Drinking this potion will render you temporarily invisible. While invisible, enemies will be unable to see you. Attacking an enemy, as well as using a wand or a scroll before enemy's eyes, will dispel the effect.";
  }
  price(): number {
    return this.isKnown() ? 40 * this.quantity : super.price();
  }
}

export class PotionOfMight extends PotionOfStrength {
  constructor() {
    super();
    this.name = 'Potion of Might';
  }
  protected apply(hero: Hero): void {
    this.setKnown();
    hero.STRValue++;
    hero.HT += 5;
    hero.HP += 5;
    hero.notifyHp();
    hero.showStatus('positive', '+1 str, +5 ht');
    GLog.p('Newfound strength surges through your body.');
    Badges.validateStrengthAttained();
  }
  desc(): string {
    return 'This powerful liquid will course through your muscles, permanently increasing your strength by one point and health by five points.';
  }
  price(): number {
    return this.isKnown() ? 200 * this.quantity : super.price();
  }
}

export class PotionOfFrost extends Potion {
  private static readonly DISTANCE = 2;
  constructor() {
    super();
    this.name = 'Potion of Frost';
  }
  shatter(cell: number): void {
    const fire = (Dungeon.level.blobs.get('Fire') as Fire | undefined) ?? null;
    let visible = false;
    for (const i of areaAround(cell, PotionOfFrost.DISTANCE)) visible = freezeCell(i, fire) || visible;
    fire?.notifyView();
    if (visible) {
      this.splash(cell);
      Sample.play(Assets.SND_SHATTER);
      this.setKnown();
    }
  }
  desc(): string {
    return 'Upon exposure to open air, this chemical will evaporate into a freezing cloud, causing any creature that contacts it to be frozen in place, unable to act and move.';
  }
  price(): number {
    return this.isKnown() ? 50 * this.quantity : super.price();
  }
}

Potion.setClasses([
  PotionOfHealing,
  PotionOfExperience,
  PotionOfToxicGas,
  PotionOfLiquidFlame,
  PotionOfStrength,
  PotionOfParalyticGas,
  PotionOfLevitation,
  PotionOfMindVision,
  PotionOfPurity,
  PotionOfInvisibility,
  PotionOfMight,
  PotionOfFrost,
]);

for (const [name, cls] of Object.entries({
  PotionOfHealing,
  PotionOfExperience,
  PotionOfToxicGas,
  PotionOfParalyticGas,
  PotionOfLiquidFlame,
  PotionOfLevitation,
  PotionOfStrength,
  PotionOfMindVision,
  PotionOfPurity,
  PotionOfInvisibility,
  PotionOfMight,
  PotionOfFrost,
})) {
  registerClass(name, cls);
}
