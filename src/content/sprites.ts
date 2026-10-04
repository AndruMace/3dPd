// Character sprite definitions extracted from the original *Sprite.java classes (see tools/extract-sprite-defs.ts).
import defs from './generated/spriteDefs.json';

export interface AnimationDef {
  fps: number;
  loop: boolean;
  frames: number[];
}

export interface SpriteDef {
  texture: string;
  frameWidth: number;
  frameHeight: number;
  /** Hero sheets: one row per armor tier. */
  rowsAreTiers?: boolean;
  animations: Record<string, AnimationDef>;
}

export const SPRITES = defs as Record<string, SpriteDef>;
export type SpriteId = keyof typeof defs;
