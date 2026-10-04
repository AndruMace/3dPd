import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REF = path.join(ROOT, 'reference');
export const PD = path.join(REF, 'pixel-dungeon');
export const PD_SRC = path.join(PD, 'src/com/watabou/pixeldungeon');
export const PD_ASSETS = path.join(PD, 'assets');
export const OUT_ASSETS = path.join(ROOT, 'public/assets');
export const GENERATED = path.join(ROOT, 'src/content/generated');
