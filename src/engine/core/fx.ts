// Visual effects requested by game logic. PD created these as sprites/emitters inline; the port emits events
// with the original effect names so the view can render them faithfully.
import { Events } from './events';

export const Fx = {
  /** emitter().burst(Factory, n) at a cell, or on a character when `id` is given. */
  burst(fx: string, at: { pos?: number; id?: number }, n: number): void {
    Events.emit({ type: 'fx', fx, ...at, n });
  },
  /** CellEmitter.start(factory, interval, quantity): a short stream of particles. */
  start(fx: string, pos: number, interval: number, n: number): void {
    Events.emit({ type: 'fx', fx, pos, v: interval, n });
  },
  splash(pos: number, color: number, n: number): void {
    Events.emit({ type: 'fx', fx: 'splash', pos, color, n });
  },
  flare(id: number, color: number, rays = 6): void {
    Events.emit({ type: 'fx', fx: 'flare', id, color, n: rays });
  },
  shake(intensity: number, duration: number): void {
    Events.emit({ type: 'fx', fx: 'shake', v: intensity, n: duration });
  },
  /** Bolts and rays between cells: MagicMissile variants, Lightning, DeathRay, Beam. */
  bolt(fx: string, from: number, to: number, color?: number): void {
    Events.emit({ type: 'fx', fx, pos: from, to, color });
  },
  blood(id: number, amount: number): void {
    Events.emit({ type: 'fx', fx: 'blood', id, n: amount });
  },
  ripple(pos: number): void {
    Events.emit({ type: 'fx', fx: 'ripple', pos });
  },
  /** Generic named effect at a cell (wound, checked cell, discover tile, flash...). */
  at(fx: string, pos: number, color?: number): void {
    Events.emit({ type: 'fx', fx, pos, color });
  },
};

export const Sample = {
  play(name: string, pos?: number): void {
    Events.emit({ type: 'sound', name, pos });
  },
};
