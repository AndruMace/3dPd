// Port of actors/mobs/Bestiary.java: which monsters live at which depth.
import { lazy, registerService } from '../../core/lazy';
import { Random } from '../../core/Random';
import type { Char } from '../Char';
import type { Mob } from './Mob';

const TABLES: Record<number, [number[], string[]]> = {
  1: [[1], ['Rat']],
  2: [
    [1, 1],
    ['Rat', 'Gnoll'],
  ],
  3: [
    [1, 2, 1, 0.02],
    ['Rat', 'Gnoll', 'Crab', 'Swarm'],
  ],
  4: [
    [1, 2, 3, 0.02, 0.01, 0.01],
    ['Rat', 'Gnoll', 'Crab', 'Swarm', 'Skeleton', 'Thief'],
  ],
  5: [[1], ['Goo']],
  6: [
    [4, 2, 1, 0.2],
    ['Skeleton', 'Thief', 'Swarm', 'Shaman'],
  ],
  7: [
    [3, 1, 1, 1],
    ['Skeleton', 'Shaman', 'Thief', 'Swarm'],
  ],
  8: [
    [3, 2, 1, 1, 1, 0.02],
    ['Skeleton', 'Shaman', 'Gnoll', 'Thief', 'Swarm', 'Bat'],
  ],
  9: [
    [3, 3, 1, 1, 0.02, 0.01],
    ['Skeleton', 'Shaman', 'Thief', 'Swarm', 'Bat', 'Brute'],
  ],
  10: [[1], ['Tengu']],
  11: [
    [1, 0.2],
    ['Bat', 'Brute'],
  ],
  12: [
    [1, 1, 0.2],
    ['Bat', 'Brute', 'Spinner'],
  ],
  13: [
    [1, 3, 1, 1, 0.02],
    ['Bat', 'Brute', 'Shaman', 'Spinner', 'Elemental'],
  ],
  14: [
    [1, 3, 1, 4, 0.02, 0.01],
    ['Bat', 'Brute', 'Shaman', 'Spinner', 'Elemental', 'Monk'],
  ],
  15: [[1], ['DM300']],
  16: [
    [1, 1, 0.2],
    ['Elemental', 'Warlock', 'Monk'],
  ],
  17: [
    [1, 1, 1],
    ['Elemental', 'Monk', 'Warlock'],
  ],
  18: [
    [1, 2, 1, 1],
    ['Elemental', 'Monk', 'Golem', 'Warlock'],
  ],
  19: [
    [1, 2, 3, 1, 0.02],
    ['Elemental', 'Monk', 'Golem', 'Warlock', 'Succubus'],
  ],
  20: [[1], ['King']],
  22: [
    [1, 1],
    ['Succubus', 'Eye'],
  ],
  23: [
    [1, 2, 1],
    ['Succubus', 'Eye', 'Scorpio'],
  ],
  24: [
    [1, 2, 3],
    ['Succubus', 'Eye', 'Scorpio'],
  ],
  25: [[1], ['Yog']],
};

const MUTATIONS: Record<string, string> = {
  Rat: 'Albino',
  Thief: 'Bandit',
  Brute: 'Shielded',
  Monk: 'Senior',
  Scorpio: 'Acidic',
};
const BOSSES = ['Goo', 'Tengu', 'DM300', 'King', 'Yog', 'Yog.BurningFist', 'Yog.RottingFist'];

function mobClass(depth: number): string {
  const [chances, classes] = TABLES[depth] ?? [[1], ['Eye']];
  return classes[Random.chances(chances)];
}

export const Bestiary = {
  mob(depth: number): Mob {
    return new (lazy<new () => Mob>(mobClass(depth)))();
  },

  mutable(depth: number): Mob {
    let cl = mobClass(depth);
    if (Random.Int(30) === 0 && MUTATIONS[cl]) cl = MUTATIONS[cl];
    return new (lazy<new () => Mob>(cl))();
  },

  isBoss(mob: Char): boolean {
    for (const name of BOSSES) {
      try {
        if (mob instanceof lazy<abstract new () => Char>(name)) return true;
      } catch {
        // boss not ported yet
      }
    }
    return false;
  },
};

registerService('Bestiary', Bestiary);
