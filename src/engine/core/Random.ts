// Seeded replacement for com.watabou.utils.Random. Same API and distributions, deterministic per seed.
// (Not seed-compatible with the Java original, which used Math.random().)

let a = 0x9e3779b9;
let b = 0x243f6a88;
let c = 0xb7e15162;
let d = 1;

/** sfc32: small, fast, 128-bit state, good statistical quality. Returns a float in [0, 1). */
function next(): number {
  a >>>= 0;
  b >>>= 0;
  c >>>= 0;
  d >>>= 0;
  const t = (((a + b) | 0) + d) | 0;
  d = (d + 1) | 0;
  a = b ^ (b >>> 9);
  b = (c + (c << 3)) | 0;
  c = (c << 21) | (c >>> 11);
  c = (c + t) | 0;
  return (t >>> 0) / 4294967296;
}

export type RandomState = [number, number, number, number];

export const Random = {
  seed(seed: number | string): void {
    // splitmix32 expands the seed into the four state words.
    let s = typeof seed === 'number' ? seed >>> 0 : hashString(seed);
    const mix = () => {
      s = (s + 0x9e3779b9) | 0;
      let z = s;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
      return (z ^ (z >>> 16)) >>> 0;
    };
    a = mix();
    b = mix();
    c = mix();
    d = mix();
    for (let i = 0; i < 12; i++) next();
  },

  getState(): RandomState {
    return [a >>> 0, b >>> 0, c >>> 0, d >>> 0];
  },

  setState(s: RandomState): void {
    [a, b, c, d] = s;
  },

  /** Float(): [0,1); Float(max): [0,max); Float(min, max): [min,max). */
  Float(minOrMax?: number, max?: number): number {
    if (minOrMax === undefined) return next();
    if (max === undefined) return next() * minOrMax;
    return minOrMax + next() * (max - minOrMax);
  },

  /** Int(max): [0,max) or 0 if max <= 0; Int(min, max): [min,max). */
  Int(minOrMax: number, max?: number): number {
    if (max === undefined) return minOrMax > 0 ? Math.trunc(next() * minOrMax) : 0;
    return minOrMax + Math.trunc(next() * (max - minOrMax));
  },

  /** Inclusive [min, max]. */
  IntRange(min: number, max: number): number {
    return min + Math.trunc(next() * (max - min + 1));
  },

  /** Inclusive [min, max], triangular distribution centered on the middle. */
  NormalIntRange(min: number, max: number): number {
    return min + Math.trunc(((next() + next()) * (max - min + 1)) / 2);
  },

  /** Index chosen with the given relative weights. */
  chances(chances: readonly number[]): number {
    let sum = 0;
    for (const ch of chances) sum += ch;
    const value = Random.Float(sum);
    sum = chances[0];
    for (let i = 0; i < chances.length; i++) {
      if (value < sum) return i;
      sum += chances[i + 1];
    }
    return 0;
  },

  /** Key chosen with the map's values as relative weights. */
  chancesMap<K>(chances: Map<K, number>): K | null {
    const keys = [...chances.keys()];
    const probs = keys.map((k) => chances.get(k)!);
    let sum = 0;
    for (const p of probs) sum += p;
    const value = Random.Float(sum);
    sum = probs[0];
    for (let i = 0; i < keys.length; i++) {
      if (value < sum) return keys[i];
      sum += probs[i + 1];
    }
    return null;
  },

  index(collection: { length: number } | { size: number }): number {
    const n = 'length' in collection ? collection.length : collection.size;
    return Math.trunc(next() * n);
  },

  oneOf<T>(...array: T[]): T {
    return array[Math.trunc(next() * array.length)];
  },

  /** Random element of an array (optionally of its first `max` entries) or of any iterable; null if empty. */
  element<T>(collection: readonly T[] | Iterable<T>, max?: number): T | null {
    const arr = Array.isArray(collection) ? (collection as readonly T[]) : [...collection];
    const n = max ?? arr.length;
    return n > 0 ? arr[Math.trunc(next() * n)] : null;
  },

  shuffle<T>(array: T[]): void {
    for (let i = 0; i < array.length - 1; i++) {
      const j = Random.Int(i, array.length);
      if (j !== i) [array[i], array[j]] = [array[j], array[i]];
    }
  },
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
