import { h, render } from 'preact';
import { GameController } from './app/GameController';
import { Dungeon } from './engine/Dungeon';
import { Game } from './engine/Game';
import { Storage } from './platform/storage';
import { GameUI } from './ui/GameUI';
import { preloadChrome } from './ui/pixel/components';
import { loadFonts } from './ui/pixel/font';
import './style.css';

const root = document.getElementById('game')!;
const hudRoot = document.getElementById('hud')!;
const game = new GameController(root);

const params = new URLSearchParams(location.search);
const newSeed = () => params.get('seed') ?? Math.floor(Math.random() * 1e9);

const newGame = () => {
  void Storage.remove('game');
  game.start(newSeed());
};

void (async () => {
  await Promise.all([loadFonts(), preloadChrome()]);
  render(h(GameUI, { game, onNewGame: newGame }), hudRoot);
  if (params.has('seed') || !(await game.resume())) game.start(newSeed());
})();

// Exposed for debugging in the console.
Object.assign(window, { game, Game, Dungeon });
