// Port of mechanics/Ballistica.java: Bresenham projectile paths. `trace`/`distance` hold the last cast's path.
import { Dungeon } from '../Dungeon';
import { Actor } from '../actors/Actor';
import { HEIGHT, WIDTH } from '../levels/constants';

export const Ballistica = {
  trace: new Int32Array(Math.max(WIDTH, HEIGHT) * 2),
  distance: 0,

  /** Returns the cell where a projectile from `from` towards `to` stops. */
  cast(from: number, to: number, magic: boolean, hitChars: boolean): number {
    const level = Dungeon.level;
    const w = WIDTH;
    const x0 = from % w;
    const x1 = to % w;
    const y0 = Math.floor(from / w);
    const y1 = Math.floor(to / w);
    let dx = x1 - x0;
    let dy = y1 - y0;
    const stepX = dx > 0 ? +1 : -1;
    const stepY = dy > 0 ? +1 : -1;
    dx = Math.abs(dx);
    dy = Math.abs(dy);

    let stepA: number, stepB: number, dA: number, dB: number;
    if (dx > dy) {
      stepA = stepX;
      stepB = stepY * w;
      dA = dx;
      dB = dy;
    } else {
      stepA = stepY * w;
      stepB = stepX;
      dA = dy;
      dB = dx;
    }

    const trace = Ballistica.trace;
    Ballistica.distance = 1;
    trace[0] = from;
    let cell = from;
    let err = Math.trunc(dA / 2);
    while (cell !== to || magic) {
      cell += stepA;
      err += dB;
      if (err >= dA) {
        err -= dA;
        cell += stepB;
      }
      trace[Ballistica.distance++] = cell;
      if (!level.passable[cell] && !level.avoid[cell]) return trace[--Ballistica.distance - 1];
      if (level.losBlocking[cell] || (hitChars && Actor.findChar(cell) !== null)) return cell;
    }
    trace[Ballistica.distance++] = cell;
    return to;
  },
};
