// Placeholder for items/Generator.java. M1 only needs something droppable; the real drop tables arrive in M2.
import { Gold } from './Gold';
import type { Item } from './Item';

export const Generator = {
  random(): Item {
    return new Gold();
  },
};
