// Pixel-UI building blocks: everything is laid out in PD's own pixel units inside a root that is scaled up by an
// integer zoom (PixelScene.defaultZoom), with nearest-neighbour filtering.
import type { ComponentChildren } from 'preact';
import { createContext } from 'preact';
import { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Settings } from '../../platform/settings';
import { chooseFont, drawText, layoutText } from './font';

const ASSETS = `${import.meta.env.BASE_URL}assets/img/`;

export const ZoomContext = createContext(3);
export const useZoom = () => useContext(ZoomContext);

/**
 * PixelScene's defaultZoom: start from 2.5x the density, shrink until at least 128x224 (portrait) or 224x160
 * (landscape) UI pixels fit, then with "Scale up UI" (PD's default) grow while they still fit.
 */
export function computeZoom(width: number, height: number, dpr: number, scaleUp = Settings.get().scaleUp): number {
  const landscape = width > height;
  const minW = landscape ? 224 : 128;
  const minH = landscape ? 160 : 224;
  const w = width * dpr;
  const h = height * dpr;
  let zoom = Math.ceil(dpr * 2.5);
  while ((w / zoom < minW || h / zoom < minH) && zoom > 1) zoom--;
  if (scaleUp) while (w / (zoom + 1) >= minW && h / (zoom + 1) >= minH) zoom++;
  return zoom;
}

/**
 * Root of the pixel UI: children are positioned in UI pixels; the whole tree is scaled by `zoom` device pixels.
 * `width`/`height` are the CSS size of the area it covers (the screen minus safe-area insets).
 */
export function PixelRoot({
  zoom,
  width,
  height,
  children,
}: {
  zoom: number;
  width: number;
  height: number;
  children: ComponentChildren;
}) {
  const dpr = window.devicePixelRatio || 1;
  const cssScale = zoom / dpr;
  return (
    <ZoomContext.Provider value={zoom}>
      <div
        class="pixel-root"
        style={{
          width: `${width / cssScale}px`,
          height: `${height / cssScale}px`,
          transform: `scale(${cssScale})`,
        }}
      >
        {children}
      </div>
    </ZoomContext.Provider>
  );
}

type Style = Record<string, string | number | undefined>;

/** A frame of an atlas image (Image.frame in Noosa). */
export function Img({
  src,
  x,
  y,
  w,
  h,
  style,
  class: cls,
  onClick,
}: {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  style?: Style;
  class?: string;
  onClick?: (e: MouseEvent) => void;
}) {
  return (
    <div
      class={`pixel-img ${cls ?? ''}`}
      onClick={onClick}
      style={{
        width: `${w}px`,
        height: `${h}px`,
        backgroundImage: `url(${ASSETS}${src})`,
        backgroundPosition: `${-x}px ${-y}px`,
        ...style,
      }}
    />
  );
}

/** A 16x16 item sprite from items.png. */
export function ItemIcon({ image, style }: { image: number; style?: Style }) {
  return <Img src="items.png" x={(image % 8) * 16} y={Math.floor(image / 8) * 16} w={16} h={16} style={style} />;
}

/** Noosa NinePatch via CSS border-image: (x,y,w,h) region of the atlas, margins l/t/r/b. */
export function NinePatch({
  src,
  x,
  y,
  w,
  h,
  margin,
  width,
  height,
  style,
  class: cls,
  children,
  onClick,
}: {
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  margin: [number, number, number, number];
  width?: number;
  height?: number;
  style?: Style;
  class?: string;
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
}) {
  const [l, t, r, b] = margin;
  const url = useNinePatchImage(src, x, y, w, h);
  return (
    <div
      class={`pixel-nine ${cls ?? ''}`}
      onClick={onClick}
      style={{
        width: width !== undefined ? `${width}px` : undefined,
        height: height !== undefined ? `${height}px` : undefined,
        borderStyle: 'solid',
        borderWidth: `${t}px ${r}px ${b}px ${l}px`,
        borderColor: 'transparent',
        borderImage: url ? `url(${url}) ${t} ${r} ${b} ${l} fill stretch` : undefined,
        boxSizing: 'border-box',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

const sliceCache = new Map<string, string>();

/** border-image needs the patch as its own image: cut it out of the atlas once (as a data URL). */
function useNinePatchImage(src: string, x: number, y: number, w: number, h: number): string | null {
  const key = `${src}|${x},${y},${w},${h}`;
  const cached = sliceCache.get(key);
  const ref = useRef<string | null>(cached ?? null);
  const [, rerender] = useState(0);
  useEffect(() => {
    if (sliceCache.has(key)) return;
    const cb = () => rerender((n) => n + 1);
    listeners.push(cb);
    return () => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
  }, [key]);
  if (!cached && !pending.has(key)) {
    pending.add(key);
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
      sliceCache.set(key, c.toDataURL());
      pending.delete(key);
      for (const cb of listeners.splice(0)) cb();
    };
    img.src = ASSETS + src;
  }
  ref.current = sliceCache.get(key) ?? null;
  return ref.current;
}
const pending = new Set<string>();
const listeners: (() => void)[] = [];
/** Preloads the nine-patch slices used by the UI so the first frame isn't blank. */
export async function preloadNinePatches(slices: [string, number, number, number, number][]): Promise<void> {
  await Promise.all(
    slices.map(
      ([src, x, y, w, h]) =>
        new Promise<void>((resolve) => {
          const key = `${src}|${x},${y},${w},${h}`;
          if (sliceCache.has(key)) return resolve();
          const img = new Image();
          img.onload = () => {
            const c = document.createElement('canvas');
            c.width = w;
            c.height = h;
            c.getContext('2d')!.drawImage(img, x, y, w, h, 0, 0, w, h);
            sliceCache.set(key, c.toDataURL());
            resolve();
          };
          img.src = ASSETS + src;
        }),
    ),
  );
}

/** Chrome.get(type): the UI's nine-patches. */
export const Chrome = {
  WINDOW: { src: 'chrome.png', x: 0, y: 0, w: 22, h: 22, margin: [7, 7, 7, 7] as [number, number, number, number] },
  TOAST: { src: 'chrome.png', x: 22, y: 0, w: 18, h: 18, margin: [5, 5, 5, 5] as [number, number, number, number] },
  TOAST_TR: { src: 'chrome.png', x: 40, y: 0, w: 18, h: 18, margin: [5, 5, 5, 5] as [number, number, number, number] },
  BUTTON: { src: 'chrome.png', x: 58, y: 0, w: 6, h: 6, margin: [2, 2, 2, 2] as [number, number, number, number] },
  TAG: { src: 'chrome.png', x: 22, y: 18, w: 16, h: 14, margin: [3, 3, 3, 3] as [number, number, number, number] },
  SCROLL: { src: 'chrome.png', x: 32, y: 32, w: 32, h: 32, margin: [5, 11, 5, 11] as [number, number, number, number] },
};

/** Loads whole images into the browser cache so atlas frames (CSS backgrounds) don't pop in. */
export function preloadImages(files: string[]): Promise<void> {
  return Promise.all(
    files.map(
      (f) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = ASSETS + f;
        }),
    ),
  ).then(() => undefined);
}

export function preloadChrome(): Promise<void> {
  return preloadNinePatches([
    ...Object.values(Chrome).map((c) => [c.src, c.x, c.y, c.w, c.h] as [string, number, number, number, number]),
    ['chrome.png', 64, 22, 10, 14],
    ['chrome.png', 74, 22, 10, 14],
  ]);
}

/** BitmapText / BitmapTextMultiline at a PD text size, drawn crisp at device resolution. */
export function Text({
  text,
  size = 6,
  color = '#ffffff',
  maxWidth,
  highlight = false,
  style,
  class: cls,
}: {
  text: string;
  size?: number;
  color?: string;
  /** Wrap width in UI pixels. */
  maxWidth?: number;
  highlight?: boolean;
  style?: Style;
  class?: string;
}) {
  const zoom = useZoom();
  const ref = useRef<HTMLCanvasElement>(null);
  const { font, scale } = chooseFont(size, zoom);
  const layout = useMemo(
    () => layoutText(text, font, maxWidth !== undefined ? (maxWidth * zoom) / scale : Infinity, highlight),
    [text, font, scale, maxWidth, zoom, highlight],
  );
  useLayoutEffect(() => {
    if (ref.current) drawText(ref.current, layout, font, scale, color);
  }, [layout, font, scale, color]);
  const k = scale / zoom; // UI pixels per font pixel
  return (
    <canvas
      ref={ref}
      class={`pixel-text ${cls ?? ''}`}
      style={{ width: `${layout.width * k}px`, height: `${layout.height * k}px`, ...style }}
    />
  );
}

/** Measures text in UI pixels (for layouts that depend on it). */
export function measureText(
  text: string,
  size: number,
  zoom: number,
  maxWidth?: number,
): { width: number; height: number; baseLine: number } {
  const { font, scale } = chooseFont(size, zoom);
  const layout = layoutText(text, font, maxWidth !== undefined ? (maxWidth * zoom) / scale : Infinity);
  const k = scale / zoom;
  return {
    width: layout.width * k,
    height: layout.height * k,
    baseLine: (layout.height - font.lineHeight + font.baseLine) * k,
  };
}
