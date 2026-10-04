// Port of actors/mobs/Rat.java.
import { Random } from '../../core/Random';
import type { Char } from '../Char';
import { Mob } from './Mob';

export class Rat extends Mob {
  constructor() {
    super();
    this.name = 'marsupial rat';
    this.spriteId = 'Rat';
    this.HP = this.HT = 8;
    this.defenseSkillValue = 3;
    this.maxLvl = 5;
  }

  damageRoll(): number {
    return Random.NormalIntRange(1, 5);
  }

  attackSkill(_target: Char): number {
    return 8;
  }

  dr(): number {
    return 1;
  }

  description(): string {
    return 'Marsupial rats are aggressive, but rather weak denizens of the sewers. They can be dangerous only in big numbers.';
  }
}
