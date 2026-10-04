// Ports of the concrete blobs in actors/blobs/.
import { Assets } from '../../../content/generated/Assets';
import { Dungeon, ResultDescriptions } from '../../Dungeon';
import { Journal, type FeatureId } from '../../Journal';
import type { Bundle } from '../../core/Bundle';
import { registerClass } from '../../core/Bundle';
import { GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import type { Item } from '../../items/Item';
import { LENGTH, NEIGHBOURS8, WIDTH } from '../../levels/constants';
import { discover, flags, Terrain } from '../../levels/Terrain';
import { observe } from '../../observe';
import { Actor, TICK } from '../Actor';
import { Buff, BuffIndicator, FlavourBuff } from '../buffs/Buff';
import { Awareness, Burning, Frost, GasesImmunity, Hunger, Paralysis, Roots, Shadows, Vertigo } from '../buffs/buffs';
import type { Char } from '../Char';
import type { Hero } from '../hero/Hero';
import { Blob } from './Blob';

export class ToxicGas extends Blob {
  protected evolve(): void {
    super.evolve();
    const levelDamage = 5 + Dungeon.depth * 5;
    for (let i = 0; i < LENGTH; i++) {
      const ch = this.cur[i] > 0 ? Actor.findChar(i) : null;
      if (ch) {
        let damage = Math.trunc((ch.HT + levelDamage) / 40);
        if (Random.Int(40) < (ch.HT + levelDamage) % 40) damage++;
        ch.damage(damage, this);
      }
    }
    const blob = Dungeon.level.blobs.get('ParalyticGas');
    if (blob) {
      const par = blob.cur;
      for (let i = 0; i < LENGTH; i++) {
        const t = this.cur[i];
        const p = par[i];
        if (p >= t) {
          this.volume -= t;
          this.cur[i] = 0;
        } else {
          blob.volume -= p;
          par[i] = 0;
        }
      }
    }
  }

  tileDesc(): string {
    return 'A greenish cloud of toxic gas is swirling here.';
  }

  onDeath(): void {
    Dungeon.fail(ResultDescriptions.GAS(Dungeon.depth));
    GLog.n('You died from a toxic gas..');
  }
}

export class ParalyticGas extends Blob {
  protected evolve(): void {
    super.evolve();
    for (let i = 0; i < LENGTH; i++) {
      const ch = this.cur[i] > 0 ? Actor.findChar(i) : null;
      if (ch) Buff.prolong(ch, Paralysis, Paralysis.duration(ch));
    }
  }

  tileDesc(): string {
    return 'A cloud of paralytic gas is swirling here.';
  }
}

export class ConfusionGas extends Blob {
  protected evolve(): void {
    super.evolve();
    for (let i = 0; i < LENGTH; i++) {
      const ch = this.cur[i] > 0 ? Actor.findChar(i) : null;
      if (ch) Buff.prolong(ch, Vertigo, Vertigo.duration(ch));
    }
  }

  tileDesc(): string {
    return 'A cloud of confusion gas is swirling here.';
  }
}

export class Fire extends Blob {
  protected evolve(): void {
    const level = Dungeon.level;
    const flamable = level.flamable;
    const from = WIDTH + 1;
    const to = LENGTH - WIDTH - 1;
    let doObserve = false;

    for (let pos = from; pos < to; pos++) {
      let fire: number;
      if (this.cur[pos] > 0) {
        this.burn(pos);
        fire = this.cur[pos] - 1;
        if (fire <= 0 && flamable[pos]) {
          const oldTile = level.map[pos];
          level.destroy(pos);
          doObserve = true;
          if (Dungeon.visible[pos]) Fx.at('discoverTile', pos, oldTile);
        }
      } else if (
        flamable[pos] &&
        (this.cur[pos - 1] > 0 || this.cur[pos + 1] > 0 || this.cur[pos - WIDTH] > 0 || this.cur[pos + WIDTH] > 0)
      ) {
        fire = 4;
        this.burn(pos);
      } else {
        fire = 0;
      }
      this.volume += this.off[pos] = fire;
    }
    if (doObserve) observe();
  }

  private burn(pos: number): void {
    const ch = Actor.findChar(pos);
    if (ch) Buff.affect(ch, Burning).reignite(ch);
    Dungeon.level.heaps.get(pos)?.burn();
  }

  seed(cell: number, amount: number): void {
    if (this.cur[cell] === 0) {
      this.volume += amount;
      this.cur[cell] = amount;
    }
  }

  tileDesc(): string {
    return 'A fire is raging here.';
  }
}

export class Web extends Blob {
  protected evolve(): void {
    for (let i = 0; i < LENGTH; i++) {
      const offv = this.cur[i] > 0 ? this.cur[i] - 1 : 0;
      this.off[i] = offv;
      if (offv > 0) {
        this.volume += offv;
        const ch = Actor.findChar(i);
        if (ch) Buff.prolong(ch, Roots, TICK);
      }
    }
  }

  seed(cell: number, amount: number): void {
    const diff = amount - this.cur[cell];
    if (diff > 0) {
      this.cur[cell] = amount;
      this.volume += diff;
    }
  }

  tileDesc(): string {
    return 'Everything is covered with a thick web here.';
  }
}

export class Regrowth extends Blob {
  protected evolve(): void {
    super.evolve();
    if (this.volume > 0) {
      const level = Dungeon.level;
      let mapUpdated = false;
      for (let i = 0; i < LENGTH; i++) {
        if (this.off[i] > 0) {
          const c = level.map[i];
          let c1 = c;
          if (c === Terrain.EMPTY || c === Terrain.EMBERS || c === Terrain.EMPTY_DECO) {
            c1 = this.cur[i] > 9 ? Terrain.HIGH_GRASS : Terrain.GRASS;
          } else if (c === Terrain.GRASS && this.cur[i] > 9) {
            c1 = Terrain.HIGH_GRASS;
          }
          if (c1 !== c) {
            // As in the original, the cell always becomes high grass.
            level.set(i, Terrain.HIGH_GRASS);
            mapUpdated = true;
            if (Dungeon.visible[i]) Fx.at('discoverTile', i, c);
          }
          const ch = Actor.findChar(i);
          if (ch) Buff.prolong(ch, Roots, TICK);
        }
      }
      if (mapUpdated) observe();
    }
  }
}

export class Foliage extends Blob {
  protected evolve(): void {
    const from = WIDTH + 1;
    const to = LENGTH - WIDTH - 1;
    const level = Dungeon.level;
    let visible = false;
    for (let pos = from; pos < to; pos++) {
      if (this.cur[pos] > 0) {
        this.off[pos] = this.cur[pos];
        this.volume += this.off[pos];
        if (level.map[pos] === Terrain.EMBERS) level.set(pos, Terrain.GRASS);
        visible = visible || !!Dungeon.visible[pos];
      } else {
        this.off[pos] = 0;
      }
    }
    const hero = Dungeon.hero;
    if (hero.isAlive() && hero.visibleEnemyCount() === 0 && this.cur[hero.pos] > 0)
      Buff.affect(hero, Shadows).prolong();
    if (visible) Journal.add('GARDEN');
  }

  tileDesc(): string {
    return 'Shafts of light pierce the gloom of the underground garden.';
  }
}

/** Blobs that live on a single cell (wells, the alchemy pot, the sacrificial fire). */
abstract class PointBlob extends Blob {
  pos = 0;

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    for (let i = 0; i < LENGTH; i++) {
      if (this.cur[i] > 0) {
        this.pos = i;
        break;
      }
    }
  }

  seed(cell: number, amount: number): void {
    this.cur[this.pos] = 0;
    this.pos = cell;
    this.volume = this.cur[this.pos] = amount;
  }
}

export class Alchemy extends PointBlob {
  protected evolve(): void {
    this.volume = this.off[this.pos] = this.cur[this.pos];
    if (Dungeon.visible[this.pos]) Journal.add('ALCHEMY');
  }

  static transmute(cell: number): void {
    const heap = Dungeon.level.heaps.get(cell);
    if (heap) {
      const result = heap.transmute();
      if (result) Dungeon.level.drop(result, cell).dropFX(cell);
    }
  }
}

export abstract class WellWater extends PointBlob {
  protected abstract readonly feature: FeatureId;

  protected evolve(): void {
    this.volume = this.off[this.pos] = this.cur[this.pos];
    if (Dungeon.visible[this.pos]) Journal.add(this.feature);
  }

  protected affect(): boolean {
    const level = Dungeon.level;
    const pos = this.pos;
    if (pos === Dungeon.hero.pos && this.affectHero(Dungeon.hero)) {
      this.volume = this.off[pos] = this.cur[pos] = 0;
      return true;
    }
    const heap = level.heaps.get(pos);
    if (!heap) return false;
    const oldItem = heap.peek()!;
    const newItem = this.affectItem(oldItem);
    if (newItem) {
      if (newItem === oldItem) {
        // changed in place
      } else if (oldItem.quantity > 1) {
        oldItem.quantity--;
        heap.drop(newItem);
      } else {
        heap.replace(oldItem, newItem);
      }
      heap.refresh();
      this.volume = this.off[pos] = this.cur[pos] = 0;
      return true;
    }
    let newPlace: number;
    do {
      newPlace = pos + NEIGHBOURS8[Random.Int(8)];
    } while (!level.passable[newPlace] && !level.avoid[newPlace]);
    level.drop(heap.pickUp(), newPlace).dropFX(pos);
    return false;
  }

  protected affectHero(_hero: Hero): boolean {
    return false;
  }

  protected affectItem(_item: Item): Item | null {
    return null;
  }

  static affectCell(cell: number): void {
    for (const name of ['WaterOfHealth', 'WaterOfAwareness', 'WaterOfTransmutation']) {
      const water = Dungeon.level.blobs.get(name) as WellWater | undefined;
      if (water && water.volume > 0 && water.pos === cell && water.affect()) {
        Dungeon.level.set(cell, Terrain.EMPTY_WELL);
        return;
      }
    }
  }
}

export class WaterOfHealth extends WellWater {
  protected readonly feature = 'WELL_OF_HEALTH' as const;

  protected affectHero(hero: Hero): boolean {
    Sample.play(Assets.SND_DRINK);
    lazy<{ heal(h: Hero): void }>('PotionOfHealing').heal(hero);
    hero.belongings.uncurseEquipped();
    hero.buff(Hunger)!.satisfy(Hunger.STARVING);
    Fx.start('ShaftParticle', this.pos, 0.2, 3);
    hero.interrupt();
    GLog.p('As you take a sip, you feel your wounds heal completely.');
    Journal.remove('WELL_OF_HEALTH');
    return true;
  }

  protected affectItem(item: Item): Item | null {
    const DewVial = lazy<abstract new () => Item & { isFull(): boolean; fill(): void }>('DewVial');
    if (item instanceof DewVial && !item.isFull()) {
      item.fill();
      Journal.remove('WELL_OF_HEALTH');
      return item;
    }
    return null;
  }

  tileDesc(): string {
    return 'Power of health radiates from the water of this well. Take a sip from it to heal your wounds and satisfy hunger.';
  }
}

export class WaterOfAwareness extends WellWater {
  protected readonly feature = 'WELL_OF_AWARENESS' as const;

  protected affectHero(hero: Hero): boolean {
    Sample.play(Assets.SND_DRINK);
    Fx.at('identification', this.pos);
    hero.belongings.observe();
    const level = Dungeon.level;
    for (let i = 0; i < LENGTH; i++) {
      const terr = level.map[i];
      if (flags[terr] & Terrain.SECRET) {
        level.set(i, discover(terr));
        if (Dungeon.visible[i]) Fx.at('discoverTile', i, terr);
      }
    }
    Buff.affect(hero, Awareness, Awareness.DURATION);
    observe();
    hero.interrupt();
    GLog.p(
      'As you take a sip, you feel the knowledge pours into your mind. Now you know everything about your equipped items. Also you sense all items on the level and know all its secrets.',
    );
    Journal.remove('WELL_OF_AWARENESS');
    return true;
  }

  protected affectItem(item: Item): Item | null {
    if (item.isIdentified()) return null;
    item.identify();
    Fx.at('identification', this.pos);
    Journal.remove('WELL_OF_AWARENESS');
    return item;
  }

  tileDesc(): string {
    return 'Power of knowledge radiates from the water of this well. Take a sip from it to reveal all secrets of equipped items.';
  }
}

export class WaterOfTransmutation extends WellWater {
  protected readonly feature = 'WELL_OF_TRANSMUTATION' as const;

  protected affectItem(item: Item): Item | null {
    const result = lazy<{ transmute(item: Item): Item | null }>('Transmutation').transmute(item);
    if (result) Journal.remove('WELL_OF_TRANSMUTATION');
    return result;
  }

  tileDesc(): string {
    return 'Power of change radiates from the water of this well. Throw an item into the well to turn it into something else.';
  }
}

export class SacrificialFire extends PointBlob {
  protected evolve(): void {
    this.volume = this.off[this.pos] = this.cur[this.pos];
    const ch = Actor.findChar(this.pos);
    if (ch) {
      if (Dungeon.visible[this.pos] && ch.buff(Marked) === null) {
        Fx.burst('SacrificialParticle', { id: ch.id() }, 20);
        Sample.play(Assets.SND_BURNING);
      }
      Buff.prolong(ch, Marked, Marked.DURATION);
    }
    if (Dungeon.visible[this.pos]) Journal.add('SACRIFICIAL_FIRE');
  }

  static sacrifice(ch: Char): void {
    Fx.at('wound', ch.pos);
    const fire = Dungeon.level.blobs.get('SacrificialFire') as SacrificialFire | undefined;
    if (!fire) return;
    let exp = 0;
    if (ch === Dungeon.hero) exp = Dungeon.hero.maxExp();
    else exp = (ch as Char & { exp(): number }).exp() * Random.IntRange(1, 3);
    if (exp > 0) {
      const volume = fire.volume - exp;
      if (volume > 0) {
        fire.seed(fire.pos, volume);
        GLog.w('"Your sacrifice is worthy..." ');
      } else {
        fire.seed(fire.pos, 0);
        Journal.remove('SACRIFICIAL_FIRE');
        GLog.w('"Your sacrifice is worthy and so you are!" ');
        Fx.at('flare', fire.pos, 0x66ffff);
        Dungeon.level.drop(new (lazy<new () => Item>('ScrollOfWipeOut'))(), fire.pos).dropFX(fire.pos);
      }
    } else {
      GLog.w('"Your sacrifice is unworthy..." ');
    }
  }

  tileDesc(): string {
    return 'Sacrificial fire burns here. Every creature touched by this fire is marked as an offering for the spirits of the dungeon.';
  }
}

export class Marked extends FlavourBuff {
  static readonly DURATION = 5;

  icon(): number {
    return BuffIndicator.SACRIFICE;
  }

  toString(): string {
    return 'Marked for sacrifice';
  }

  detach(): void {
    if (!this.target.isAlive()) SacrificialFire.sacrifice(this.target);
    super.detach();
  }
}

/** Port of Freezing.affect: returns true if the cell is visible. */
export function freezeCell(cell: number, fire: Fire | null): boolean {
  const ch = Actor.findChar(cell);
  if (ch) Buff.prolong(ch, Frost, Frost.duration(ch) * Random.Float(1.0, 1.5));
  fire?.clear(cell);
  Dungeon.level.heaps.get(cell)?.freeze();
  if (Dungeon.visible[cell]) {
    Fx.start('SnowParticle', cell, 0.2, 6);
    return true;
  }
  return false;
}

GasesImmunity.IMMUNITIES.add(ToxicGas);

for (const [name, cls] of Object.entries({
  ToxicGas,
  ParalyticGas,
  ConfusionGas,
  Fire,
  Web,
  Regrowth,
  Foliage,
  Alchemy,
  WaterOfHealth,
  WaterOfAwareness,
  WaterOfTransmutation,
  SacrificialFire,
})) {
  registerClass(name, cls);
}
registerClass('SacrificialFire.Marked', Marked);
