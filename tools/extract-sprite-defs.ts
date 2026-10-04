// Generates src/content/generated/spriteDefs.json from the original *Sprite.java classes.
// Each sprite becomes { texture, frameWidth, frameHeight, animations: { name: { fps, loop, frames } } },
// matching how PD's TextureFilm/Animation lay frames out (row-major cells of frameWidth x frameHeight).
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { GENERATED, PD_ASSETS, PD_SRC } from './paths.ts';

export interface AnimationDef {
  fps: number;
  loop: boolean;
  frames: number[];
}
export interface SpriteDef {
  texture: string;
  frameWidth: number;
  frameHeight: number;
  /** Hero sheets hold one row per armor tier; frames index within that row. */
  rowsAreTiers?: boolean;
  animations: Record<string, AnimationDef>;
}

const SPRITES_DIR = path.join(PD_SRC, 'sprites');

// Sprites that are not characters, or that build their visuals procedurally.
const SKIP = new Set([
  'CharSprite',
  'MobSprite',
  'ItemSprite',
  'ItemSpriteSheet',
  'MissileSprite',
  'PlantSprite',
  'DiscardedItemSprite',
]);

function parseAssets(): Record<string, string> {
  const src = readFileSync(path.join(PD_SRC, 'Assets.java'), 'utf8');
  const map: Record<string, string> = {};
  for (const m of src.matchAll(/static final String\s+(\w+)\s*=\s*"([^"]+)"/g)) map[m[1]] = m[2];
  return map;
}

function pngSize(file: string): { width: number; height: number } {
  const buf = readFileSync(path.join(PD_ASSETS, file));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function intConstants(src: string): Record<string, number> {
  const consts: Record<string, number> = {};
  for (const m of src.matchAll(/static final int\s+(\w+)\s*=\s*(-?\d+)\s*;/g)) consts[m[1]] = Number(m[2]);
  return consts;
}

function num(token: string, consts: Record<string, number>): number {
  const t = token.trim();
  if (/^-?\d+(\.\d+)?f?$/.test(t)) return parseFloat(t);
  if (t in consts) return consts[t];
  throw new Error(`Unresolved numeric token "${t}"`);
}

interface Parsed {
  name: string;
  parent: string;
  def: Partial<SpriteDef> & { animations: Record<string, AnimationDef> };
}

function parseSprite(file: string, assets: Record<string, string>): Parsed {
  const raw = stripComments(readFileSync(path.join(SPRITES_DIR, file), 'utf8'));
  const name = path.basename(file, '.java');
  const parent = /class\s+\w+\s+extends\s+(\w+)/.exec(raw)?.[1] ?? '';
  const consts = intConstants(raw);
  const def: Parsed['def'] = { animations: {} };

  // Only the constructor (or updateArmor for the hero) defines the base animations.
  const tex = /texture\(\s*Assets\.(\w+)\s*\)/.exec(raw);
  if (tex) def.texture = assets[tex[1]];

  if (/new TextureFilm\(\s*(HeroSprite\.)?tiers\(\)/.test(raw)) {
    // Hero-style sheets: one row per armor tier, frames laid out along the row.
    def.frameWidth = consts.FRAME_WIDTH ?? 12;
    def.frameHeight = consts.FRAME_HEIGHT ?? 15;
    def.rowsAreTiers = true;
  } else {
    const film = /new TextureFilm\(\s*texture\s*,([^)]*)\)/.exec(raw);
    if (film) {
      const args = film[1].split(',').map((s) => s.trim());
      def.frameWidth = num(args[0], consts);
      if (args[1] !== undefined) def.frameHeight = num(args[1], consts);
    }
  }

  for (const m of raw.matchAll(/(\w+)\s*=\s*new Animation\(\s*([^,]+),\s*(true|false)\s*\)/g)) {
    def.animations[m[1]] = { fps: num(m[2], consts), loop: m[3] === 'true', frames: [] };
  }
  for (const m of raw.matchAll(/(\w+)\.frames\(\s*\w+\s*,([\s\S]*?)\)\s*;/g)) {
    const anim = def.animations[m[1]];
    if (anim) anim.frames = m[2].split(',').map((s) => num(s, consts));
  }
  for (const m of raw.matchAll(/(\w+)\s*=\s*(\w+)\.clone\(\)/g)) {
    const src = def.animations[m[2]];
    if (src) def.animations[m[1]] = { ...src, frames: [...src.frames] };
  }
  return { name, parent, def };
}

export function extractSpriteDefs(): Record<string, SpriteDef> {
  const assets = parseAssets();
  const parsed = new Map<string, Parsed>();
  for (const file of readdirSync(SPRITES_DIR).filter((f) => f.endsWith('.java'))) {
    const p = parseSprite(file, assets);
    if (!SKIP.has(p.name)) parsed.set(p.name, p);
  }

  const resolved: Record<string, SpriteDef> = {};
  const resolve = (name: string): Parsed['def'] => {
    const p = parsed.get(name);
    if (!p) return { animations: {} };
    const base = parsed.has(p.parent) ? resolve(p.parent) : { animations: {} };
    return { ...base, ...p.def, animations: { ...base.animations, ...p.def.animations } };
  };

  for (const [name, p] of parsed) {
    const d = resolve(name);
    // PD sprites whose height is omitted use the full texture height (e.g. CrabSprite: new TextureFilm(texture, 16)).
    if (d.frameHeight === undefined && d.texture) d.frameHeight = pngSize(d.texture).height;
    if (!d.texture && !d.rowsAreTiers) {
      console.warn(`skip ${name}: no texture`);
      continue;
    }
    if (d.frameWidth === undefined) {
      console.warn(`skip ${name}: no TextureFilm`);
      continue;
    }
    const key = name.replace(/Sprite$/, '');
    resolved[key] = {
      texture: d.texture ?? '',
      frameWidth: d.frameWidth,
      frameHeight: d.frameHeight!,
      ...(d.rowsAreTiers ? { rowsAreTiers: true } : {}),
      animations: d.animations,
    };
    if (p.def.animations && Object.values(d.animations).some((a) => a.frames.length === 0)) {
      console.warn(`warn ${name}: animation without frames`);
    }
  }
  return resolved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const defs = extractSpriteDefs();
  // Hero sprites take their sheet from the hero class at runtime; expose one entry per class sheet.
  const hero = defs['Hero'];
  delete defs['Mirror']; // Mirror image reuses the hero sheet with the same frames.
  if (hero) {
    delete defs['Hero'];
    for (const [cls, tex] of [
      ['Warrior', 'warrior.png'],
      ['Mage', 'mage.png'],
      ['Rogue', 'rogue.png'],
      ['Huntress', 'ranger.png'],
    ]) {
      defs[`Hero${cls}`] = { ...hero, texture: tex };
    }
  }
  mkdirSync(GENERATED, { recursive: true });
  writeFileSync(path.join(GENERATED, 'spriteDefs.json'), JSON.stringify(defs, null, 1));
  console.log(`wrote ${Object.keys(defs).length} sprite defs`);
}
