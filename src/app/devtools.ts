// Dev-only helpers for driving the game from the console or automated checks, which also work while the page is
// hidden (when requestAnimationFrame is paused): frames are stepped manually with a fixed timestep.
import type { GameController } from './GameController';

export function installDevtools(game: GameController): void {
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const dev = {
    /** Steps `n` frames of 1/20 s. */
    run(n = 1): void {
      for (let i = 0; i < n; i++) game.frame(1 / 20);
    },
    /** Steps frames until `cond` holds (yielding so loads and timers progress). */
    async until(cond: () => boolean, ms = 15000): Promise<boolean> {
      const t0 = performance.now();
      while (!cond() && performance.now() - t0 < ms) {
        game.frame(1 / 20);
        await tick();
      }
      return cond();
    },
    /** Plays until the hero awaits a command, dismissing message windows on the way. */
    async settle(ms = 15000): Promise<boolean> {
      return dev.until(() => {
        const p = game.state.prompt;
        if (p && p.kind === 'message') game.answer(null);
        return (
          (game.state.ready && game.state.prompt === null) || game.state.dead !== null || (!!p && p.kind !== 'message')
        );
      }, ms);
    },
  };
  Object.assign(window, { dev });
}
