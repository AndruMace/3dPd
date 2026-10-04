// Port of levels/Level.java. PD kept the per-cell flag maps (passable, losBlocking, ...) and fieldOfView as
// statics; here they belong to the level instance.
import { Assets } from '../../content/generated/Assets';
import { Dungeon, Statistics } from '../Dungeon';
import { Actor } from '../actors/Actor';
import type { Blob } from '../actors/blobs/Blob';
import { WellWater, Alchemy } from '../actors/blobs/blobs';
import { Awareness, Blindness, MindVision, Shadows } from '../actors/buffs/buffs';
import type { Char } from '../actors/Char';
import { Bestiary } from '../actors/mobs/Bestiary';
import type { Mob } from '../actors/mobs/Mob';
import type { Bundlable, Bundle } from '../core/Bundle';
import { classNameOf } from '../core/Bundle';
import { Events, GLog } from '../core/events';
import { Sample } from '../core/fx';
import { Random } from '../core/Random';
import { Generator } from '../items/Generator';
import { Heap } from '../items/Heap';
import type { Item } from '../items/Item';
import { PotionOfStrength } from '../items/potions/potions';
import { ScrollOfEnchantment, ScrollOfUpgrade } from '../items/scrolls/scrolls';
import { castShadow } from '../mechanics/ShadowCaster';
import { observe } from '../observe';
import { Seed, type Plant } from '../plants/plants';
import { HEIGHT, LENGTH, NEIGHBOURS4, NEIGHBOURS8, NEIGHBOURS9, WIDTH } from './constants';
import { Chasm, HighGrass } from './features';
import type { Room } from './Room';
import { flags as terrainFlags, Terrain } from './Terrain';
import {
  AlarmTrap,
  FireTrap,
  GrippingTrap,
  LightningTrap,
  ParalyticTrap,
  PoisonTrap,
  SummoningTrap,
  ToxicTrap,
} from './traps/traps';

export type Feeling = 'NONE' | 'CHASM' | 'WATER' | 'GRASS';

const TIME_TO_RESPAWN = 50;

export abstract class Level implements Bundlable {
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
  /** Blobs by class name (PD keyed them by class). */
  blobs = new Map<string, Blob>();
  plants = new Map<number, Plant>();
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
    this.blobs = new Map();
    this.plants = new Map();

    if (!Dungeon.bossLevel()) {
      this.addItemToSpawn(Generator.random('FOOD'));
      if (Dungeon.posNeeded()) {
        this.addItemToSpawn(new PotionOfStrength());
        Dungeon.potionOfStrength++;
      }
      if (Dungeon.souNeeded()) {
        this.addItemToSpawn(new ScrollOfUpgrade());
        Dungeon.scrollsOfUpgrade++;
      }
      if (Dungeon.soeNeeded()) {
        this.addItemToSpawn(new ScrollOfEnchantment());
        Dungeon.scrollsOfEnchantment++;
      }
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
    } while (!this.build());
    this.decorate();

    this.buildFlagMaps();
    this.cleanWalls();

    this.createMobs();
    this.createItems();
  }

  /** Respawn mobs on a revisited level (bosses and NPCs stay; everything else may be replaced). */
  reset(): void {
    for (const mob of [...this.mobs]) if (!mob.reset()) this.mobs.delete(mob);
    this.createMobs();
  }

  storeInBundle(bundle: Bundle): void {
    bundle.put('map', this.map);
    bundle.put(
      'visited',
      Array.from(this.visited, (v) => v === 1),
    );
    bundle.put(
      'mapped',
      Array.from(this.mapped, (v) => v === 1),
    );
    bundle.put('entrance', this.entrance);
    bundle.put('exit', this.exit);
    bundle.put('feeling', this.feeling);
    bundle.put('heaps', this.heaps.values());
    bundle.put('plants', this.plants.values());
    bundle.put('mobs', this.mobs);
    bundle.put('blobs', this.blobs.values());
  }

  restoreFromBundle(bundle: Bundle): void {
    this.mobs = new Set();
    this.heaps = new Map();
    this.blobs = new Map();
    this.plants = new Map();

    this.map.set(bundle.getIntArray('map'));
    this.visited.set(bundle.getBooleanArray('visited').map((v) => (v ? 1 : 0)));
    this.mapped.set(bundle.getBooleanArray('mapped').map((v) => (v ? 1 : 0)));
    this.entrance = bundle.getInt('entrance');
    this.exit = bundle.getInt('exit');
    this.feeling = bundle.getEnum<Feeling>('feeling', 'NONE');
    Level.weakFloorCreated = false;

    for (const heap of bundle.getCollection<Heap>('heaps')) this.heaps.set(heap.pos, heap);
    for (const plant of bundle.getCollection<Plant>('plants')) this.plants.set(plant.pos, plant);
    for (const mob of bundle.getCollection<Mob>('mobs')) this.mobs.add(mob);
    for (const blob of bundle.getCollection<Blob>('blobs')) this.blobs.set(classNameOf(blob), blob);

    this.buildFlagMaps();
    this.cleanWalls();
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

  /** GameScene.add(mob[, delay]): put a mob into play on the current level. */
  addMob(mob: Mob, delay?: number): void {
    this.mobs.add(mob);
    if (delay === undefined) Actor.add(mob);
    else Actor.addDelayed(mob, delay);
    Actor.occupyCell(mob);
    Events.emit({ type: 'spawn', id: mob.id(), sprite: mob.spriteId, pos: mob.pos });
    for (const state of mob.spriteStates()) mob.setState(state, true);
  }

  /** GameScene.add(blob): make sure a blob is acting and visible. */
  addBlob(blob: Blob): void {
    Actor.add(blob);
    blob.notifyView();
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

  itemToSpanAsPrize(): Item | null {
    if (Random.Int(this.itemsToSpawn.length + 1) > 0) {
      const item = Random.element(this.itemsToSpawn)!;
      this.itemsToSpawn.splice(this.itemsToSpawn.indexOf(item), 1);
      return item;
    }
    return null;
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

  /** Level.set: change terrain at runtime and keep the flag maps (and the view) in sync. */
  set(cell: number, terrain: number): void {
    this.map[cell] = terrain;
    this.updateFlags(cell);
    this.water[cell] = terrain === Terrain.WATER || terrain >= Terrain.WATER_TILES ? 1 : 0;
    Events.emit({ type: 'terrain', cell, value: terrain });
  }

  drop(item: Item, cell: number): Heap {
    if (this.map[cell] === Terrain.ALCHEMY && !(item instanceof Seed)) {
      let n: number;
      do {
        n = cell + NEIGHBOURS8[Random.Int(8)];
      } while (this.map[n] !== Terrain.EMPTY_SP);
      cell = n;
    }

    let heap = this.heaps.get(cell);
    if (!heap) {
      heap = new Heap();
      heap.pos = cell;
      if (this.map[cell] === Terrain.CHASM || (Dungeon.level === this && this.pit[cell])) {
        Dungeon.dropToChasm(item);
        Events.emit({ type: 'fx', fx: 'discardHeap', pos: cell, v: item.imageIndex() });
        return heap;
      }
      this.heaps.set(cell, heap);
    } else if (heap.type === 'LOCKED_CHEST' || heap.type === 'CRYSTAL_CHEST') {
      let n: number;
      do {
        n = cell + NEIGHBOURS8[Random.Int(8)];
      } while (!this.passable[n] && !this.avoid[n]);
      return this.drop(item, n);
    }
    heap.drop(item);

    if (Dungeon.level === this) this.press(cell, null);
    return heap;
  }

  plant(seed: Seed, pos: number): Plant {
    this.plants.get(pos)?.wither();
    const plant = seed.couch(pos);
    this.plants.set(pos, plant);
    Events.emit({ type: 'plant', pos, image: plant.image });
    return plant;
  }

  uproot(pos: number): void {
    this.plants.delete(pos);
    Events.emit({ type: 'plant', pos, image: -1 });
  }

  pitCell(): number {
    return this.randomRespawnCell();
  }

  /** The room containing a cell (RegularLevel only). */
  roomAt(_pos: number): Room | null {
    return null;
  }

  isDeadEnd(): boolean {
    return false;
  }

  /** Boss levels lock their entrance while the boss fight is on (SewerBossLevel.seal/unseal). */
  seal(): void {}
  unseal(): void {}

  // ---- Doors (levels/features/Door.java) ----

  doorEnter(pos: number): void {
    this.set(pos, Terrain.OPEN_DOOR);
    observe();
    if (Dungeon.visible[pos]) Sample.play(Assets.SND_OPEN, pos);
  }

  doorLeave(pos: number): void {
    if (!this.heaps.has(pos)) {
      this.set(pos, Terrain.DOOR);
      observe();
    }
  }

  /** A character (or a dropped item, ch = null) presses a cell: traps, grass, wells, doors, plants. */
  press(cell: number, ch: Char | null): void {
    if (this.pit[cell] && ch === Dungeon.hero) {
      Chasm.heroFall(cell);
      return;
    }

    let trap = false;
    const clicks = () => GLog.i('A hidden pressure plate clicks!');
    switch (this.map[cell]) {
      case Terrain.SECRET_TOXIC_TRAP:
        clicks();
      // falls through
      case Terrain.TOXIC_TRAP:
        trap = true;
        ToxicTrap.trigger(cell);
        break;
      case Terrain.SECRET_FIRE_TRAP:
        clicks();
      // falls through
      case Terrain.FIRE_TRAP:
        trap = true;
        FireTrap.trigger(cell);
        break;
      case Terrain.SECRET_PARALYTIC_TRAP:
        clicks();
      // falls through
      case Terrain.PARALYTIC_TRAP:
        trap = true;
        ParalyticTrap.trigger(cell);
        break;
      case Terrain.SECRET_POISON_TRAP:
        clicks();
      // falls through
      case Terrain.POISON_TRAP:
        trap = true;
        PoisonTrap.trigger(cell, ch);
        break;
      case Terrain.SECRET_ALARM_TRAP:
        clicks();
      // falls through
      case Terrain.ALARM_TRAP:
        trap = true;
        AlarmTrap.trigger(cell, ch);
        break;
      case Terrain.SECRET_LIGHTNING_TRAP:
        clicks();
      // falls through
      case Terrain.LIGHTNING_TRAP:
        trap = true;
        LightningTrap.trigger(cell, ch);
        break;
      case Terrain.SECRET_GRIPPING_TRAP:
        clicks();
      // falls through
      case Terrain.GRIPPING_TRAP:
        trap = true;
        GrippingTrap.trigger(cell, ch);
        break;
      case Terrain.SECRET_SUMMONING_TRAP:
        clicks();
      // falls through
      case Terrain.SUMMONING_TRAP:
        trap = true;
        SummoningTrap.trigger(cell, ch);
        break;
      case Terrain.HIGH_GRASS:
        HighGrass.trample(this, cell, ch);
        break;
      case Terrain.WELL:
        WellWater.affectCell(cell);
        break;
      case Terrain.ALCHEMY:
        if (ch === null) Alchemy.transmute(cell);
        break;
      case Terrain.DOOR:
        this.doorEnter(cell);
        break;
    }

    if (trap) {
      Sample.play(Assets.SND_TRAP, cell);
      if (ch === Dungeon.hero) Dungeon.hero.interrupt();
      this.set(cell, Terrain.INACTIVE_TRAP);
    }

    this.plants.get(cell)?.activate(ch);
  }

  /** A mob steps on a cell: only visible traps, chasms, doors and plants affect it. */
  mobPress(mob: Mob): void {
    const cell = mob.pos;
    if (this.pit[cell] && !mob.flying) {
      Chasm.mobFall(mob);
      return;
    }

    let trap = true;
    switch (this.map[cell]) {
      case Terrain.TOXIC_TRAP:
        ToxicTrap.trigger(cell);
        break;
      case Terrain.FIRE_TRAP:
        FireTrap.trigger(cell);
        break;
      case Terrain.PARALYTIC_TRAP:
        ParalyticTrap.trigger(cell);
        break;
      case Terrain.POISON_TRAP:
        PoisonTrap.trigger(cell, mob);
        break;
      case Terrain.ALARM_TRAP:
        AlarmTrap.trigger(cell, mob);
        break;
      case Terrain.LIGHTNING_TRAP:
        LightningTrap.trigger(cell, mob);
        break;
      case Terrain.GRIPPING_TRAP:
        GrippingTrap.trigger(cell, mob);
        break;
      case Terrain.SUMMONING_TRAP:
        SummoningTrap.trigger(cell, mob);
        break;
      case Terrain.DOOR:
        this.doorEnter(cell);
      // falls through (as in the original)
      default:
        trap = false;
    }

    if (trap) {
      if (Dungeon.visible[cell]) Sample.play(Assets.SND_TRAP, cell);
      this.set(cell, Terrain.INACTIVE_TRAP);
    }

    this.plants.get(cell)?.activate(mob);
  }

  updateFieldOfView(c: Char): Uint8Array {
    const cx = c.pos % WIDTH;
    const cy = Math.floor(c.pos / WIDTH);
    const fov = this.fieldOfView;

    const sighted = c.buff(Blindness) === null && c.buff(Shadows) === null && c.isAlive();
    if (sighted) castShadow(cx, cy, fov, c.viewDistance, this.losBlocking);
    else fov.fill(0);

    let sense = 1;
    if (c.isAlive()) for (const b of c.buffsOf(MindVision)) sense = Math.max(b.distance, sense);

    if ((sighted && sense > 1) || !sighted) {
      const ax = Math.max(0, cx - sense);
      const bx = Math.min(cx + sense, WIDTH - 1);
      const ay = Math.max(0, cy - sense);
      const by = Math.min(cy + sense, HEIGHT - 1);
      const len = bx - ax + 1;
      let pos = ax + ay * WIDTH;
      for (let y = ay; y <= by; y++, pos += WIDTH) fov.fill(1, pos, pos + len);
      for (let i = 0; i < LENGTH; i++) fov[i] &= this.discoverable[i];
    }

    const reveal = (p: number) => {
      for (const n of NEIGHBOURS9) fov[p + n] = 1;
    };
    if (c.isAlive()) {
      if (c.buff(MindVision) !== null) {
        for (const mob of this.mobs) reveal(mob.pos);
      } else if (c === Dungeon.hero && Dungeon.hero.heroClass === 'HUNTRESS') {
        for (const mob of this.mobs) if (distanceCells(c.pos, mob.pos) === 2) reveal(mob.pos);
      }
      if (c.buff(Awareness) !== null) for (const heap of this.heaps.values()) reveal(heap.pos);
    }
    return fov;
  }

  tileName(tile: number): string {
    if (tile >= Terrain.WATER_TILES) return this.tileName(Terrain.WATER);
    if (tile !== Terrain.CHASM && terrainFlags[tile] & Terrain.PIT) return this.tileName(Terrain.CHASM);
    const T = Terrain;
    switch (tile) {
      case T.CHASM:
        return 'Chasm';
      case T.EMPTY:
      case T.EMPTY_SP:
      case T.EMPTY_DECO:
      case T.SECRET_TOXIC_TRAP:
      case T.SECRET_FIRE_TRAP:
      case T.SECRET_PARALYTIC_TRAP:
      case T.SECRET_POISON_TRAP:
      case T.SECRET_ALARM_TRAP:
      case T.SECRET_LIGHTNING_TRAP:
        return 'Floor';
      case T.GRASS:
        return 'Grass';
      case T.WATER:
        return 'Water';
      case T.WALL:
      case T.WALL_DECO:
      case T.SECRET_DOOR:
        return 'Wall';
      case T.DOOR:
        return 'Closed door';
      case T.OPEN_DOOR:
        return 'Open door';
      case T.ENTRANCE:
        return 'Depth entrance';
      case T.EXIT:
        return 'Depth exit';
      case T.EMBERS:
        return 'Embers';
      case T.LOCKED_DOOR:
        return 'Locked door';
      case T.PEDESTAL:
        return 'Pedestal';
      case T.BARRICADE:
        return 'Barricade';
      case T.HIGH_GRASS:
        return 'High grass';
      case T.LOCKED_EXIT:
        return 'Locked depth exit';
      case T.UNLOCKED_EXIT:
        return 'Unlocked depth exit';
      case T.SIGN:
        return 'Sign';
      case T.WELL:
        return 'Well';
      case T.EMPTY_WELL:
        return 'Empty well';
      case T.STATUE:
      case T.STATUE_SP:
        return 'Statue';
      case T.TOXIC_TRAP:
        return 'Toxic gas trap';
      case T.FIRE_TRAP:
        return 'Fire trap';
      case T.PARALYTIC_TRAP:
        return 'Paralytic gas trap';
      case T.POISON_TRAP:
        return 'Poison dart trap';
      case T.ALARM_TRAP:
        return 'Alarm trap';
      case T.LIGHTNING_TRAP:
        return 'Lightning trap';
      case T.GRIPPING_TRAP:
        return 'Gripping trap';
      case T.SUMMONING_TRAP:
        return 'Summoning trap';
      case T.INACTIVE_TRAP:
        return 'Triggered trap';
      case T.BOOKSHELF:
        return 'Bookshelf';
      case T.ALCHEMY:
        return 'Alchemy pot';
      default:
        return '???';
    }
  }

  tileDesc(tile: number): string {
    const T = Terrain;
    switch (tile) {
      case T.CHASM:
        return "You can't see the bottom.";
      case T.WATER:
        return 'In case of burning step into the water to extinguish the fire.';
      case T.ENTRANCE:
        return 'Stairs lead up to the upper depth.';
      case T.EXIT:
      case T.UNLOCKED_EXIT:
        return 'Stairs lead down to the lower depth.';
      case T.EMBERS:
        return 'Embers cover the floor.';
      case T.HIGH_GRASS:
        return 'Dense vegetation blocks the view.';
      case T.LOCKED_DOOR:
        return 'This door is locked, you need a matching key to unlock it.';
      case T.LOCKED_EXIT:
        return 'Heavy bars block the stairs leading down.';
      case T.BARRICADE:
        return 'The wooden barricade is firmly set but has dried over the years. Might it burn?';
      case T.SIGN:
        return "You can't read the text from here.";
      case T.TOXIC_TRAP:
      case T.FIRE_TRAP:
      case T.PARALYTIC_TRAP:
      case T.POISON_TRAP:
      case T.ALARM_TRAP:
      case T.LIGHTNING_TRAP:
      case T.GRIPPING_TRAP:
      case T.SUMMONING_TRAP:
        return 'Stepping onto a hidden pressure plate will activate the trap.';
      case T.INACTIVE_TRAP:
        return "The trap has been triggered before and it's not dangerous anymore.";
      case T.STATUE:
      case T.STATUE_SP:
        return 'Someone wanted to adorn this place, but failed, obviously.';
      case T.ALCHEMY:
        return 'Drop some seeds here to cook a potion.';
      case T.EMPTY_WELL:
        return 'The well has run dry.';
      default:
        if (tile >= T.WATER_TILES) return this.tileDesc(T.WATER);
        if (terrainFlags[tile] & T.PIT) return this.tileDesc(T.CHASM);
        return '';
    }
  }
}

function distanceCells(a: number, b: number): number {
  return Math.max(Math.abs((a % WIDTH) - (b % WIDTH)), Math.abs(Math.floor(a / WIDTH) - Math.floor(b / WIDTH)));
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
      if (Dungeon.hero.isAlive() && mob.pos !== -1) {
        level.addMob(mob);
        if (Statistics.amuletObtained) mob.beckon(Dungeon.hero.pos);
      }
    }
    this.spend(Dungeon.nightMode || Statistics.amuletObtained ? TIME_TO_RESPAWN / 2 : TIME_TO_RESPAWN);
    return true;
  }
}
