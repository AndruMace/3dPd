// Port of levels/RegularLevel.java: binary-split rooms, a room graph, connections, room types, painting.
import { Dungeon } from '../Dungeon';
import { Actor } from '../actors/Actor';
import { Bestiary } from '../actors/mobs/Bestiary';
import { Rect } from '../core/geom';
import { Graph } from '../core/Graph';
import { Random } from '../core/Random';
import { Generator } from '../items/Generator';
import type { HeapType } from '../items/Heap';
import { LENGTH, NEIGHBOURS8, WIDTH } from './constants';
import { Level } from './Level';
import { paintEntrance, paintExit } from './painters/EntranceExitPainter';
import { fill, fillRect } from './painters/Painter';
import { paintStandard } from './painters/StandardPainter';
import { paintPassage, paintTunnel } from './painters/TunnelPainter';
import { Door, Room, SPECIALS, type RoomType } from './Room';
import { Terrain } from './Terrain';

type RoomPainter = (level: Level, room: Room) => void;

/** Painters ported so far. Special rooms without one yet are painted as standard rooms (M2 ports the rest). */
const PAINTERS: Partial<Record<RoomType, RoomPainter>> = {
  STANDARD: paintStandard,
  ENTRANCE: paintEntrance,
  EXIT: paintExit,
  TUNNEL: paintTunnel,
  PASSAGE: paintPassage,
};

export abstract class RegularLevel extends Level {
  rooms = new Set<Room>();
  protected roomEntrance: Room | null = null;
  protected roomExit: Room | null = null;
  protected specials: RoomType[] = [];
  secretDoors = 0;

  protected minRoomSize = 7;
  protected maxRoomSize = 9;

  protected build(): boolean {
    if (!this.initRooms()) return false;

    let distance: number;
    let retry = 0;
    const minDistance = Math.trunc(Math.sqrt(this.rooms.size));
    do {
      do {
        this.roomEntrance = Random.element(this.rooms)!;
      } while (this.roomEntrance.width() < 4 || this.roomEntrance.height() < 4);
      do {
        this.roomExit = Random.element(this.rooms)!;
      } while (this.roomExit === this.roomEntrance || this.roomExit.width() < 4 || this.roomExit.height() < 4);

      Graph.buildDistanceMap(this.rooms, this.roomExit);
      distance = this.roomEntrance.distance;
      if (retry++ > 10) return false;
    } while (distance < minDistance);

    const roomEntrance = this.roomEntrance;
    const roomExit = this.roomExit;
    roomEntrance.type = 'ENTRANCE';
    roomExit.type = 'EXIT';

    const connected = new Set<Room>([roomEntrance]);

    Graph.buildDistanceMap(this.rooms, roomExit);
    let path = Graph.buildPath(roomEntrance, roomExit)!;
    let room = roomEntrance;
    for (const next of path) {
      room.connect(next);
      room = next;
      connected.add(room);
    }

    // A second, cost-weighted path makes loops more likely.
    Graph.setPrice(path, roomEntrance.distance);
    Graph.buildDistanceMap(this.rooms, roomExit);
    path = Graph.buildPath(roomEntrance, roomExit)!;
    room = roomEntrance;
    for (const next of path) {
      room.connect(next);
      room = next;
      connected.add(room);
    }

    const nConnected = Math.trunc(this.rooms.size * Random.Float(0.5, 0.7));
    while (connected.size < nConnected) {
      const cr = Random.element(connected)!;
      const or = Random.element(cr.neigbours);
      if (or && !connected.has(or)) {
        cr.connect(or);
        connected.add(or);
      }
    }

    if (Dungeon.shopOnLevel()) {
      let shop: Room | null = null;
      for (const r of roomEntrance.connected.keys()) {
        if (r.connected.size === 1 && r.width() >= 5 && r.height() >= 5) {
          shop = r;
          break;
        }
      }
      if (!shop) return false;
      shop.type = 'SHOP';
    }

    this.specials = [...SPECIALS];
    if (Dungeon.bossLevel(Dungeon.depth + 1)) this.removeSpecial('WEAK_FLOOR');
    this.assignRoomType();

    this.paint();
    this.paintWater();
    this.paintGrass();
    this.placeTraps();
    return true;
  }

  private removeSpecial(type: RoomType): void {
    const i = this.specials.indexOf(type);
    if (i >= 0) this.specials.splice(i, 1);
  }

  protected initRooms(): boolean {
    this.rooms = new Set();
    this.split(new Rect(0, 0, WIDTH - 1, WIDTH - 1));
    if (this.rooms.size < 8) return false;
    const ra = [...this.rooms];
    for (let i = 0; i < ra.length - 1; i++) {
      for (let j = i + 1; j < ra.length; j++) ra[i].addNeigbour(ra[j]);
    }
    return true;
  }

  protected assignRoomType(): void {
    let specialRooms = 0;

    for (const r of this.rooms) {
      if (r.type === 'NULL' && r.connected.size === 1) {
        if (
          this.specials.length > 0 &&
          r.width() > 3 &&
          r.height() > 3 &&
          Random.Int(specialRooms * specialRooms + 2) === 0
        ) {
          if (Level.pitRoomNeeded) {
            r.type = 'PIT';
            Level.pitRoomNeeded = false;
            for (const t of [
              'ARMORY',
              'CRYPT',
              'LABORATORY',
              'LIBRARY',
              'STATUE',
              'TREASURY',
              'VAULT',
              'WEAK_FLOOR',
            ] as const) {
              this.removeSpecial(t);
            }
          } else if (Dungeon.depth % 5 === 2 && this.specials.includes('LABORATORY')) {
            r.type = 'LABORATORY';
          } else {
            const n = this.specials.length;
            r.type = this.specials[Math.min(Random.Int(n), Random.Int(n))];
            if (r.type === 'WEAK_FLOOR') Level.weakFloorCreated = true;
          }
          Room.useType(r.type);
          this.removeSpecial(r.type);
          specialRooms++;
        } else if (Random.Int(2) === 0) {
          const neigbours = new Set<Room>();
          for (const n of r.neigbours) {
            if (!r.connected.has(n) && !SPECIALS.includes(n.type) && n.type !== 'PIT') neigbours.add(n);
          }
          if (neigbours.size > 1) r.connect(Random.element(neigbours)!);
        }
      }
    }

    let count = 0;
    for (const r of this.rooms) {
      if (r.type === 'NULL') {
        const connections = r.connected.size;
        if (connections === 0) {
          // unreachable: stays solid
        } else if (Random.Int(connections * connections) === 0) {
          r.type = 'STANDARD';
          count++;
        } else {
          r.type = 'TUNNEL';
        }
      }
    }

    while (count < 4) {
      const r = this.randomRoom('TUNNEL', 1);
      if (r) {
        r.type = 'STANDARD';
        count++;
      }
    }
  }

  protected paintWater(): void {
    const lake = this.water_();
    for (let i = 0; i < LENGTH; i++) if (this.map[i] === Terrain.EMPTY && lake[i]) this.map[i] = Terrain.WATER;
  }

  protected paintGrass(): void {
    const grass = this.grass_();
    if (this.feeling === 'GRASS') {
      for (const room of this.rooms) {
        if (room.type !== 'NULL' && room.type !== 'PASSAGE' && room.type !== 'TUNNEL') {
          grass[room.left + 1 + (room.top + 1) * WIDTH] = 1;
          grass[room.right - 1 + (room.top + 1) * WIDTH] = 1;
          grass[room.left + 1 + (room.bottom - 1) * WIDTH] = 1;
          grass[room.right - 1 + (room.bottom - 1) * WIDTH] = 1;
        }
      }
    }
    for (let i = WIDTH + 1; i < LENGTH - WIDTH - 1; i++) {
      if (this.map[i] === Terrain.EMPTY && grass[i]) {
        let count = 1;
        for (const n of NEIGHBOURS8) if (grass[i + n]) count++;
        this.map[i] = Random.Float() < count / 12 ? Terrain.HIGH_GRASS : Terrain.GRASS;
      }
    }
  }

  protected abstract water_(): Uint8Array;
  protected abstract grass_(): Uint8Array;

  protected placeTraps(): void {
    const nTraps = this.nTraps();
    const trapChances = this.trapChances();
    const traps = [
      Terrain.SECRET_TOXIC_TRAP,
      Terrain.SECRET_FIRE_TRAP,
      Terrain.SECRET_PARALYTIC_TRAP,
      Terrain.SECRET_POISON_TRAP,
      Terrain.SECRET_ALARM_TRAP,
      Terrain.SECRET_LIGHTNING_TRAP,
      Terrain.SECRET_GRIPPING_TRAP,
      Terrain.SECRET_SUMMONING_TRAP,
    ];
    for (let i = 0; i < nTraps; i++) {
      const trapPos = Random.Int(LENGTH);
      if (this.map[trapPos] === Terrain.EMPTY) this.map[trapPos] = traps[Random.chances(trapChances)];
    }
  }

  protected nTraps(): number {
    return Dungeon.depth <= 1 ? 0 : Random.Int(1, this.rooms.size + Dungeon.depth);
  }

  protected trapChances(): number[] {
    return [1, 1, 1, 1, 1, 1, 1, 1];
  }

  protected split(rect: Rect): void {
    const w = rect.width();
    const h = rect.height();
    const { minRoomSize, maxRoomSize } = this;

    if (w > maxRoomSize && h < minRoomSize) {
      const vw = Random.Int(rect.left + 3, rect.right - 3);
      this.split(new Rect(rect.left, rect.top, vw, rect.bottom));
      this.split(new Rect(vw, rect.top, rect.right, rect.bottom));
    } else if (h > maxRoomSize && w < minRoomSize) {
      const vh = Random.Int(rect.top + 3, rect.bottom - 3);
      this.split(new Rect(rect.left, rect.top, rect.right, vh));
      this.split(new Rect(rect.left, vh, rect.right, rect.bottom));
    } else if (
      // Integer division, as in the original: only rects of at most 49 cells can stop splitting early.
      (Random.Float() <= Math.trunc((minRoomSize * minRoomSize) / rect.square()) &&
        w <= maxRoomSize &&
        h <= maxRoomSize) ||
      w < minRoomSize ||
      h < minRoomSize
    ) {
      this.rooms.add(new Room().set(rect));
    } else if (Random.Float() < (w - 2) / (w + h - 4)) {
      const vw = Random.Int(rect.left + 3, rect.right - 3);
      this.split(new Rect(rect.left, rect.top, vw, rect.bottom));
      this.split(new Rect(vw, rect.top, rect.right, rect.bottom));
    } else {
      const vh = Random.Int(rect.top + 3, rect.bottom - 3);
      this.split(new Rect(rect.left, rect.top, rect.right, vh));
      this.split(new Rect(rect.left, vh, rect.right, rect.bottom));
    }
  }

  protected paint(): void {
    for (const r of this.rooms) {
      if (r.type !== 'NULL') {
        this.placeDoors(r);
        (PAINTERS[r.type] ?? paintStandard)(this, r);
      } else if (this.feeling === 'CHASM' && Random.Int(2) === 0) {
        fillRect(this, r, Terrain.WALL);
      }
    }
    for (const r of this.rooms) this.paintDoors(r);
  }

  private placeDoors(r: Room): void {
    for (const n of r.connected.keys()) {
      let door = r.connected.get(n);
      if (!door) {
        const i = r.intersect(n);
        door =
          i.width() === 0
            ? new Door(i.left, Random.Int(i.top + 1, i.bottom))
            : new Door(Random.Int(i.left + 1, i.right), i.top);
        r.connected.set(n, door);
        n.connected.set(r, door);
      }
    }
  }

  protected paintDoors(r: Room): void {
    for (const n of r.connected.keys()) {
      if (this.joinRooms(r, n)) continue;
      const d = r.connected.get(n)!;
      const door = d.x + d.y * WIDTH;
      switch (d.type) {
        case 'EMPTY':
          this.map[door] = Terrain.EMPTY;
          break;
        case 'TUNNEL':
          this.map[door] = this.tunnelTile();
          break;
        case 'REGULAR':
          if (Dungeon.depth <= 1) {
            this.map[door] = Terrain.DOOR;
          } else {
            const secret = (Dungeon.depth < 6 ? Random.Int(12 - Dungeon.depth) : Random.Int(6)) === 0;
            this.map[door] = secret ? Terrain.SECRET_DOOR : Terrain.DOOR;
            if (secret) this.secretDoors++;
          }
          break;
        case 'UNLOCKED':
          this.map[door] = Terrain.DOOR;
          break;
        case 'HIDDEN':
          this.map[door] = Terrain.SECRET_DOOR;
          this.secretDoors++;
          break;
        case 'BARRICADE':
          this.map[door] = Random.Int(3) === 0 ? Terrain.BOOKSHELF : Terrain.BARRICADE;
          break;
        case 'LOCKED':
          this.map[door] = Terrain.LOCKED_DOOR;
          break;
      }
    }
  }

  protected joinRooms(r: Room, n: Room): boolean {
    if (r.type !== 'STANDARD' || n.type !== 'STANDARD') return false;
    const w = r.intersect(n);
    if (w.left === w.right) {
      if (w.bottom - w.top < 3) return false;
      if (w.height() === Math.max(r.height(), n.height())) return false;
      if (r.width() + n.width() > this.maxRoomSize) return false;
      w.top += 1;
      w.right++;
      fill(this, w.left, w.top, 1, w.height(), Terrain.EMPTY);
    } else {
      if (w.right - w.left < 3) return false;
      if (w.width() === Math.max(r.width(), n.width())) return false;
      if (r.height() + n.height() > this.maxRoomSize) return false;
      w.left += 1;
      w.bottom++;
      fill(this, w.left, w.top, w.width(), 1, Terrain.EMPTY);
    }
    return true;
  }

  nMobs(): number {
    return 2 + (Dungeon.depth % 5) + Random.Int(3);
  }

  protected createMobs(): void {
    const nMobs = this.nMobs();
    for (let i = 0; i < nMobs; i++) {
      const mob = Bestiary.mob(Dungeon.depth);
      do {
        mob.pos = this.randomRespawnCell();
      } while (mob.pos === -1);
      this.mobs.add(mob);
      Actor.occupyCell(mob);
    }
  }

  randomRespawnCell(): number {
    let count = 0;
    for (;;) {
      if (++count > 10) return -1;
      const room = this.randomRoom('STANDARD', 10);
      if (!room) continue;
      const cell = room.random();
      if (!Dungeon.visible[cell] && Actor.findChar(cell) === null && this.passable[cell]) return cell;
    }
  }

  randomDestination(): number {
    for (;;) {
      const room = Random.element(this.rooms)!;
      const cell = room.random();
      if (this.passable[cell]) return cell;
    }
  }

  protected createItems(): void {
    let nItems = 3;
    while (Random.Float() < 0.4) nItems++;

    for (let i = 0; i < nItems; i++) {
      let type: HeapType;
      switch (Random.Int(20)) {
        case 0:
          type = 'SKELETON';
          break;
        case 1:
        case 2:
        case 3:
        case 4:
          type = 'CHEST';
          break;
        case 5:
          type = Dungeon.depth > 1 ? 'MIMIC' : 'CHEST';
          break;
        default:
          type = 'HEAP';
      }
      this.drop(Generator.random(), this.randomDropCell()).type = type;
    }

    for (const item of this.itemsToSpawn) this.drop(item, this.randomDropCell()).type = 'HEAP';
  }

  protected randomRoom(type: RoomType, tries: number): Room | null {
    for (let i = 0; i < tries; i++) {
      const room = Random.element(this.rooms)!;
      if (room.type === type) return room;
    }
    return null;
  }

  room(pos: number): Room | null {
    for (const room of this.rooms) if (room.type !== 'NULL' && room.inside(pos)) return room;
    return null;
  }

  protected randomDropCell(): number {
    for (;;) {
      const room = this.randomRoom('STANDARD', 1);
      if (room) {
        const pos = room.random();
        if (this.passable[pos]) return pos;
      }
    }
  }

  pitCell(): number {
    for (const room of this.rooms) if (room.type === 'PIT') return room.random();
    return super.pitCell();
  }
}
