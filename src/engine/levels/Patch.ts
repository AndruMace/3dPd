// Port of levels/Patch.java: cellular-automaton blobs used for water and grass.
import { Random } from '../core/Random';
import { HEIGHT, LENGTH, WIDTH } from './constants';

export function generatePatch(seed: number, nGen: number): Uint8Array {
  const w = WIDTH;
  const h = HEIGHT;
  let cur = new Uint8Array(LENGTH);
  let off = new Uint8Array(LENGTH);
  for (let i = 0; i < LENGTH; i++) off[i] = Random.Float() < seed ? 1 : 0;

  for (let i = 0; i < nGen; i++) {
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const pos = x + y * w;
        const count =
          off[pos - w - 1] +
          off[pos - w] +
          off[pos - w + 1] +
          off[pos - 1] +
          off[pos + 1] +
          off[pos + w - 1] +
          off[pos + w] +
          off[pos + w + 1];
        cur[pos] = (!off[pos] && count >= 5) || (off[pos] && count >= 4) ? 1 : 0;
      }
    }
    [cur, off] = [off, cur];
  }
  return off;
}
