// Port of items/Item.java (base only for now; actions, identification and quantity logic arrive in M2).

export abstract class Item {
  name = 'smth';
  /** Index into items.png (ItemSpriteSheet). */
  image = 0;
  quantity = 1;
  stackable = false;
  private _level = 0;
  levelKnown = false;
  cursed = false;

  level(): number {
    return this._level;
  }

  setLevel(value: number): void {
    this._level = value;
  }

  identify(): this {
    this.levelKnown = true;
    return this;
  }

  price(): number {
    return 0;
  }

  toString(): string {
    return this.name;
  }
}
