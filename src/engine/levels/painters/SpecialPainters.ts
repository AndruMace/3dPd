// Ports of the special room painters in levels/painters/.
import { Dungeon } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import {
  Alchemy,
  Foliage,
  SacrificialFire,
  WaterOfAwareness,
  WaterOfHealth,
  WaterOfTransmutation,
  type WellWater,
} from '../../actors/blobs/blobs';
import { Piranha, Statue } from '../../actors/mobs/mobs';
import { RatKing } from '../../actors/mobs/npcs';
import { Point } from '../../core/geom';
import { classNameOf } from '../../core/Bundle';
import { Random } from '../../core/Random';
import { Generator, type Category } from '../../items/Generator';
import type { Item } from '../../items/Item';
import { GoldenKey, IronKey } from '../../items/keys';
import { Bomb, Gold, Honeypot } from '../../items/misc';
import { Potion } from '../../items/potions/Potion';
import { PotionOfInvisibility, PotionOfLevitation, PotionOfLiquidFlame } from '../../items/potions/potions';
import { Scroll } from '../../items/scrolls/Scroll';
import { MissileWeapon } from '../../items/weapon/missiles';
import { SungrassSeed } from '../../plants/plants';
import { NEIGHBOURS8, WIDTH } from '../constants';
import type { Level } from '../Level';
import type { Room } from '../Room';
import { Terrain } from '../Terrain';
import { drawInside, fill, fillRect, set } from './Painter';

const oneOf = (...cats: Category[]): Category => Random.oneOf(...cats);

/** Best of n+1 rolls of weapons/armor (the common "prize" pattern). */
function bestOf(level: Level, extra: number, ...cats: Category[]): Item {
  const fromSpawn = level.itemToSpanAsPrize();
  if (fromSpawn) return fromSpawn;
  let prize = Generator.random(oneOf(...cats));
  for (let i = 0; i < extra; i++) {
    const another = Generator.random(oneOf(...cats));
    if (another.level() > prize.level()) prize = another;
  }
  return prize;
}

function emptyCell(level: Level, room: Room, floor: number = Terrain.EMPTY): number {
  let pos: number;
  do {
    pos = room.random();
  } while (level.map[pos] !== floor || level.heaps.has(pos));
  return pos;
}

export function paintArmory(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const entrance = room.entrance();
  let statue: Point | null = null;
  if (entrance.x === room.left)
    statue = new Point(room.right - 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.x === room.right)
    statue = new Point(room.left + 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.y === room.top)
    statue = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.bottom - 1);
  else if (entrance.y === room.bottom)
    statue = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.top + 1);
  if (statue) set(level, statue, Terrain.STATUE);

  const n = 3 + (Random.Int(4) === 0 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const pos = emptyCell(level, room);
    level.drop(Random.Int(6) === 0 ? new Bomb().random() : Generator.random(oneOf('ARMOR', 'WEAPON')), pos);
  }
  entrance.setType('LOCKED');
  level.addItemToSpawn(new IronKey());
}

export function paintWeakFloor(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.CHASM);
  const door = room.entrance();
  door.setType('REGULAR');
  if (door.x === room.left) {
    for (let i = room.top + 1; i < room.bottom; i++)
      drawInside(level, room, new Point(room.left, i), Random.IntRange(1, room.width() - 2), Terrain.EMPTY_SP);
  } else if (door.x === room.right) {
    for (let i = room.top + 1; i < room.bottom; i++)
      drawInside(level, room, new Point(room.right, i), Random.IntRange(1, room.width() - 2), Terrain.EMPTY_SP);
  } else if (door.y === room.top) {
    for (let i = room.left + 1; i < room.right; i++)
      drawInside(level, room, new Point(i, room.top), Random.IntRange(1, room.height() - 2), Terrain.EMPTY_SP);
  } else if (door.y === room.bottom) {
    for (let i = room.left + 1; i < room.right; i++)
      drawInside(level, room, new Point(i, room.bottom), Random.IntRange(1, room.height() - 2), Terrain.EMPTY_SP);
  }
}

export function paintMagicWell(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const c = room.center();
  set(level, c.x, c.y, Terrain.WELL);
  const waterClass = Random.element([WaterOfAwareness, WaterOfHealth, WaterOfTransmutation])!;
  const name = classNameOf(waterClass.prototype);
  const water = (level.blobs.get(name) as WellWater | undefined) ?? new waterClass();
  water.seed(c.x + WIDTH * c.y, 1);
  level.blobs.set(name, water);
  room.entrance().setType('REGULAR');
}

export function paintCrypt(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const c = room.center();
  let cx = c.x;
  let cy = c.y;
  const entrance = room.entrance();
  entrance.setType('LOCKED');
  level.addItemToSpawn(new IronKey());
  if (entrance.x === room.left) {
    set(level, new Point(room.right - 1, room.top + 1), Terrain.STATUE);
    set(level, new Point(room.right - 1, room.bottom - 1), Terrain.STATUE);
    cx = room.right - 2;
  } else if (entrance.x === room.right) {
    set(level, new Point(room.left + 1, room.top + 1), Terrain.STATUE);
    set(level, new Point(room.left + 1, room.bottom - 1), Terrain.STATUE);
    cx = room.left + 2;
  } else if (entrance.y === room.top) {
    set(level, new Point(room.left + 1, room.bottom - 1), Terrain.STATUE);
    set(level, new Point(room.right - 1, room.bottom - 1), Terrain.STATUE);
    cy = room.bottom - 2;
  } else if (entrance.y === room.bottom) {
    set(level, new Point(room.left + 1, room.top + 1), Terrain.STATUE);
    set(level, new Point(room.right - 1, room.top + 1), Terrain.STATUE);
    cy = room.top + 2;
  }
  let prize = Generator.random('ARMOR');
  for (let i = 0; i < 3; i++) {
    const another = Generator.random('ARMOR');
    if (another.level() > prize.level()) prize = another;
  }
  level.drop(prize, cx + cy * WIDTH).type = 'TOMB';
}

export function paintPool(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.WATER);
  const door = room.entrance();
  door.setType('REGULAR');
  let x = -1;
  let y = -1;
  if (door.x === room.left) {
    x = room.right - 1;
    y = room.top + Math.trunc(room.height() / 2);
  } else if (door.x === room.right) {
    x = room.left + 1;
    y = room.top + Math.trunc(room.height() / 2);
  } else if (door.y === room.top) {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.bottom - 1;
  } else if (door.y === room.bottom) {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.top + 1;
  }
  const pos = x + y * WIDTH;
  level.drop(bestOf(level, 4, 'WEAPON', 'ARMOR'), pos).type = Random.Int(3) === 0 ? 'CHEST' : 'HEAP';
  set(level, pos, Terrain.PEDESTAL);
  level.addItemToSpawn(new PotionOfInvisibility());
  for (let i = 0; i < 3; i++) {
    const piranha = new Piranha();
    do {
      piranha.pos = room.random();
    } while (level.map[piranha.pos] !== Terrain.WATER || Actor.findChar(piranha.pos) !== null);
    level.mobs.add(piranha);
    Actor.occupyCell(piranha);
  }
}

export function paintGarden(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.HIGH_GRASS);
  fillRect(level, room, 2, Terrain.GRASS);
  room.entrance().setType('REGULAR');
  if (Random.Int(2) === 0) {
    level.drop(new Honeypot(), room.random());
  } else {
    const bushes = Random.Int(5) === 0 ? 2 : 1;
    for (let i = 0; i < bushes; i++) {
      const pos = room.random();
      set(level, pos, Terrain.GRASS);
      level.plant(new SungrassSeed(), pos);
    }
  }
  const light = (level.blobs.get('Foliage') as Foliage | undefined) ?? new Foliage();
  for (let i = room.top + 1; i < room.bottom; i++) {
    for (let j = room.left + 1; j < room.right; j++) light.seed(j + WIDTH * i, 1);
  }
  level.blobs.set('Foliage', light);
}

export function paintLibrary(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const entrance = room.entrance();
  let a: Point | null = null;
  let b: Point | null = null;
  if (entrance.x === room.left) {
    a = new Point(room.left + 1, entrance.y - 1);
    b = new Point(room.left + 1, entrance.y + 1);
    fill(level, room.right - 1, room.top + 1, 1, room.height() - 1, Terrain.BOOKSHELF);
  } else if (entrance.x === room.right) {
    a = new Point(room.right - 1, entrance.y - 1);
    b = new Point(room.right - 1, entrance.y + 1);
    fill(level, room.left + 1, room.top + 1, 1, room.height() - 1, Terrain.BOOKSHELF);
  } else if (entrance.y === room.top) {
    a = new Point(entrance.x + 1, room.top + 1);
    b = new Point(entrance.x - 1, room.top + 1);
    fill(level, room.left + 1, room.bottom - 1, room.width() - 1, 1, Terrain.BOOKSHELF);
  } else if (entrance.y === room.bottom) {
    a = new Point(entrance.x + 1, room.bottom - 1);
    b = new Point(entrance.x - 1, room.bottom - 1);
    fill(level, room.left + 1, room.top + 1, room.width() - 1, 1, Terrain.BOOKSHELF);
  }
  if (a && level.map[a.x + a.y * WIDTH] === Terrain.EMPTY) set(level, a, Terrain.STATUE);
  if (b && level.map[b.x + b.y * WIDTH] === Terrain.EMPTY) set(level, b, Terrain.STATUE);

  const n = Random.IntRange(2, 3);
  for (let i = 0; i < n; i++) {
    const pos = emptyCell(level, room);
    let prize = level.itemToSpanAsPrize();
    if (!(prize instanceof Scroll)) {
      if (prize) level.addItemToSpawn(prize);
      prize = Generator.random('SCROLL');
    }
    level.drop(prize, pos);
  }
  entrance.setType('LOCKED');
  level.addItemToSpawn(new IronKey());
}

export function paintTreasury(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  set(level, room.center(), Terrain.STATUE);
  const heapType = Random.Int(2) === 0 ? 'CHEST' : 'HEAP';
  const n = Random.IntRange(2, 3);
  for (let i = 0; i < n; i++) {
    const pos = emptyCell(level, room);
    level.drop(new Gold().random(), pos).type = i === 0 && heapType === 'CHEST' ? 'MIMIC' : heapType;
  }
  if (heapType === 'HEAP') {
    for (let i = 0; i < 6; i++) {
      let pos: number;
      do {
        pos = room.random();
      } while (level.map[pos] !== Terrain.EMPTY);
      level.drop(new Gold(Random.IntRange(1, 3)), pos);
    }
  }
  room.entrance().setType('LOCKED');
  level.addItemToSpawn(new IronKey());
}

export function paintTraps(level: Level, room: Room): void {
  const traps = [
    Terrain.TOXIC_TRAP,
    Terrain.TOXIC_TRAP,
    Terrain.TOXIC_TRAP,
    Terrain.PARALYTIC_TRAP,
    Terrain.PARALYTIC_TRAP,
    !Dungeon.bossLevel(Dungeon.depth + 1) ? Terrain.CHASM : Terrain.SUMMONING_TRAP,
  ];
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Random.element(traps)!);
  const door = room.entrance();
  door.setType('REGULAR');
  const lastRow = level.map[room.left + 1 + (room.top + 1) * WIDTH] === Terrain.CHASM ? Terrain.CHASM : Terrain.EMPTY;
  let x = -1;
  let y = -1;
  if (door.x === room.left) {
    x = room.right - 1;
    y = room.top + Math.trunc(room.height() / 2);
    fill(level, x, room.top + 1, 1, room.height() - 1, lastRow);
  } else if (door.x === room.right) {
    x = room.left + 1;
    y = room.top + Math.trunc(room.height() / 2);
    fill(level, x, room.top + 1, 1, room.height() - 1, lastRow);
  } else if (door.y === room.top) {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.bottom - 1;
    fill(level, room.left + 1, y, room.width() - 1, 1, lastRow);
  } else if (door.y === room.bottom) {
    x = room.left + Math.trunc(room.width() / 2);
    y = room.top + 1;
    fill(level, room.left + 1, y, room.width() - 1, 1, lastRow);
  }
  const pos = x + y * WIDTH;
  if (Random.Int(3) === 0) {
    if (lastRow === Terrain.CHASM) set(level, pos, Terrain.EMPTY);
    level.drop(bestOf(level, 3, 'WEAPON', 'ARMOR'), pos).type = 'CHEST';
  } else {
    set(level, pos, Terrain.PEDESTAL);
    level.drop(bestOf(level, 3, 'WEAPON', 'ARMOR'), pos);
  }
  level.addItemToSpawn(new PotionOfLevitation());
}

export function paintStorage(level: Level, room: Room): void {
  const floor = Terrain.EMPTY_SP;
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, floor);
  const n = Random.IntRange(3, 4);
  for (let i = 0; i < n; i++) {
    let pos: number;
    do {
      pos = room.random();
    } while (level.map[pos] !== floor);
    const prize = level.itemToSpanAsPrize() ?? Generator.random(oneOf('POTION', 'SCROLL', 'FOOD', 'GOLD', 'MISC'));
    level.drop(prize, pos);
  }
  room.entrance().setType('BARRICADE');
  level.addItemToSpawn(new PotionOfLiquidFlame());
}

export function paintStatue(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const c = room.center();
  let cx = c.x;
  let cy = c.y;
  const door = room.entrance();
  door.setType('LOCKED');
  level.addItemToSpawn(new IronKey());
  if (door.x === room.left) {
    fill(level, room.right - 1, room.top + 1, 1, room.height() - 1, Terrain.STATUE);
    cx = room.right - 2;
  } else if (door.x === room.right) {
    fill(level, room.left + 1, room.top + 1, 1, room.height() - 1, Terrain.STATUE);
    cx = room.left + 2;
  } else if (door.y === room.top) {
    fill(level, room.left + 1, room.bottom - 1, room.width() - 1, 1, Terrain.STATUE);
    cy = room.bottom - 2;
  } else if (door.y === room.bottom) {
    fill(level, room.left + 1, room.top + 1, room.width() - 1, 1, Terrain.STATUE);
    cy = room.top + 2;
  }
  const statue = new Statue();
  statue.pos = cx + cy * WIDTH;
  level.mobs.add(statue);
  Actor.occupyCell(statue);
}

export function paintLaboratory(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY_SP);
  const entrance = room.entrance();
  let pot: Point | null = null;
  if (entrance.x === room.left) pot = new Point(room.right - 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.x === room.right)
    pot = new Point(room.left + 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.y === room.top)
    pot = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.bottom - 1);
  else if (entrance.y === room.bottom)
    pot = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.top + 1);
  set(level, pot!, Terrain.ALCHEMY);
  const alchemy = new Alchemy();
  alchemy.seed(pot!.x + WIDTH * pot!.y, 1);
  level.blobs.set('Alchemy', alchemy);

  const n = Random.IntRange(2, 3);
  for (let i = 0; i < n; i++) {
    const pos = emptyCell(level, room, Terrain.EMPTY_SP);
    let prize = level.itemToSpanAsPrize();
    if (!(prize instanceof Potion)) {
      if (prize) level.addItemToSpawn(prize);
      prize = Generator.random('POTION');
    }
    level.drop(prize, pos);
  }
  entrance.setType('LOCKED');
  level.addItemToSpawn(new IronKey());
}

export function paintVault(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY_SP);
  fillRect(level, room, 2, Terrain.EMPTY);
  const cx = Math.trunc((room.left + room.right) / 2);
  const cy = Math.trunc((room.top + room.bottom) / 2);
  const c = cx + cy * WIDTH;
  const prize = () => Generator.random(oneOf('WAND', 'RING'));
  switch (Random.Int(3)) {
    case 0:
      level.drop(prize(), c).type = 'LOCKED_CHEST';
      level.addItemToSpawn(new GoldenKey());
      break;
    case 1: {
      let i1: Item;
      let i2: Item;
      do {
        i1 = prize();
        i2 = prize();
      } while (i1.sameKind(i2));
      level.drop(i1, c).type = 'CRYSTAL_CHEST';
      level.drop(i2, c + NEIGHBOURS8[Random.Int(8)]).type = 'CRYSTAL_CHEST';
      level.addItemToSpawn(new GoldenKey());
      break;
    }
    case 2:
      level.drop(prize(), c);
      set(level, c, Terrain.PEDESTAL);
      break;
  }
  room.entrance().setType('LOCKED');
  level.addItemToSpawn(new IronKey());
}

export function paintAltar(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Dungeon.bossLevel(Dungeon.depth + 1) ? Terrain.HIGH_GRASS : Terrain.CHASM);
  const c = room.center();
  const door = room.entrance();
  if (door.x === room.left || door.x === room.right) {
    const p = drawInside(level, room, door, Math.abs(door.x - c.x) - 2, Terrain.EMPTY_SP);
    for (; p.y !== c.y; p.y += p.y < c.y ? +1 : -1) set(level, p, Terrain.EMPTY_SP);
  } else {
    const p = drawInside(level, room, door, Math.abs(door.y - c.y) - 2, Terrain.EMPTY_SP);
    for (; p.x !== c.x; p.x += p.x < c.x ? +1 : -1) set(level, p, Terrain.EMPTY_SP);
  }
  fill(level, c.x - 1, c.y - 1, 3, 3, Terrain.EMBERS);
  set(level, c, Terrain.PEDESTAL);
  const fire = (level.blobs.get('SacrificialFire') as SacrificialFire | undefined) ?? new SacrificialFire();
  fire.seed(c.x + c.y * WIDTH, 5 + Dungeon.depth * 5);
  level.blobs.set('SacrificialFire', fire);
  door.setType('EMPTY');
}

export function paintPit(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY);
  const entrance = room.entrance();
  entrance.setType('LOCKED');
  let well: Point | null = null;
  if (entrance.x === room.left) well = new Point(room.right - 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.x === room.right)
    well = new Point(room.left + 1, Random.Int(2) === 0 ? room.top + 1 : room.bottom - 1);
  else if (entrance.y === room.top)
    well = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.bottom - 1);
  else if (entrance.y === room.bottom)
    well = new Point(Random.Int(2) === 0 ? room.left + 1 : room.right - 1, room.top + 1);
  set(level, well!, Terrain.EMPTY_WELL);

  let remains = room.random();
  while (level.map[remains] === Terrain.EMPTY_WELL) remains = room.random();
  level.drop(new IronKey(), remains).type = 'SKELETON';
  if (Random.Int(5) === 0) level.drop(Generator.random('RING'), remains);
  else level.drop(Generator.random(oneOf('WEAPON', 'ARMOR')), remains);
  const n = Random.IntRange(1, 2);
  for (let i = 0; i < n; i++) {
    level.drop(level.itemToSpanAsPrize() ?? Generator.random(oneOf('POTION', 'SCROLL', 'FOOD', 'GOLD')), remains);
  }
}

export function paintRatKing(level: Level, room: Room): void {
  fillRect(level, room, Terrain.WALL);
  fillRect(level, room, 1, Terrain.EMPTY_SP);
  const entrance = room.entrance();
  entrance.setType('HIDDEN');
  const door = entrance.x + entrance.y * WIDTH;
  for (let i = room.left + 1; i < room.right; i++) {
    addChest(level, (room.top + 1) * WIDTH + i, door);
    addChest(level, (room.bottom - 1) * WIDTH + i, door);
  }
  for (let i = room.top + 2; i < room.bottom - 1; i++) {
    addChest(level, i * WIDTH + room.left + 1, door);
    addChest(level, i * WIDTH + room.right - 1, door);
  }
  for (;;) {
    const chest = level.heaps.get(room.random());
    if (chest) {
      chest.type = 'MIMIC';
      break;
    }
  }
  const king = new RatKing();
  king.pos = room.random(1);
  level.mobs.add(king);
}

function addChest(level: Level, pos: number, door: number): void {
  if (pos === door - 1 || pos === door + 1 || pos === door - WIDTH || pos === door + WIDTH) return;
  let prize: Item;
  switch (Random.Int(10)) {
    case 0:
      prize = Generator.random('WEAPON');
      if (prize instanceof MissileWeapon) prize.quantity = 1;
      else prize.degrade(Random.Int(3));
      break;
    case 1:
      prize = Generator.random('ARMOR').degrade(Random.Int(3));
      break;
    default:
      prize = new Gold(Random.IntRange(1, 5));
      break;
  }
  level.drop(prize, pos).type = 'CHEST';
}
