import { h, render } from 'preact';
import { GameController } from './app/GameController';
import { Dungeon } from './engine/Dungeon';
import { Game } from './engine/Game';
import { App } from './ui/App';
import { preloadChrome, preloadImages } from './ui/pixel/components';
import { loadFonts } from './ui/pixel/font';
import './style.css';

const root = document.getElementById('game')!;
const hudRoot = document.getElementById('hud')!;
const game = new GameController(root);

// ?seed=<anything> skips the menus and starts a fixed dungeon (for testing and sharing layouts).
const params = new URLSearchParams(location.search);
const seeded = params.has('seed');
const newSeed = () => params.get('seed') ?? Math.floor(Math.random() * 1e9);

void (async () => {
  await Promise.all([
    loadFonts(),
    preloadChrome(),
    preloadImages([
      'banners.png',
      'dashboard.png',
      'arcs1.png',
      'arcs2.png',
      'avatars.png',
      'icons.png',
      'fireball.png',
      'status_pane.png',
      'toolbar.png',
      'items.png',
      'buffs.png',
      'hp_bar.png',
      'exp_bar.png',
    ]),
  ]);
  if (seeded) game.start(newSeed());
  render(h(App, { game, newSeed, startInGame: seeded }), hudRoot);
})();

// Exposed for debugging in the console.
Object.assign(window, { game, Game, Dungeon });
if (import.meta.env.DEV) void import('./app/devtools').then((m) => m.installDevtools(game));
