// A PD tile sheet (16x16 cells, 16 per row) as a Three.js texture, plus UV lookup by terrain index.
import * as THREE from 'three';
import { loadSheet } from '../voxel/sheets';
import type { PixelSource } from '../voxel/voxelize';

export const TILE = 16;

export class TileAtlas {
  readonly cols: number;
  readonly rows: number;

  constructor(
    readonly file: string,
    readonly texture: THREE.Texture,
    readonly pixels: PixelSource,
  ) {
    const img = texture.image as { width: number; height: number };
    this.cols = Math.floor(img.width / TILE);
    this.rows = Math.floor(img.height / TILE);
  }

  static async load(file: string): Promise<TileAtlas> {
    const [tex, pixels] = await Promise.all([
      new THREE.TextureLoader().loadAsync(`${import.meta.env.BASE_URL}assets/img/${file}`),
      loadSheet(file),
    ]);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    return new TileAtlas(file, tex, pixels);
  }

  /** [u0, v0, u1, v1] for a tile index, inset slightly to avoid sampling neighbors. */
  uv(index: number): [number, number, number, number] {
    const col = index % this.cols;
    const row = Math.floor(index / this.cols);
    const eps = 0.02 / (this.cols * TILE);
    const u0 = col / this.cols + eps;
    const u1 = (col + 1) / this.cols - eps;
    const v1 = 1 - row / this.rows - eps;
    const v0 = 1 - (row + 1) / this.rows + eps;
    return [u0, v0, u1, v1];
  }
}
