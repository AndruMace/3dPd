// PD's bitmap fonts (BitmapText.Font.colorMarked + BitmapTextMultiline layout + Highlighter), drawn to canvases.
const ASSETS = `${import.meta.env.BASE_URL}assets/img/`;

const LATIN_FULL =
  ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~\u007f';

interface Glyph {
  x: number;
  w: number;
}

export class BitmapFont {
  readonly glyphs = new Map<string, Glyph>();
  lineHeight: number;

  constructor(
    readonly image: HTMLImageElement,
    readonly height: number,
    readonly baseLine: number,
    readonly tracking: number,
  ) {
    this.lineHeight = height;
  }

  /** Port of Font.splitBy: glyphs are separated by fully transparent columns. */
  static async load(file: string, height: number | null, baseLine: number, tracking: number): Promise<BitmapFont> {
    // onload rather than img.decode(): decode() stays pending while the page is in the background.
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error(`Failed to load ${file}`));
      i.src = ASSETS + file;
    });
    const h = height ?? img.height;
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, h).data;
    const width = img.width;
    const empty = (col: number) => {
      for (let j = 0; j < h; j++) if (data[(j * width + col) * 4 + 3] !== 0) return false;
      return true;
    };

    const font = new BitmapFont(img, h, baseLine, tracking);
    let pos = 0;
    while (pos < width && empty(pos)) pos++;
    font.glyphs.set(' ', { x: 0, w: pos });
    for (const ch of LATIN_FULL) {
      if (ch === ' ') continue;
      let separator = pos;
      do {
        if (++separator >= width) break;
      } while (!empty(separator));
      font.glyphs.set(ch, { x: pos, w: separator - pos });
      pos = separator + 1;
    }
    return font;
  }

  glyph(ch: string): Glyph {
    return this.glyphs.get(ch) ?? this.glyphs.get('?')!;
  }

  wordWidth(word: string): number {
    let w = 0;
    for (const ch of word) w += this.glyph(ch).w + (w > 0 ? this.tracking : 0);
    return w;
  }
}

export interface Fonts {
  font1x: BitmapFont;
  font15x: BitmapFont;
  font2x: BitmapFont;
  font25x: BitmapFont;
  font3x: BitmapFont;
}

let fonts: Fonts | null = null;

export async function loadFonts(): Promise<Fonts> {
  if (fonts) return fonts;
  const [font1x, font15x, font2x, font25x, font3x] = await Promise.all([
    BitmapFont.load('font1x.png', null, 6, -1),
    BitmapFont.load('font15x.png', 12, 9, -1),
    BitmapFont.load('font2x.png', 14, 11, -1),
    BitmapFont.load('font25x.png', 17, 13, -1),
    BitmapFont.load('font3x.png', 22, 17, -2),
  ]);
  fonts = { font1x, font15x, font2x, font25x, font3x };
  return fonts;
}

export function getFonts(): Fonts {
  if (!fonts) throw new Error('fonts not loaded');
  return fonts;
}

/** PixelScene.chooseFont: pick a font and an integer device-pixel scale for a text size at a UI zoom. */
export function chooseFont(size: number, zoom: number): { font: BitmapFont; scale: number } {
  const f = getFonts();
  const pt = size * zoom;
  let font: BitmapFont;
  let scale: number;
  if (pt >= 19) {
    scale = pt / 19;
    if (scale >= 1.5 && scale < 2) {
      font = f.font25x;
      scale = Math.trunc(pt / 14);
    } else {
      font = f.font3x;
      scale = Math.trunc(scale);
    }
  } else if (pt >= 14) {
    scale = pt / 14;
    if (scale >= 1.8 && scale < 2) {
      font = f.font2x;
      scale = Math.trunc(pt / 12);
    } else {
      font = f.font25x;
      scale = Math.trunc(scale);
    }
  } else if (pt >= 12) {
    scale = pt / 12;
    if (scale >= 1.7 && scale < 2) {
      font = f.font15x;
      scale = Math.trunc(pt / 10);
    } else {
      font = f.font2x;
      scale = Math.trunc(scale);
    }
  } else if (pt >= 10) {
    scale = pt / 10;
    if (scale >= 1.4 && scale < 2) {
      font = f.font1x;
      scale = Math.trunc(pt / 7);
    } else {
      font = f.font15x;
      scale = Math.trunc(scale);
    }
  } else {
    font = f.font1x;
    scale = Math.max(1, Math.trunc(pt / 7));
  }
  return { font, scale: Math.max(1, scale) };
}

export interface PlacedGlyph {
  ch: string;
  x: number;
  y: number;
  highlight: boolean;
}

export interface TextLayout {
  glyphs: PlacedGlyph[];
  /** Size in font pixels. */
  width: number;
  height: number;
  lines: number;
}

/**
 * BitmapTextMultiline layout, with Highlighter's "_word_" markers turned into highlighted glyphs.
 * maxWidth is in font pixels (Infinity for single-line text).
 */
export function layoutText(text: string, font: BitmapFont, maxWidth = Infinity, highlight = false): TextLayout {
  // Highlighter: strip underscores, remember which characters were between them.
  let clean = text;
  const mask: boolean[] = [];
  if (highlight) {
    clean = '';
    let on = false;
    for (const ch of text) {
      if (ch === '_') {
        on = !on;
        continue;
      }
      clean += ch;
      mask.push(on);
    }
  }

  const glyphs: PlacedGlyph[] = [];
  const space = font.glyph(' ').w;
  let width = 0;
  let height = 0;
  let lineWidth = 0;
  let lineHeight = 0;
  let y = 0;
  let lines = 0;
  let pos = 0;
  const newLine = () => {
    height += lineHeight || font.lineHeight;
    width = Math.max(width, lineWidth);
    lineWidth = 0;
    lineHeight = 0;
    y = height;
    lines++;
  };

  const paragraphs = clean.split('\n');
  for (let p = 0; p < paragraphs.length; p++) {
    const parts = paragraphs[p].split(/(\s+)/);
    for (const part of parts) {
      if (part.length === 0) continue;
      if (/^\s+$/.test(part)) {
        pos += part.length;
        if (lineWidth > 0 && lineWidth + font.tracking + space > maxWidth) newLine();
        else lineWidth += (lineWidth > 0 ? font.tracking : 0) + space;
        continue;
      }
      const w = font.wordWidth(part);
      if (lineWidth > 0 && lineWidth + font.tracking + w > maxWidth) newLine();
      let x = lineWidth + (lineWidth > 0 ? font.tracking : 0);
      for (const ch of part) {
        glyphs.push({ ch, x, y, highlight: !!mask[pos] });
        x += font.glyph(ch).w + font.tracking;
        pos++;
      }
      lineWidth += (lineWidth > 0 ? font.tracking : 0) + w;
      lineHeight = font.lineHeight;
    }
    if (p < paragraphs.length - 1) pos++;
    newLine();
  }
  return { glyphs, width, height, lines };
}

const tintCache = new Map<string, HTMLCanvasElement>();

/** The font image recoloured (PD's hardlight: solid colour, glyph alpha). */
function tinted(font: BitmapFont, color: string): HTMLCanvasElement {
  const key = `${font.image.src}|${color}`;
  let c = tintCache.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = font.image.width;
    c.height = font.image.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(font.image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, c.width, c.height);
    tintCache.set(key, c);
  }
  return c;
}

/** Draws laid-out text into a canvas at `scale` device pixels per font pixel. */
export function drawText(
  canvas: HTMLCanvasElement,
  layout: TextLayout,
  font: BitmapFont,
  scale: number,
  color: string,
  highlightColor = '#ffff44',
): void {
  canvas.width = Math.max(1, Math.ceil(layout.width * scale));
  canvas.height = Math.max(1, Math.ceil(layout.height * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const normal = tinted(font, color);
  const hl = tinted(font, highlightColor);
  for (const g of layout.glyphs) {
    const glyph = font.glyph(g.ch);
    ctx.drawImage(
      g.highlight ? hl : normal,
      glyph.x,
      0,
      glyph.w,
      font.height,
      g.x * scale,
      g.y * scale,
      glyph.w * scale,
      font.height * scale,
    );
  }
}
