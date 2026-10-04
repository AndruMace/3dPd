// PD's feature tiles (grass blades, statues, signs, the alchemy pot) are painted over a copy of a floor tile.
// Subtracting that floor tile recovers just the feature, which can then be stood up or voxelized in 3D.
import type { PixelSource } from '../voxel/voxelize';
import { TILE } from './TileAtlas';

export function tileForeground(sheet: PixelSource, index: number, base: number, tolerance = 6): PixelSource {
  const cols = Math.floor(sheet.width / TILE);
  const ox = (index % cols) * TILE;
  const oy = Math.floor(index / cols) * TILE;
  const bx = (base % cols) * TILE;
  const by = Math.floor(base / cols) * TILE;
  const data = new Uint8ClampedArray(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const s = ((oy + y) * sheet.width + ox + x) * 4;
      const b = ((by + y) * sheet.width + bx + x) * 4;
      const same =
        Math.abs(sheet.data[s] - sheet.data[b]) <= tolerance &&
        Math.abs(sheet.data[s + 1] - sheet.data[b + 1]) <= tolerance &&
        Math.abs(sheet.data[s + 2] - sheet.data[b + 2]) <= tolerance;
      const d = (y * TILE + x) * 4;
      data[d] = sheet.data[s];
      data[d + 1] = sheet.data[s + 1];
      data[d + 2] = sheet.data[s + 2];
      data[d + 3] = same ? 0 : sheet.data[s + 3];
    }
  }
  return { width: TILE, height: TILE, data };
}
