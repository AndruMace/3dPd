// Ports of com.watabou.utils.Point and Rect.

export class Point {
  constructor(
    public x = 0,
    public y = 0,
  ) {}

  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  offset(p: Point): this;
  offset(dx: number, dy: number): this;
  offset(a: Point | number, dy = 0): this {
    if (a instanceof Point) return this.offset(a.x, a.y);
    this.x += a;
    this.y += dy;
    return this;
  }

  clone(): Point {
    return new Point(this.x, this.y);
  }
}

export class Rect {
  constructor(
    public left = 0,
    public top = 0,
    public right = 0,
    public bottom = 0,
  ) {}

  width(): number {
    return this.right - this.left;
  }

  height(): number {
    return this.bottom - this.top;
  }

  square(): number {
    return (this.right - this.left) * (this.bottom - this.top);
  }

  set(left: number, top: number, right: number, bottom: number): this;
  set(rect: Rect): this;
  set(a: number | Rect, top = 0, right = 0, bottom = 0): this {
    if (a instanceof Rect) return this.set(a.left, a.top, a.right, a.bottom);
    this.left = a;
    this.top = top;
    this.right = right;
    this.bottom = bottom;
    return this;
  }

  isEmpty(): boolean {
    return this.right <= this.left || this.bottom <= this.top;
  }

  intersect(other: Rect): Rect {
    return new Rect(
      Math.max(this.left, other.left),
      Math.max(this.top, other.top),
      Math.min(this.right, other.right),
      Math.min(this.bottom, other.bottom),
    );
  }

  shrink(d = 1): Rect {
    return new Rect(this.left + d, this.top + d, this.right - d, this.bottom - d);
  }
}
