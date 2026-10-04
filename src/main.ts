import { h, render } from 'preact';
import { GameController } from './app/GameController';
import { Hud } from './ui/Hud';
import './style.css';

const root = document.getElementById('game')!;
const hudRoot = document.getElementById('hud')!;
const game = new GameController(root);

const params = new URLSearchParams(location.search);
const newSeed = () => params.get('seed') ?? Math.floor(Math.random() * 1e9);

const draw = () => render(h(Hud, { state: game.hud, game, onRestart: () => game.start(newSeed()) }), hudRoot);
game.onHud = draw;
game.start(newSeed());
draw();

// Exposed for debugging in the console.
Object.assign(window, { game });
