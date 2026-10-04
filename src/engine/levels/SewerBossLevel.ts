// Port of levels/SewerBossLevel.java: Goo's lair (depth 5).
import { Dungeon } from '../Dungeon';
import type { Actor } from '../actors/Actor';
import { Bestiary } from '../actors/mobs/Bestiary';
import type { Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { Fx } from '../core/fx';
import { Graph } from '../core/Graph';
import { Random } from '../core/Random';
import { WIDTH } from './constants';
import { generatePatch } from './Patch';
import { RegularLevel } from './RegularLevel';
import type { Room } from './Room';
import { Terrain } from './Terrain';

export class SewerBossLevel extends RegularLevel {
  private stairs = 0;

  constructor() {
    super();
    this.color1 = 0x48763c;
    this.color2 = 0x59994a;
  }

  tilesTex(): string {
    return 'tiles0.png';
  }

  waterTex(): string {
    return 'water0.png';
  }

  protected build(): boolean {
    this.initRooms();

    let distance: number;
    let retry = 0;
    const minDistance = Math.trunc(Math.sqrt(this.rooms.size));
    do {
      let innerRetry = 0;
      do {
        if (innerRetry++ > 10) return false;
        this.roomEntrance = Random.element(this.rooms)!;
      } while (this.roomEntrance.width() < 4 || this.roomEntrance.height() < 4);
      innerRetry = 0;
      do {
        if (innerRetry++ > 10) return false;
        this.roomExit = Random.element(this.rooms)!;
      } while (
        this.roomExit === this.roomEntrance ||
        this.roomExit.width() < 6 ||
        this.roomExit.height() < 6 ||
        this.roomExit.top === 0
      );
      Graph.buildDistanceMap(this.rooms, this.roomExit);
      distance = this.roomEntrance.distance;
      if (retry++ > 10) return false;
    } while (distance < minDistance);

    const roomEntrance = this.roomEntrance;
    const roomExit = this.roomExit;
    roomEntrance.type = 'ENTRANCE';
    roomExit.type = 'BOSS_EXIT';

    Graph.buildDistanceMap(this.rooms, roomExit);
    let path = Graph.buildPath(roomEntrance, roomExit)!;
    Graph.setPrice(path, roomEntrance.distance);
    Graph.buildDistanceMap(this.rooms, roomExit);
    path = Graph.buildPath(roomEntrance, roomExit)!;

    let room: Room = roomEntrance;
    for (const next of path) {
      room.connect(next);
      room = next;
    }

    room = roomExit.connected.keys().next().value!;
    if (roomExit.top === room.bottom) return false;

    for (const r of this.rooms) if (r.type === 'NULL' && r.connected.size > 0) r.type = 'TUNNEL';

    const candidates: Room[] = [];
    for (const r of roomExit.neigbours) {
      if (
        !roomExit.connected.has(r) &&
        (roomExit.left === r.right || roomExit.right === r.left || roomExit.bottom === r.top)
      )
        candidates.push(r);
    }
    if (candidates.length > 0) {
      const kingsRoom = Random.element(candidates)!;
      kingsRoom.connect(roomExit);
      kingsRoom.type = 'RAT_KING';
    }

    this.paint();
    this.paintWater();
    this.paintGrass();
    this.placeTraps();
    return true;
  }

  protected water_(): Uint8Array {
    return generatePatch(0.5, 5);
  }

  protected grass_(): Uint8Array {
    return generatePatch(0.4, 4);
  }

  protected decorate(): void {
    const roomExit = this.roomExit!;
    const start = roomExit.top * WIDTH + roomExit.left + 1;
    const end = start + roomExit.width() - 1;
    for (let i = start; i < end; i++) {
      if (i !== this.exit) {
        this.map[i] = Terrain.WALL_DECO;
        this.map[i + WIDTH] = Terrain.WATER;
      } else {
        this.map[i + WIDTH] = Terrain.EMPTY;
      }
    }
    for (;;) {
      const pos = this.roomEntrance!.random();
      if (pos !== this.entrance) {
        this.map[pos] = Terrain.SIGN;
        break;
      }
    }
  }

  protected createMobs(): void {
    const mob = Bestiary.mob(Dungeon.depth);
    mob.pos = this.roomExit!.random();
    this.mobs.add(mob);
  }

  respawner(): Actor | null {
    return null;
  }

  protected createItems(): void {
    // Bones of a previous hero (Bones.get) arrive with persistence in M6.
  }

  seal(): void {
    if (this.entrance !== 0) {
      this.set(this.entrance, Terrain.WATER_TILES);
      Fx.ripple(this.entrance);
      this.stairs = this.entrance;
      this.entrance = 0;
    }
  }

  unseal(): void {
    if (this.stairs !== 0) {
      this.entrance = this.stairs;
      this.stairs = 0;
      this.set(this.entrance, Terrain.ENTRANCE);
    }
  }

  storeInBundle(bundle: Bundle): void {
    super.storeInBundle(bundle);
    bundle.put('stairs', this.stairs);
  }

  restoreFromBundle(bundle: Bundle): void {
    super.restoreFromBundle(bundle);
    this.stairs = bundle.getInt('stairs');
  }

  tileName(tile: number): string {
    return tile === Terrain.WATER ? 'Murky water' : super.tileName(tile);
  }

  tileDesc(tile: number): string {
    return tile === Terrain.EMPTY_DECO ? 'Wet yellowish moss covers the floor.' : super.tileDesc(tile);
  }
}

registerClass('SewerBossLevel', SewerBossLevel);
