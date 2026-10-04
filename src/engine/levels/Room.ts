// Port of levels/Room.java: a rectangle (walls included) in the level's room graph.
import type { Bundlable, Bundle } from '../core/Bundle';
import { registerClass } from '../core/Bundle';
import { Point, Rect } from '../core/geom';
import type { GraphNode } from '../core/Graph';
import { Random } from '../core/Random';
import { WIDTH } from './constants';

export type RoomType =
  | 'NULL'
  | 'STANDARD'
  | 'ENTRANCE'
  | 'EXIT'
  | 'BOSS_EXIT'
  | 'TUNNEL'
  | 'PASSAGE'
  | 'SHOP'
  | 'BLACKSMITH'
  | 'TREASURY'
  | 'ARMORY'
  | 'LIBRARY'
  | 'LABORATORY'
  | 'VAULT'
  | 'TRAPS'
  | 'STORAGE'
  | 'MAGIC_WELL'
  | 'GARDEN'
  | 'CRYPT'
  | 'STATUE'
  | 'POOL'
  | 'RAT_KING'
  | 'WEAK_FLOOR'
  | 'PIT'
  | 'ALTAR';

export type DoorType = 'EMPTY' | 'TUNNEL' | 'REGULAR' | 'UNLOCKED' | 'HIDDEN' | 'BARRICADE' | 'LOCKED';
const DOOR_ORDER: DoorType[] = ['EMPTY', 'TUNNEL', 'REGULAR', 'UNLOCKED', 'HIDDEN', 'BARRICADE', 'LOCKED'];

export class Door extends Point {
  type: DoorType = 'EMPTY';

  /** Doors only ever upgrade to a "stronger" type. */
  setType(type: DoorType): void {
    if (DOOR_ORDER.indexOf(type) > DOOR_ORDER.indexOf(this.type)) this.type = type;
  }
}

const INITIAL_SPECIALS: RoomType[] = [
  'ARMORY',
  'WEAK_FLOOR',
  'MAGIC_WELL',
  'CRYPT',
  'POOL',
  'GARDEN',
  'LIBRARY',
  'TREASURY',
  'TRAPS',
  'STORAGE',
  'STATUE',
  'LABORATORY',
  'VAULT',
  'ALTAR',
];

/** Run-wide ordering of special room types: recently used types move to the back. */
export const SPECIALS: RoomType[] = [...INITIAL_SPECIALS];

export class Room extends Rect implements GraphNode, Bundlable {
  neigbours = new Set<Room>();
  connected = new Map<Room, Door | null>();
  distance = 0;
  price = 1;
  type: RoomType = 'NULL';

  random(m = 0): number {
    const x = Random.Int(this.left + 1 + m, this.right - m);
    const y = Random.Int(this.top + 1 + m, this.bottom - m);
    return x + y * WIDTH;
  }

  addNeigbour(other: Room): void {
    const i = this.intersect(other);
    if ((i.width() === 0 && i.height() >= 3) || (i.height() === 0 && i.width() >= 3)) {
      this.neigbours.add(other);
      other.neigbours.add(this);
    }
  }

  connect(room: Room): void {
    if (!this.connected.has(room)) {
      this.connected.set(room, null);
      room.connected.set(this, null);
    }
  }

  entrance(): Door {
    return this.connected.values().next().value!;
  }

  /** Doors of this room (after placeDoors has run). */
  doors(): Door[] {
    return [...this.connected.values()].filter((d): d is Door => d !== null);
  }

  inside(p: number): boolean {
    const x = p % WIDTH;
    const y = Math.floor(p / WIDTH);
    return x > this.left && y > this.top && x < this.right && y < this.bottom;
  }

  center(): Point {
    return new Point(
      Math.trunc((this.left + this.right) / 2) + (((this.right - this.left) & 1) === 1 ? Random.Int(2) : 0),
      Math.trunc((this.top + this.bottom) / 2) + (((this.bottom - this.top) & 1) === 1 ? Random.Int(2) : 0),
    );
  }

  edges(): Iterable<Room> {
    return this.neigbours;
  }

  storeInBundle(bundle: Bundle): void {
    bundle.put('left', this.left);
    bundle.put('top', this.top);
    bundle.put('right', this.right);
    bundle.put('bottom', this.bottom);
    bundle.put('type', this.type);
  }

  restoreFromBundle(bundle: Bundle): void {
    this.left = bundle.getInt('left');
    this.top = bundle.getInt('top');
    this.right = bundle.getInt('right');
    this.bottom = bundle.getInt('bottom');
    this.type = bundle.getEnum<RoomType>('type', 'NULL');
  }

  static storeRoomsInBundle(bundle: Bundle): void {
    bundle.put('rooms', [...SPECIALS]);
  }

  static restoreRoomsFromBundle(bundle: Bundle): void {
    if (bundle.contains('rooms'))
      SPECIALS.splice(0, SPECIALS.length, ...(bundle.getStringArray('rooms') as RoomType[]));
    else Room.shuffleTypes();
  }

  static shuffleTypes(): void {
    SPECIALS.splice(0, SPECIALS.length, ...INITIAL_SPECIALS);
    const size = SPECIALS.length;
    for (let i = 0; i < size - 1; i++) {
      const j = Random.Int(i, size);
      if (j !== i) [SPECIALS[i], SPECIALS[j]] = [SPECIALS[j], SPECIALS[i]];
    }
  }

  static useType(type: RoomType): void {
    const idx = SPECIALS.indexOf(type);
    if (idx >= 0) {
      SPECIALS.splice(idx, 1);
      SPECIALS.push(type);
    }
  }
}

registerClass('Room', Room);
