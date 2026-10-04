// Circles moving through PD's cell grid: solid cells are boxes, door cells add their two brick jambs, and bodies
// slide along whatever they hit. Coordinates are in cells (x = column, z = row; a cell's centre is +0.5).
import { HEIGHT, WIDTH } from '../levels/constants';
import { flags, Terrain as T } from '../levels/Terrain';

/** Width of a door cell's jambs (PD's door tile has a 2-pixel brick frame). */
export const JAMB = 2 / 16;

export const isDoorTerrain = (t: number): boolean => t === T.DOOR || t === T.OPEN_DOOR || t === T.LOCKED_DOOR;

/**
 * Which way the wall through a door cell runs: along x (east-west) unless there are walls above and below it.
 * `isWall` decides what counts as wall around the door.
 */
export function doorRunsAlongX(
  at: (x: number, y: number) => number,
  x: number,
  y: number,
  isWall: (t: number) => boolean,
): boolean {
  return !(isWall(at(x, y - 1)) && isWall(at(x, y + 1))) || (isWall(at(x - 1, y)) && isWall(at(x + 1, y)));
}

export interface Box {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

/** The solid boxes of cell (x, y): the whole cell if it can't be walked through, the jambs of a door, or none. */
export function cellBoxes(map: ArrayLike<number>, passable: ArrayLike<number>, x: number, y: number, out: Box[]): void {
  if (x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT) {
    out.push({ x0: x, z0: y, x1: x + 1, z1: y + 1 });
    return;
  }
  const cell = x + y * WIDTH;
  const t = map[cell];
  if (!passable[cell]) {
    // Extended into solid neighbours, one axis at a time, so the seams between wall cells have no corners to
    // catch on (two boxes cover only solid cells, so inner corners stay open).
    const solid = (cx: number, cy: number) =>
      cx < 0 || cy < 0 || cx >= WIDTH || cy >= HEIGHT || !passable[cx + cy * WIDTH];
    out.push(
      { x0: x - (solid(x - 1, y) ? 1 : 0), z0: y, x1: x + 1 + (solid(x + 1, y) ? 1 : 0), z1: y + 1 },
      { x0: x, z0: y - (solid(x, y - 1) ? 1 : 0), x1: x + 1, z1: y + 1 + (solid(x, y + 1) ? 1 : 0) },
    );
    return;
  }
  if (isDoorTerrain(t)) {
    const at = (cx: number, cy: number) =>
      cx < 0 || cy < 0 || cx >= WIDTH || cy >= HEIGHT ? T.WALL : map[cx + cy * WIDTH];
    const wall = (tt: number) => (flags[tt] & T.PASSABLE) === 0;
    if (doorRunsAlongX(at, x, y, wall)) {
      out.push({ x0: x, z0: y, x1: x + JAMB, z1: y + 1 }, { x0: x + 1 - JAMB, z0: y, x1: x + 1, z1: y + 1 });
    } else {
      out.push({ x0: x, z0: y, x1: x + 1, z1: y + JAMB }, { x0: x, z0: y + 1 - JAMB, x1: x + 1, z1: y + 1 });
    }
  }
}

/**
 * Pushes a circle at (x, z) out of the given boxes, deepest overlap first (so a flat wall face wins over the
 * corner of a neighbouring box at the same spot). Returns the corrected position.
 */
export function resolveCircle(x: number, z: number, r: number, boxes: Box[]): [number, number] {
  for (let iter = 0; iter < 6; iter++) {
    let bestPen = 0;
    let px = 0;
    let pz = 0;
    for (const b of boxes) {
      const cx = Math.max(b.x0, Math.min(x, b.x1));
      const cz = Math.max(b.z0, Math.min(z, b.z1));
      const dx = x - cx;
      const dz = z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      let pen: number;
      let ox: number;
      let oz: number;
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        pen = r - d;
        ox = (dx / d) * pen;
        oz = (dz / d) * pen;
      } else {
        // Centre inside the box: leave by the nearest side.
        const pushes = [b.x0 - r - x, b.x1 + r - x, b.z0 - r - z, b.z1 + r - z];
        let best = 0;
        for (let k = 1; k < 4; k++) if (Math.abs(pushes[k]) < Math.abs(pushes[best])) best = k;
        pen = r + Math.abs(pushes[best]);
        ox = best < 2 ? pushes[best] : 0;
        oz = best < 2 ? 0 : pushes[best];
      }
      if (pen > bestPen) {
        bestPen = pen;
        px = ox;
        pz = oz;
      }
    }
    if (bestPen <= 1e-9) break;
    x += px;
    z += pz;
  }
  return [x, z];
}

/** Moves a circle by (dx, dz) through the grid, sliding along walls; sub-steps so fast moves can't tunnel. */
export function moveCircle(
  map: ArrayLike<number>,
  passable: ArrayLike<number>,
  x: number,
  z: number,
  r: number,
  dx: number,
  dz: number,
): [number, number] {
  const len = Math.hypot(dx, dz);
  const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
  const boxes: Box[] = [];
  for (let s = 0; s < steps; s++) {
    x += dx / steps;
    z += dz / steps;
    boxes.length = 0;
    const cx0 = Math.floor(x - r);
    const cx1 = Math.floor(x + r);
    const cz0 = Math.floor(z - r);
    const cz1 = Math.floor(z + r);
    for (let cy = cz0; cy <= cz1; cy++) for (let cx = cx0; cx <= cx1; cx++) cellBoxes(map, passable, cx, cy, boxes);
    [x, z] = resolveCircle(x, z, r, boxes);
  }
  return [x, z];
}
