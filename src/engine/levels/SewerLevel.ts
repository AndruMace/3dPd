// Port of levels/SewerLevel.java.
import { Random } from '../core/Random';
import { LENGTH, WIDTH } from './constants';
import { generatePatch } from './Patch';
import { RegularLevel } from './RegularLevel';
import { Terrain } from './Terrain';

export class SewerLevel extends RegularLevel {
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

  protected water_(): Uint8Array {
    return generatePatch(this.feeling === 'WATER' ? 0.6 : 0.45, 5);
  }

  protected grass_(): Uint8Array {
    return generatePatch(this.feeling === 'GRASS' ? 0.6 : 0.4, 4);
  }

  protected decorate(): void {
    const map = this.map;
    for (let i = 0; i < WIDTH; i++) {
      if (map[i] === Terrain.WALL && map[i + WIDTH] === Terrain.WATER && Random.Int(4) === 0)
        map[i] = Terrain.WALL_DECO;
    }
    for (let i = WIDTH; i < LENGTH - WIDTH; i++) {
      if (
        map[i] === Terrain.WALL &&
        map[i - WIDTH] === Terrain.WALL &&
        map[i + WIDTH] === Terrain.WATER &&
        Random.Int(2) === 0
      ) {
        map[i] = Terrain.WALL_DECO;
      }
    }
    for (let i = WIDTH + 1; i < LENGTH - WIDTH - 1; i++) {
      if (map[i] === Terrain.EMPTY) {
        const count =
          (map[i + 1] === Terrain.WALL ? 1 : 0) +
          (map[i - 1] === Terrain.WALL ? 1 : 0) +
          (map[i + WIDTH] === Terrain.WALL ? 1 : 0) +
          (map[i - WIDTH] === Terrain.WALL ? 1 : 0);
        if (Random.Int(16) < count * count) map[i] = Terrain.EMPTY_DECO;
      }
    }
    for (;;) {
      const pos = this.roomEntrance!.random();
      if (pos !== this.entrance) {
        map[pos] = Terrain.SIGN;
        break;
      }
    }
  }

  tileName(tile: number): string {
    return tile === Terrain.WATER ? 'Murky water' : super.tileName(tile);
  }
}
