// PD's Preferences: small per-device options, kept in localStorage (best effort: private modes may refuse).
export interface Prefs {
  /** PixelScene's "Scale up UI": the largest zoom that still fits (PD's default). */
  scaleUp: boolean;
  music: boolean;
  sound: boolean;
  /** Classic turn-based play or the real-time action mode (applies to the next run started or loaded). */
  mode: 'classic' | 'action';
  /** Action mode: characters turn to face where they go (true) or keep facing the camera (false). */
  turnFigures: boolean;
}

const KEY = 'pd3d.prefs';
const DEFAULTS: Prefs = { scaleUp: true, music: true, sound: true, mode: 'action', turnFigures: false };

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

let prefs = read();
const listeners = new Set<(p: Prefs) => void>();

export const Settings = {
  get(): Prefs {
    return prefs;
  },
  set(patch: Partial<Prefs>): void {
    prefs = { ...prefs, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      // Not persisted; the change still applies for this session.
    }
    for (const l of listeners) l(prefs);
  },
  subscribe(fn: (p: Prefs) => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
