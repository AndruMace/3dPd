// Ports of EntrancePainter.java and ExitPainter.java.
import { WIDTH } from '../constants';
import type { Level } from '../Level';
import type { Room } from '../Room';
import { Terrain } from '../Terrain';
import { fillRect, set } from './Painter';

export function paintEntrance(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  for (const door of room.connected.values()) door!.setType('REGULAR');
  level.entrance = room.random(1);
  set(level, level.entrance, Terrain.ENTRANCE);
}

export function paintExit(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  for (const door of room.connected.values()) door!.setType('REGULAR');
  level.exit = room.random(1);
  set(level, level.exit, Terrain.EXIT);
}

export function paintBossExit(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  for (const door of room.connected.values()) door!.setType('REGULAR');
  level.exit = room.top * WIDTH + Math.trunc((room.left + room.right) / 2);
  set(level, level.exit, Terrain.LOCKED_EXIT);
}
