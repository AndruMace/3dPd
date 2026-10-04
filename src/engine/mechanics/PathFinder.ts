// Port of com.watabou.utils.PathFinder: BFS distance maps over the 8-connected grid.
// Relies, like the original, on the level border being impassable (no wrap-around checks).
import { LENGTH, WIDTH } from '../levels/constants';

const INF = 0x7fffffff;
const size = LENGTH;
export const distance = new Int32Array(size);
const goals = new Uint8Array(size);
const queue = new Int32Array(size * 2);
const dir = [-1, +1, -WIDTH, +WIDTH, -WIDTH - 1, -WIDTH + 1, +WIDTH - 1, +WIDTH + 1];

type Passable = ArrayLike<number | boolean>;

function buildDistanceMapTo(from: number, to: number, passable: Passable): boolean {
  if (from === to) return false;
  distance.fill(INF);
  let head = 0;
  let tail = 0;
  queue[tail++] = to;
  distance[to] = 0;
  while (head < tail) {
    const step = queue[head++];
    if (step === from) return true;
    const nextDistance = distance[step] + 1;
    for (const d of dir) {
      const n = step + d;
      if (n === from || (n >= 0 && n < size && passable[n] && distance[n] > nextDistance)) {
        queue[tail++] = n;
        distance[n] = nextDistance;
      }
    }
  }
  return false;
}

function buildDistanceMapGoals(from: number, to: Uint8Array, passable: Passable): boolean {
  if (to[from]) return false;
  distance.fill(INF);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < size; i++) {
    if (to[i]) {
      queue[tail++] = i;
      distance[i] = 0;
    }
  }
  while (head < tail) {
    const step = queue[head++];
    if (step === from) return true;
    const nextDistance = distance[step] + 1;
    for (const d of dir) {
      const n = step + d;
      if (n === from || (n >= 0 && n < size && passable[n] && distance[n] > nextDistance)) {
        queue[tail++] = n;
        distance[n] = nextDistance;
      }
    }
  }
  return false;
}

function buildEscapeDistanceMap(cur: number, from: number, factor: number, passable: Passable): number {
  distance.fill(INF);
  let destDist = INF;
  let head = 0;
  let tail = 0;
  queue[tail++] = from;
  distance[from] = 0;
  let dist = 0;
  while (head < tail) {
    const step = queue[head++];
    dist = distance[step];
    if (dist > destDist) return destDist;
    if (step === cur) destDist = Math.trunc(dist * factor) + 1;
    const nextDistance = dist + 1;
    for (const d of dir) {
      const n = step + d;
      if (n >= 0 && n < size && passable[n] && distance[n] > nextDistance) {
        queue[tail++] = n;
        distance[n] = nextDistance;
      }
    }
  }
  return dist;
}

function descend(s: number): number {
  let minD = distance[s];
  let mins = s;
  for (const d of dir) {
    const n = s + d;
    if (distance[n] < minD) {
      minD = distance[n];
      mins = n;
    }
  }
  return mins;
}

export const PathFinder = {
  /** Full path from `from` (exclusive) to `to` (inclusive), or null. */
  find(from: number, to: number, passable: Passable): number[] | null {
    if (!buildDistanceMapTo(from, to, passable)) return null;
    const result: number[] = [];
    let s = from;
    do {
      s = descend(s);
      result.push(s);
    } while (s !== to);
    return result;
  },

  /** First step from `from` towards `to`, or -1. */
  getStep(from: number, to: number, passable: Passable): number {
    if (!buildDistanceMapTo(from, to, passable)) return -1;
    return descend(from);
  },

  /** First step away from `from`, aiming for cells roughly twice as far as we are now. */
  getStepBack(cur: number, from: number, passable: Passable): number {
    const d = buildEscapeDistanceMap(cur, from, 2, passable);
    for (let i = 0; i < size; i++) goals[i] = distance[i] === d ? 1 : 0;
    if (!buildDistanceMapGoals(cur, goals, passable)) return -1;
    return descend(cur);
  },

  /** Distance map from `to`, stopping beyond `limit`. Result in PathFinder.distance. */
  buildDistanceMap(to: number, passable: Passable, limit = INF): void {
    distance.fill(INF);
    let head = 0;
    let tail = 0;
    queue[tail++] = to;
    distance[to] = 0;
    while (head < tail) {
      const step = queue[head++];
      const nextDistance = distance[step] + 1;
      if (nextDistance > limit) return;
      for (const d of dir) {
        const n = step + d;
        if (n >= 0 && n < size && passable[n] && distance[n] > nextDistance) {
          queue[tail++] = n;
          distance[n] = nextDistance;
        }
      }
    }
  },

  /** Distances from the last distance-map build. */
  distance,

  INFINITY: INF,
};
