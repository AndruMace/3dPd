// Port of items/Gold.java (data only for now).
import { Dungeon } from '../Dungeon';
import { Random } from '../core/Random';
import { Item } from './Item';

export class Gold extends Item {
  constructor(value?: number) {
    super();
    this.name = 'gold';
    this.image = ItemSprite.GOLD;
    this.stackable = true;
    this.quantity = value ?? Random.Int(30 + Dungeon.depth * 10, 60 + Dungeon.depth * 20);
  }
}

const ItemSprite = { GOLD: 14 };
