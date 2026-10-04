// Ports of Dungeon.findPath / Dungeon.flee: single steps for actors, treating visible characters as obstacles.
import { Dungeon } from '../Dungeon';
import { adjacent, LENGTH } from '../levels/constants';
import { PathFinder } from '../mechanics/PathFinder';
import { Actor } from './Actor';
import type { Char } from './Char';

const passable = new Uint8Array(LENGTH);

function blockVisibleChars(visible: ArrayLike<number>) {
  for (const actor of Actor.all()) {
    if (actor.isChar() && visible[actor.pos]) passable[actor.pos] = 0;
  }
}

export function findPath(ch: Char, from: number, to: number, pass: Uint8Array, visible: ArrayLike<number>): number {
  const level = Dungeon.level;
  if (adjacent(from, to)) {
    return Actor.findChar(to) === null && (pass[to] || level.avoid[to]) ? to : -1;
  }
  if (ch.flying) {
    for (let i = 0; i < LENGTH; i++) passable[i] = pass[i] | level.avoid[i];
  } else {
    passable.set(pass);
  }
  blockVisibleChars(visible);
  return PathFinder.getStep(from, to, passable);
}

export function flee(ch: Char, cur: number, from: number, pass: Uint8Array, visible: ArrayLike<number>): number {
  const level = Dungeon.level;
  if (ch.flying) {
    for (let i = 0; i < LENGTH; i++) passable[i] = pass[i] | level.avoid[i];
  } else {
    passable.set(pass);
  }
  blockVisibleChars(visible);
  passable[cur] = 1;
  return PathFinder.getStepBack(cur, from, passable);
}
