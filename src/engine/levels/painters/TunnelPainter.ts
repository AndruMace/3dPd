// Ports of TunnelPainter.java and PassagePainter.java: corridors through "rooms" that are just connectors.
import { Point } from '../../core/geom';
import { Random } from '../../core/Random';
import type { Level } from '../Level';
import type { Room } from '../Room';
import { set } from './Painter';

export function paintTunnel(level: Level, room: Room): void {
  const floor = level.tunnelTile();
  const c = room.center();
  const doors = room.doors();

  if (room.width() > room.height() || (room.width() === room.height() && Random.Int(2) === 0)) {
    let from = room.right - 1;
    let to = room.left + 1;
    for (const door of doors) {
      const step = door.y < c.y ? +1 : -1;
      if (door.x === room.left) {
        from = room.left + 1;
        for (let i = door.y; i !== c.y; i += step) set(level, from, i, floor);
      } else if (door.x === room.right) {
        to = room.right - 1;
        for (let i = door.y; i !== c.y; i += step) set(level, to, i, floor);
      } else {
        if (door.x < from) from = door.x;
        if (door.x > to) to = door.x;
        for (let i = door.y + step; i !== c.y; i += step) set(level, door.x, i, floor);
      }
    }
    for (let i = from; i <= to; i++) set(level, i, c.y, floor);
  } else {
    let from = room.bottom - 1;
    let to = room.top + 1;
    for (const door of doors) {
      const step = door.x < c.x ? +1 : -1;
      if (door.y === room.top) {
        from = room.top + 1;
        for (let i = door.x; i !== c.x; i += step) set(level, i, from, floor);
      } else if (door.y === room.bottom) {
        to = room.bottom - 1;
        for (let i = door.x; i !== c.x; i += step) set(level, i, to, floor);
      } else {
        if (door.y < from) from = door.y;
        if (door.y > to) to = door.y;
        for (let i = door.x + step; i !== c.x; i += step) set(level, i, door.y, floor);
      }
    }
    for (let i = from; i <= to; i++) set(level, c.x, i, floor);
  }

  for (const door of doors) door.setType('TUNNEL');
}

export function paintPassage(level: Level, room: Room): void {
  const pasWidth = room.width() - 2;
  const pasHeight = room.height() - 2;
  const floor = level.tunnelTile();

  const xy2p = (xy: Point): number => {
    if (xy.y === room.top) return xy.x - room.left - 1;
    if (xy.x === room.right) return xy.y - room.top - 1 + pasWidth;
    if (xy.y === room.bottom) return room.right - xy.x - 1 + pasWidth + pasHeight;
    if (xy.y === room.top + 1) return 0;
    return room.bottom - xy.y - 1 + pasWidth * 2 + pasHeight;
  };
  const p2xy = (p: number): Point => {
    if (p < pasWidth) return new Point(room.left + 1 + p, room.top + 1);
    if (p < pasWidth + pasHeight) return new Point(room.right - 1, room.top + 1 + (p - pasWidth));
    if (p < pasWidth * 2 + pasHeight) return new Point(room.right - 1 - (p - (pasWidth + pasHeight)), room.bottom - 1);
    return new Point(room.left + 1, room.bottom - 1 - (p - (pasWidth * 2 + pasHeight)));
  };

  const joints = room
    .doors()
    .map(xy2p)
    .sort((a, b) => a - b);
  const nJoints = joints.length;
  const perimeter = pasWidth * 2 + pasHeight * 2;
  let start = 0;
  let maxD = joints[0] + perimeter - joints[nJoints - 1];
  for (let i = 1; i < nJoints; i++) {
    const d = joints[i] - joints[i - 1];
    if (d > maxD) {
      maxD = d;
      start = i;
    }
  }
  const end = (start + nJoints - 1) % nJoints;
  let p = joints[start];
  do {
    set(level, p2xy(p), floor);
    p = (p + 1) % perimeter;
  } while (p !== joints[end]);
  set(level, p2xy(p), floor);

  for (const door of room.doors()) door.setType('TUNNEL');
}
