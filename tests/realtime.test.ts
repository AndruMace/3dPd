import { describe, expect, it } from 'vitest';
import { Dungeon } from '../src/engine/Dungeon';
import { Game } from '../src/engine/Game';
import { Hunger } from '../src/engine/actors/buffs/buffs';
import { Terrain } from '../src/engine/levels/Terrain';
import { LENGTH, WIDTH } from '../src/engine/levels/constants';
import { ActionGame } from '../src/engine/realtime/ActionGame';
import { moveCircle, resolveCircle } from '../src/engine/realtime/collision';
import { Tuning } from '../src/engine/realtime/tuning';

/** A 32x32 map that is all floor except a wall column at x = 5. */
function corridorMap() {
  const map = new Int32Array(LENGTH).fill(Terrain.EMPTY);
  const passable = new Uint8Array(LENGTH).fill(1);
  for (let y = 0; y < 32; y++) {
    map[5 + y * WIDTH] = Terrain.WALL;
    passable[5 + y * WIDTH] = 0;
  }
  return { map, passable };
}

describe('Action mode collision', () => {
  it('pushes circles out of boxes', () => {
    const [x, z] = resolveCircle(0.95, 0.5, 0.12, [{ x0: 1, z0: 0, x1: 2, z1: 1 }]);
    expect(x).toBeCloseTo(0.88);
    expect(z).toBeCloseTo(0.5);
  });

  it('slides along a wall instead of stopping or passing through', () => {
    const { map, passable } = corridorMap();
    // Moving diagonally into the wall at x = 5: x is blocked at 5 - r, z keeps going.
    const [x, z] = moveCircle(map, passable, 4.5, 10.5, 0.12, 1, 1);
    expect(x).toBeCloseTo(5 - 0.12, 5);
    expect(z).toBeCloseTo(11.5, 5);
  });

  it('does not tunnel through a wall at high speed', () => {
    const { map, passable } = corridorMap();
    const [x] = moveCircle(map, passable, 4.5, 10.5, 0.12, 3, 0);
    expect(x).toBeLessThan(5);
  });
});

describe('Action mode world', () => {
  const start = (seed: number) => {
    ActionGame.enable(true);
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    if (Game.prompt) Game.answer(null);
    Game.drainEvents();
  };

  it('walks the hero and updates its cell, field of view and turn clock', () => {
    start(3);
    const hero = Dungeon.hero;
    const body = ActionGame.bodies().get(hero)!;
    const level = Dungeon.level;
    // Pick a passable neighbour direction and push the stick that way for a second.
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const dir = dirs.find(([dx, dz]) => level.passable[hero.pos + dx + dz * WIDTH])!;
    const startCell = hero.pos;
    for (let i = 0; i < 30; i++) ActionGame.update(Tuning.STEP, { moveX: dir[0], moveZ: dir[1] });
    expect(hero.pos).not.toBe(startCell);
    expect(Math.floor(body.x) + Math.floor(body.z) * WIDTH).toBe(hero.pos);
    expect(Dungeon.visible[hero.pos]).toBe(1);
    ActionGame.enable(false);
  });

  it('runs hunger on the world clock: one PD turn per Tuning.TURN seconds', () => {
    start(4);
    const hunger = Dungeon.hero.buff(Hunger)!;
    const before = (hunger as unknown as { level: number }).level;
    // 50 turns of standing still.
    for (let i = 0; i < Math.round((50 * Tuning.TURN) / Tuning.STEP); i++)
      ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    const after = (hunger as unknown as { level: number }).level;
    expect(after - before).toBeGreaterThanOrEqual(40);
    expect(after - before).toBeLessThanOrEqual(60);
    ActionGame.enable(false);
  });

  it('takes the stairs with Interact', () => {
    start(5);
    const hero = Dungeon.hero;
    hero.pos = Dungeon.level.exit;
    ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    expect(ActionGame.interaction()?.kind).toBe('descend');
    ActionGame.interact();
    expect(hero.pendingTransition).toBe('descend');
    Game.transition();
    expect(Dungeon.depth).toBe(2);
    ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    const body = ActionGame.bodies().get(hero)!;
    expect(Math.floor(body.x) + Math.floor(body.z) * WIDTH).toBe(Dungeon.level.entrance);
    ActionGame.enable(false);
  });
});
