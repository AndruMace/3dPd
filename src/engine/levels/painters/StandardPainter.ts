// Port of levels/painters/StandardPainter.java, including its themed room variants.
import { Dungeon } from '../../Dungeon';
import type { Point } from '../../core/geom';
import { Random } from '../../core/Random';
import { Generator } from '../../items/Generator';
import { Gold } from '../../items/Gold';
import { WIDTH } from '../constants';
import type { Level } from '../Level';
import type { Room } from '../Room';
import { Terrain } from '../Terrain';
import { drawInside, fill, fillRect, set } from './Painter';

export function paintStandard(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  for (const door of room.connected.values()) door!.setType('REGULAR');

  if (!Dungeon.bossLevel() && Random.Int(5) === 0) {
    // Cases fall through exactly as in the original switch.
    let c = Random.Int(6);
    if (c === 0) {
      if (level.feeling !== 'GRASS') {
        if (Math.min(room.width(), room.height()) >= 4 && Math.max(room.width(), room.height()) >= 6) {
          paintGraveyard(level, room);
          return;
        }
        c = -1;
      } else {
        c = 1; // burned room
      }
    }
    if (c === 1) {
      if (Dungeon.depth > 1) {
        paintBurned(level, room);
        return;
      }
    } else if (c === 2) {
      if (Math.max(room.width(), room.height()) >= 4) {
        paintStriped(level, room);
        return;
      }
    } else if (c === 3) {
      if (room.width() >= 6 && room.height() >= 6) {
        paintStudy(level, room);
        return;
      }
    } else if (c === 4) {
      if (level.feeling !== 'WATER') {
        if (room.connected.size === 2 && room.width() >= 4 && room.height() >= 4) {
          paintBridge(level, room);
          return;
        }
        c = -1;
      } else {
        c = 5; // fissure
      }
    }
    if (c === 5) {
      if (!Dungeon.bossLevel() && !Dungeon.bossLevel(Dungeon.depth + 1) && Math.min(room.width(), room.height()) >= 5) {
        paintFissure(level, room);
        return;
      }
    }
  }

  fillRect(level, room, 1, Terrain.EMPTY);
}

function paintBurned(level: Level, room: Room) {
  for (let i = room.top + 1; i < room.bottom; i++) {
    for (let j = room.left + 1; j < room.right; j++) {
      let t: number = Terrain.EMBERS;
      switch (Random.Int(5)) {
        case 0:
          t = Terrain.EMPTY;
          break;
        case 1:
          t = Terrain.FIRE_TRAP;
          break;
        case 2:
          t = Terrain.SECRET_FIRE_TRAP;
          break;
        case 3:
          t = Terrain.INACTIVE_TRAP;
          break;
      }
      level.map[i * WIDTH + j] = t;
    }
  }
}

function paintGraveyard(level: Level, room: Room) {
  fill(level, room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, Terrain.GRASS);
  const w = room.width() - 1;
  const h = room.height() - 1;
  const nGraves = Math.trunc(Math.max(w, h) / 2);
  const index = Random.Int(nGraves);
  const shift = Random.Int(2);
  for (let i = 0; i < nGraves; i++) {
    const pos =
      w > h
        ? room.left + 1 + shift + i * 2 + (room.top + 2 + Random.Int(h - 2)) * WIDTH
        : room.left + 2 + Random.Int(w - 2) + (room.top + 1 + shift + i * 2) * WIDTH;
    level.drop(i === index ? Generator.random() : new Gold(), pos).type = 'TOMB';
  }
}

function paintStriped(level: Level, room: Room) {
  fill(level, room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, Terrain.EMPTY_SP);
  if (room.width() > room.height()) {
    for (let i = room.left + 2; i < room.right; i += 2)
      fill(level, i, room.top + 1, 1, room.height() - 1, Terrain.HIGH_GRASS);
  } else {
    for (let i = room.top + 2; i < room.bottom; i += 2)
      fill(level, room.left + 1, i, room.width() - 1, 1, Terrain.HIGH_GRASS);
  }
}

function paintStudy(level: Level, room: Room) {
  fill(level, room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, Terrain.BOOKSHELF);
  fill(level, room.left + 2, room.top + 2, room.width() - 3, room.height() - 3, Terrain.EMPTY_SP);
  for (const door of room.doors()) {
    if (door.x === room.left) set(level, door.x + 1, door.y, Terrain.EMPTY);
    else if (door.x === room.right) set(level, door.x - 1, door.y, Terrain.EMPTY);
    else if (door.y === room.top) set(level, door.x, door.y + 1, Terrain.EMPTY);
    else if (door.y === room.bottom) set(level, door.x, door.y - 1, Terrain.EMPTY);
  }
  set(level, room.center(), Terrain.PEDESTAL);
}

function paintBridge(level: Level, room: Room) {
  fill(
    level,
    room.left + 1,
    room.top + 1,
    room.width() - 1,
    room.height() - 1,
    !Dungeon.bossLevel() && !Dungeon.bossLevel(Dungeon.depth + 1) && Random.Int(3) === 0
      ? Terrain.CHASM
      : Terrain.WATER,
  );

  const [door1, door2]: Point[] = room.doors();

  if ((door1.x === room.left && door2.x === room.right) || (door1.x === room.right && door2.x === room.left)) {
    const s = Math.trunc(room.width() / 2);
    drawInside(level, room, door1, s, Terrain.EMPTY_SP);
    drawInside(level, room, door2, s, Terrain.EMPTY_SP);
    fill(level, room.center().x, Math.min(door1.y, door2.y), 1, Math.abs(door1.y - door2.y) + 1, Terrain.EMPTY_SP);
  } else if ((door1.y === room.top && door2.y === room.bottom) || (door1.y === room.bottom && door2.y === room.top)) {
    const s = Math.trunc(room.height() / 2);
    drawInside(level, room, door1, s, Terrain.EMPTY_SP);
    drawInside(level, room, door2, s, Terrain.EMPTY_SP);
    fill(level, Math.min(door1.x, door2.x), room.center().y, Math.abs(door1.x - door2.x) + 1, 1, Terrain.EMPTY_SP);
  } else if (door1.x === door2.x) {
    fill(
      level,
      door1.x === room.left ? room.left + 1 : room.right - 1,
      Math.min(door1.y, door2.y),
      1,
      Math.abs(door1.y - door2.y) + 1,
      Terrain.EMPTY_SP,
    );
  } else if (door1.y === door2.y) {
    fill(
      level,
      Math.min(door1.x, door2.x),
      door1.y === room.top ? room.top + 1 : room.bottom - 1,
      Math.abs(door1.x - door2.x) + 1,
      1,
      Terrain.EMPTY_SP,
    );
  } else if (door1.y === room.top || door1.y === room.bottom) {
    drawInside(level, room, door1, Math.abs(door1.y - door2.y), Terrain.EMPTY_SP);
    drawInside(level, room, door2, Math.abs(door1.x - door2.x), Terrain.EMPTY_SP);
  } else if (door1.x === room.left || door1.x === room.right) {
    drawInside(level, room, door1, Math.abs(door1.x - door2.x), Terrain.EMPTY_SP);
    drawInside(level, room, door2, Math.abs(door1.y - door2.y), Terrain.EMPTY_SP);
  }
}

function paintFissure(level: Level, room: Room) {
  fill(level, room.left + 1, room.top + 1, room.width() - 1, room.height() - 1, Terrain.EMPTY);
  for (let i = room.top + 2; i < room.bottom - 1; i++) {
    for (let j = room.left + 2; j < room.right - 1; j++) {
      const v = Math.min(i - room.top, room.bottom - i);
      const h = Math.min(j - room.left, room.right - j);
      if (Math.min(v, h) > 2 || Random.Int(2) === 0) set(level, j, i, Terrain.CHASM);
    }
  }
}
