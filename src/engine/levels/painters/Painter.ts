// Port of levels/painters/Painter.java: drawing helpers over a level's terrain map.
import { Point, type Rect } from '../../core/geom';
import { WIDTH } from '../constants';
import type { Level } from '../Level';
import type { Room } from '../Room';

export function set(level: Level, cell: number | Point, value: number): void;
export function set(level: Level, x: number, y: number, value: number): void;
export function set(level: Level, a: number | Point, b: number, c?: number): void {
  if (a instanceof Point) level.map[a.x + a.y * WIDTH] = b;
  else if (c === undefined) level.map[a] = b;
  else level.map[a + b * WIDTH] = c;
}

export function fill(level: Level, x: number, y: number, w: number, h: number, value: number): void {
  let pos = y * WIDTH + x;
  for (let i = y; i < y + h; i++, pos += WIDTH) level.map.fill(value, pos, pos + w);
}

/** Fills a room rect including its walls, optionally inset by margins (l, t, r, b) or a uniform margin. */
export function fillRect(level: Level, rect: Rect, value: number): void;
export function fillRect(level: Level, rect: Rect, m: number, value: number): void;
export function fillRect(level: Level, rect: Rect, l: number, t: number, r: number, b: number, value: number): void;
export function fillRect(level: Level, rect: Rect, ...args: number[]): void {
  if (args.length === 1) {
    fill(level, rect.left, rect.top, rect.width() + 1, rect.height() + 1, args[0]);
  } else if (args.length === 2) {
    const [m, value] = args;
    fill(level, rect.left + m, rect.top + m, rect.width() + 1 - m * 2, rect.height() + 1 - m * 2, value);
  } else {
    const [l, t, r, b, value] = args;
    fill(level, rect.left + l, rect.top + t, rect.width() + 1 - (l + r), rect.height() + 1 - (t + b), value);
  }
}

/** Draws `n` cells inwards from a door on the room's edge; returns the cell after the last one drawn. */
export function drawInside(level: Level, room: Room, from: Point, n: number, value: number): Point {
  const step = new Point();
  if (from.x === room.left) step.set(+1, 0);
  else if (from.x === room.right) step.set(-1, 0);
  else if (from.y === room.top) step.set(0, +1);
  else if (from.y === room.bottom) step.set(0, -1);
  const p = from.clone().offset(step);
  for (let i = 0; i < n; i++) {
    if (value !== -1) set(level, p, value);
    p.offset(step);
  }
  return p;
}
