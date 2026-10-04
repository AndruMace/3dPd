// Port of actors/buffs/Buff.java (base). Concrete buffs arrive with M2.
import { Actor } from '../Actor';
import type { Char } from '../Char';

export abstract class Buff extends Actor {
  target: Char | null = null;

  attachTo(target: Char): boolean {
    if (target.immunities().has(this.constructor as never)) return false;
    this.target = target;
    target.addBuff(this);
    return true;
  }

  detach(): void {
    this.target?.removeBuff(this);
  }

  protected act(): boolean {
    this.diactivate();
    return true;
  }

  onAdd(): void {}
}
