// Port of levels/Level.java. PD kept the per-cell flag maps (passable, losBlocking, ...) and fieldOfView as
// statics; here they belong to the level instance.
import { Dungeon } from '../Dungeon';
import { Actor } from '../actors/Actor';
import type { Char } from '../actors/Char';
import { observe } from '../observe';
import type { Mob } from '../actors/mobs/Mob';
import { Bestiary } from '../actors/mobs/Bestiary';
import { Events } from '../core/events';
import { Random } from '../core/Random';
import { castShadow } from '../mechanics/ShadowCaster';
import { Heap } from '../items/Heap';
import type { Item } from '../items/Item';
import { HEIGHT, LENGTH, NEIGHBOURS4, NEIGHBOURS9, WIDTH } from './constants';
import { flags as terrainFlags, Terrain } from './Terrain';

export type Feeling = 'NONE' | 'CHASM' | 'WATER' | 'GRASS';

const TIME_TO_RESPAWN = 50;

export abstract class Level {
  map = new Int32Array(LENGTH);
  visited = new Uint8Array(LENGTH);
  mapped = new Uint8Array(LENGTH);

  viewDistance = 8;

  fieldOfView = new Uint8Array(LENGTH);
  passable = new Uint8Array(LENGTH);
  losBlocking = new Uint8Array(LENGTH);
  flamable = new Uint8Array(LENGTH);
  secret = new Uint8Array(LENGTH);
  solid = new Uint8Array(LENGTH);
  avoid = new Uint8Array(LENGTH);
  water = new Uint8Array(LENGTH);
  pit = new Uint8Array(LENGTH);
  discoverable = new Uint8Array(LENGTH);

  feeling: Feeling = 'NONE';
  entrance = 0;
  exit = 0;

  mobs = new Set<Mob>();
  heaps = new Map<number, Heap>();
  protected itemsToSpawn: Item[] = [];

  color1 = 0x004400;
  color2 = 0x88cc44;

  /** Region tile sheet and water texture (asset file names). */
  abstract tilesTex(): string;
  abstract waterTex(): string;

  static pitRoomNeeded = false;
  static weakFloorCreated = false;

  create(): void {
    this.mobs = new Set();
    this.heaps = new Map();

    if (!Dungeon.bossLevel()) {
      // M2: food, strength potions, upgrade and enchantment scrolls are queued here via itemsToSpawn.
      if (Dungeon.depth > 1) {
        switch (Random.Int(10)) {
          case 0:
            if (!Dungeon.bossLevel(Dungeon.depth + 1)) this.feeling = 'CHASM';
            break;
          case 1:
            this.feeling = 'WATER';
            break;
          case 2:
            this.feeling = 'GRASS';
            break;
        }
      }
    }

    const pitNeeded = Dungeon.depth > 1 && Level.weakFloorCreated;
    do {
      this.map.fill(this.feeling === 'CHASM' ? Terrain.CHASM : Terrain.WALL);
      Level.pitRoomNeeded = pitNeeded;
      Level.weakFloorCreated = false;
      this.heaps.clear();
    } while (!this.build());
    this.decorate();

    this.buildFlagMaps();
    this.cleanWalls();

    this.createMobs();
    this.createItems();
  }

  tunnelTile(): number {
    return this.feeling === 'CHASM' ? Terrain.EMPTY_SP : Terrain.EMPTY;
  }

  protected abstract build(): boolean;
  protected abstract decorate(): void;
  protected abstract createMobs(): void;
  protected abstract createItems(): void;

  nMobs(): number {
    return 0;
  }

  /** The actor that periodically tops the level back up with wandering monsters. */
  respawner(): Actor | null {
    return new Respawner(this);
  }

  /** GameScene.add(mob): put a mob into play on the current level. */
  addMob(mob: Mob): void {
    this.mobs.add(mob);
    Actor.add(mob);
    Actor.occupyCell(mob);
    Events.emit({ type: 'spawn', id: mob.id(), sprite: mob.spriteId, pos: mob.pos });
  }

  randomRespawnCell(): number {
    let cell: number;
    do {
      cell = Random.Int(LENGTH);
    } while (!this.passable[cell] || Dungeon.visible[cell] || Actor.findChar(cell) !== null);
    return cell;
  }

  randomDestination(): number {
    let cell: number;
    do {
      cell = Random.Int(LENGTH);
    } while (!this.passable[cell]);
    return cell;
  }

  addItemToSpawn(item: Item | null): void {
    if (item) this.itemsToSpawn.push(item);
  }

  pitCell(): number {
    return this.randomRespawnCell();
  }

  private buildFlagMaps(): void {
    for (let i = 0; i < LENGTH; i++) this.updateFlags(i);

    const lastRow = LENGTH - WIDTH;
    for (let i = 0; i < WIDTH; i++) {
      this.passable[i] = this.avoid[i] = 0;
      this.passable[lastRow + i] = this.avoid[lastRow + i] = 0;
    }
    for (let i = WIDTH; i < lastRow; i += WIDTH) {
      this.passable[i] = this.avoid[i] = 0;
      this.passable[i + WIDTH - 1] = this.avoid[i + WIDTH - 1] = 0;
    }

    for (let i = WIDTH; i < LENGTH - WIDTH; i++) {
      if (this.water[i]) this.map[i] = this.getWaterTile(i);
      if (this.pit[i] && !this.pit[i - WIDTH]) {
        const c = this.map[i - WIDTH];
        if (c === Terrain.EMPTY_SP || c === Terrain.STATUE_SP) this.map[i] = Terrain.CHASM_FLOOR_SP;
        else if (this.water[i - WIDTH]) this.map[i] = Terrain.CHASM_WATER;
        else if (terrainFlags[c] & Terrain.UNSTITCHABLE) this.map[i] = Terrain.CHASM_WALL;
        else this.map[i] = Terrain.CHASM_FLOOR;
      }
    }
  }

  private updateFlags(i: number): void {
    const f = terrainFlags[this.map[i]];
    this.passable[i] = f & Terrain.PASSABLE ? 1 : 0;
    this.losBlocking[i] = f & Terrain.LOS_BLOCKING ? 1 : 0;
    this.flamable[i] = f & Terrain.FLAMABLE ? 1 : 0;
    this.secret[i] = f & Terrain.SECRET ? 1 : 0;
    this.solid[i] = f & Terrain.SOLID ? 1 : 0;
    this.avoid[i] = f & Terrain.AVOID ? 1 : 0;
    this.water[i] = f & Terrain.LIQUID ? 1 : 0;
    this.pit[i] = f & Terrain.PIT ? 1 : 0;
  }

  private getWaterTile(pos: number): number {
    let t: number = Terrain.WATER_TILES;
    for (let j = 0; j < NEIGHBOURS4.length; j++) {
      if (terrainFlags[this.map[pos + NEIGHBOURS4[j]]] & Terrain.UNSTITCHABLE) t += 1 << j;
    }
    return t;
  }

  destroy(pos: number): void {
    if ((terrainFlags[this.map[pos]] & Terrain.UNSTITCHABLE) === 0) {
      this.set(pos, Terrain.EMBERS);
    } else {
      const flood = NEIGHBOURS4.some((n) => this.water[pos + n]);
      this.set(pos, flood ? this.getWaterTile(pos) : Terrain.EMBERS);
    }
  }

  private cleanWalls(): void {
    for (let i = 0; i < LENGTH; i++) {
      let d = false;
      for (const n9 of NEIGHBOURS9) {
        const n = i + n9;
        if (n >= 0 && n < LENGTH && this.map[n] !== Terrain.WALL && this.map[n] !== Terrain.WALL_DECO) {
          d = true;
          break;
        }
      }
      if (d) {
        d = false;
        for (const n9 of NEIGHBOURS9) {
          const n = i + n9;
          if (n >= 0 && n < LENGTH && !this.pit[n]) {
            d = true;
            break;
          }
        }
      }
      this.discoverable[i] = d ? 1 : 0;
    }
  }

  /** Level.set: change terrain at runtime and keep the flag maps in sync. */
  set(cell: number, terrain: number): void {
    this.map[cell] = terrain;
    this.updateFlags(cell);
    this.water[cell] = terrain === Terrain.WATER || terrain >= Terrain.WATER_TILES ? 1 : 0;
    Events.emit({ type: 'terrain', cell, value: terrain });
  }

  drop(item: Item, cell: number): Heap {
    let heap = this.heaps.get(cell);
    if (!heap) {
      heap = new Heap();
      heap.pos = cell;
      // M2: items falling into chasms go to the level below.
      this.heaps.set(cell, heap);
    }
    heap.drop(item);
    return heap;
  }

  // ---- Doors (levels/features/Door.java) ----

  doorEnter(pos: number): void {
    this.set(pos, Terrain.OPEN_DOOR);
    observe();
    if (Dungeon.visible[pos]) Events.emit({ type: 'sound', name: 'snd_door_open', pos });
  }

  doorLeave(pos: number): void {
    if (!this.heaps.has(pos)) {
      this.set(pos, Terrain.DOOR);
      observe();
    }
  }

  /** A character steps onto a cell (traps, grass, doors). M1 handles doors; the rest arrives in M2. */
  press(cell: number, ch: Char | null): void {
    switch (this.map[cell]) {
      case Terrain.DOOR:
        this.doorEnter(cell);
        break;
    }
    void ch;
  }

  mobPress(mob: Mob): void {
    void mob;
  }

  updateFieldOfView(c: Char): Uint8Array {
    const cx = c.pos % WIDTH;
    const cy = Math.floor(c.pos / WIDTH);
    const sighted = c.isAlive();
    if (sighted) {
      castShadow(cx, cy, this.fieldOfView, c.viewDistance, this.losBlocking);
    } else {
      this.fieldOfView.fill(0);
    }

    const sense = 1;
    if (!sighted) {
      const ax = Math.max(0, cx - sense);
      const bx = Math.min(cx + sense, WIDTH - 1);
      const ay = Math.max(0, cy - sense);
      const by = Math.min(cy + sense, HEIGHT - 1);
      const len = bx - ax + 1;
      let pos = ax + ay * WIDTH;
      for (let y = ay; y <= by; y++, pos += WIDTH) this.fieldOfView.fill(1, pos, pos + len);
      for (let i = 0; i < LENGTH; i++) this.fieldOfView[i] &= this.discoverable[i];
    }
    return this.fieldOfView;
  }

  tileName(tile: number): string {
    if (tile >= Terrain.WATER_TILES) return this.tileName(Terrain.WATER);
    if (tile !== Terrain.CHASM && terrainFlags[tile] & Terrain.PIT) return this.tileName(Terrain.CHASM);
    switch (tile) {
      case Terrain.CHASM:
        return 'Chasm';
      case Terrain.GRASS:
        return 'Grass';
      case Terrain.WATER:
        return 'Water';
      case Terrain.WALL:
      case Terrain.WALL_DECO:
      case Terrain.SECRET_DOOR:
        return 'Wall';
      case Terrain.DOOR:
        return 'Closed door';
      case Terrain.OPEN_DOOR:
        return 'Open door';
      case Terrain.ENTRANCE:
        return 'Depth entrance';
      case Terrain.EXIT:
        return 'Depth exit';
      case Terrain.EMBERS:
        return 'Embers';
      case Terrain.HIGH_GRASS:
        return 'High grass';
      default:
        return 'Floor';
    }
  }
}

class Respawner extends Actor {
  constructor(private readonly level: Level) {
    super();
  }

  protected act(): boolean {
    const level = this.level;
    if (level.mobs.size < level.nMobs()) {
      const mob = Bestiary.mutable(Dungeon.depth);
      mob.state = 'WANDERING';
      mob.pos = level.randomRespawnCell();
      if (Dungeon.hero.isAlive() && mob.pos !== -1) level.addMob(mob);
    }
    this.spend(TIME_TO_RESPAWN);
    return true;
  }
}
