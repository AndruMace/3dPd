// Port of actors/mobs/Bestiary.java. M1 only has rats; the full depth tables arrive with the other mobs in M2.
import type { Mob } from './Mob';
import { Rat } from './Rat';

export const Bestiary = {
  mob(_depth: number): Mob {
    return new Rat();
  },
  mutable(depth: number): Mob {
    return Bestiary.mob(depth);
  },
};
