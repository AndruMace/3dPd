// Loads PD texture atlases as pixel data and slices them into frames the way PD's TextureFilm does.
import type { PixelSource, Rect } from './voxelize';

const ASSET_ROOT = `${import.meta.env.BASE_URL}assets/img/`;
const cache = new Map<string, Promise<PixelSource>>();

export function loadSheet(file: string): Promise<PixelSource> {
  let p = cache.get(file);
  if (!p) {
    p = new Promise<PixelSource>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0);
        const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
        resolve({ data, width, height });
      };
      img.onerror = () => reject(new Error(`Failed to load ${file}`));
      img.src = ASSET_ROOT + file;
    });
    cache.set(file, p);
  }
  return p;
}

/**
 * Rect of frame `index` in a sheet cut into `fw` x `fh` cells, row-major.
 * With `row` set (hero armor tiers), cells are laid out within that row band only.
 */
export function frameRect(
  sheet: { width: number; height: number },
  fw: number,
  fh: number,
  index: number,
  row?: number,
): Rect {
  const cols = Math.floor(sheet.width / fw);
  const top = row !== undefined ? row * fh : 0;
  return { x: (index % cols) * fw, y: top + Math.floor(index / cols) * fh, w: fw, h: fh };
}

/** Number of cells in a sheet (or in one tier row). */
export function frameCount(sheet: { width: number; height: number }, fw: number, fh: number, perRow = false): number {
  const cols = Math.floor(sheet.width / fw);
  return perRow ? cols : cols * Math.floor(sheet.height / fh);
}
