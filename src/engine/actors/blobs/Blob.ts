// Port of actors/blobs/Blob.java: per-cell quantities (gases, fire, webs...) that diffuse each turn.
import { Dungeon } from '../../Dungeon';
import type { Bundle } from '../../core/Bundle';
import { classNameOf, registerClass } from '../../core/Bundle';
import { Events } from '../../core/events';
import { HEIGHT, LENGTH, WIDTH } from '../../levels/constants';
import { Actor, TICK } from '../Actor';

export type BlobClass<T extends Blob = Blob> = (new () => T) & { prototype: T };

export class Blob extends Actor {
  static readonly WIDTH = WIDTH;
  static readonly HEIGHT = HEIGHT;
  static readonly LENGTH = LENGTH;

  volume = 0;
  cur = new Int32Array(LENGTH);
  protected off = new Int32Array(LENGTH);

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    if (this.volume > 0) {
      let start = 0;
      while (start < LENGTH && this.cur[start] <= 0) start++;
      let end = LENGTH - 1;
      while (end > start && this.cur[end] <= 0) end--;
      bundle.put('start', start);
      bundle.put('cur', this.cur.subarray(start, end + 1));
    }
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    const data = bundle.getIntArray('cur');
    const start = bundle.getInt('start');
    for (let i = 0; i < data.length; i++) {
      this.cur[i + start] = data[i];
      this.volume += data[i];
    }
  }

  protected act(): boolean {
    this.spend(TICK);
    if (this.volume > 0) {
      this.volume = 0;
      this.evolve();
      const tmp = this.off;
      this.off = this.cur;
      this.cur = tmp;
      this.notifyView();
    }
    return true;
  }

  protected evolve(): void {
    const solid = Dungeon.level.solid;
    const { cur, off } = this;
    for (let i = 1; i < HEIGHT - 1; i++) {
      const from = i * WIDTH + 1;
      const to = from + WIDTH - 2;
      for (let pos = from; pos < to; pos++) {
        if (!solid[pos]) {
          let count = 1;
          let sum = cur[pos];
          if (!solid[pos - 1]) {
            sum += cur[pos - 1];
            count++;
          }
          if (!solid[pos + 1]) {
            sum += cur[pos + 1];
            count++;
          }
          if (!solid[pos - WIDTH]) {
            sum += cur[pos - WIDTH];
            count++;
          }
          if (!solid[pos + WIDTH]) {
            sum += cur[pos + WIDTH];
            count++;
          }
          const value = sum >= count ? Math.trunc(sum / count) - 1 : 0;
          off[pos] = value;
          this.volume += value;
        } else {
          off[pos] = 0;
        }
      }
    }
  }

  seed(cell: number, amount: number): void {
    this.cur[cell] += amount;
    this.volume += amount;
  }

  clear(cell: number): void {
    this.volume -= this.cur[cell];
    this.cur[cell] = 0;
  }

  tileDesc(): string | null {
    return null;
  }

  /** Tells the view where this blob is now (it draws PD's BlobEmitter particles from this). */
  notifyView(): void {
    const cells: number[] = [];
    for (let i = 0; i < LENGTH; i++) if (this.cur[i] > 0) cells.push(i, this.cur[i]);
    Events.emit({ type: 'blob', blob: classNameOf(this), cells });
  }

  /** Blob.seed(cell, amount, Type): adds to (creating if needed) the level's blob of that type. */
  static seed<T extends Blob>(cell: number, amount: number, type: BlobClass<T>): T {
    const name = classNameOf(type.prototype);
    let gas = Dungeon.level.blobs.get(name) as T | undefined;
    if (!gas) {
      gas = new type();
      Dungeon.level.blobs.set(name, gas);
    }
    gas.seed(cell, amount);
    return gas;
  }
}

registerClass('Blob', Blob);
