// The engine's only output channel to the view: an ordered list of what happened, drained after each step.
// The view replays these as animations; the engine itself never waits on them.

export type StatusColor = 'default' | 'positive' | 'negative' | 'warning' | 'neutral';

/** CharSprite.State: persistent visual states of a character. */
export type CharState = 'BURNING' | 'LEVITATING' | 'INVISIBLE' | 'PARALYSED' | 'FROZEN' | 'ILLUMINATED';

export type GameEvent =
  | { type: 'spawn'; id: number; sprite: string; pos: number }
  | { type: 'move'; id: number; from: number; to: number }
  | { type: 'place'; id: number; pos: number }
  | { type: 'attack'; id: number; target: number }
  | { type: 'damage'; id: number; amount: number; hp: number; ht: number }
  | { type: 'status'; id: number; text: string; color: StatusColor }
  | { type: 'die'; id: number }
  | { type: 'remove'; id: number }
  | { type: 'alert'; id: number }
  | { type: 'turn'; id: number; from: number; to: number }
  | { type: 'terrain'; cell: number; value: number }
  | { type: 'observe'; visible: Uint8Array; visited: Uint8Array; mapped: Uint8Array }
  | { type: 'sound'; name: string; pos?: number }
  | { type: 'log'; text: string; kind: 'info' | 'positive' | 'negative' | 'warning' | 'highlight' }
  | {
      type: 'level';
      depth: number;
      /** Snapshot of the new level as the view should first show it. */
      tiles: string;
      water: string;
      map: Int32Array;
      heroId: number;
      chars: { id: number; sprite: string; pos: number; hp: number; ht: number }[];
      heaps: { pos: number; image: number; type: string }[];
    }
  | { type: 'heroDied' }
  /** A visual effect: particle bursts/emitters (fx = PD factory name), splashes, flares, shakes, bolts... */
  | { type: 'fx'; fx: string; pos?: number; id?: number; to?: number; color?: number; n?: number; v?: number }
  | { type: 'charState'; id: number; state: CharState; on: boolean }
  /** A heap changed: image -1 means it is gone. `from` animates a drop from that cell. */
  | { type: 'heap'; pos: number; image: number; heapType: string; glow: number | null; from?: number }
  /** A thrown item or projectile travelling between cells (blocks playback while in flight). */
  | { type: 'missile'; from: number; to: number; image: number }
  /** A one-shot sprite animation: zap, operate, read (blocks playback). */
  | { type: 'anim'; id: number; anim: 'zap' | 'operate' | 'read'; target?: number }
  /** HP changed without damage (healing, level up). */
  | { type: 'hp'; id: number; hp: number; ht: number }
  /** The hero picked something up (toolbar pickup animation). */
  | { type: 'pickUp'; image: number }
  /** A blob's cells after it evolved: flat [cell, amount, cell, amount, ...] pairs. */
  | { type: 'blob'; blob: string; cells: number[] }
  /** A plant grew (image = plants.png index) or withered (image -1). */
  | { type: 'plant'; pos: number; image: number }
  /** Armor tier changed (hero sprite row). */
  | { type: 'tier'; id: number; tier: number };

let queue: GameEvent[] = [];
let muted = 0;

export const Events = {
  emit(e: GameEvent): void {
    if (muted === 0) queue.push(e);
  },
  /** Run `fn` without emitting events (level generation and loading). */
  muted<T>(fn: () => T): T {
    muted++;
    try {
      return fn();
    } finally {
      muted--;
    }
  },
  drain(): GameEvent[] {
    const out = queue;
    queue = [];
    return out;
  },
  clear(): void {
    queue = [];
  },
};

export const GLog = {
  i: (text: string) => Events.emit({ type: 'log', text, kind: 'info' }),
  p: (text: string) => Events.emit({ type: 'log', text, kind: 'positive' }),
  n: (text: string) => Events.emit({ type: 'log', text, kind: 'negative' }),
  w: (text: string) => Events.emit({ type: 'log', text, kind: 'warning' }),
  h: (text: string) => Events.emit({ type: 'log', text, kind: 'highlight' }),
};
