// The engine's only output channel to the view: an ordered list of what happened, drained after each step.
// The view replays these as animations; the engine itself never waits on them.

export type StatusColor = 'default' | 'positive' | 'negative' | 'warning' | 'neutral';

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
  | { type: 'heroDied' };

let queue: GameEvent[] = [];

export const Events = {
  emit(e: GameEvent): void {
    queue.push(e);
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
