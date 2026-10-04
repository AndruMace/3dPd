// Builds the 3D terrain for a level from its terrain map using the region's original tile sheet:
// floors are textured quads, walls and wall-like features are blocks with tile art on their faces, water is an
// animated plane under the original stitched water-edge tiles, high grass is crossed blades, chasms are pits.
import * as THREE from 'three';
import { HEIGHT, LENGTH, WIDTH } from '../../engine/levels/constants';
import { flags, Terrain as T } from '../../engine/levels/Terrain';
import { voxelGeometry } from '../voxel/geometry';
import { applyWorldShader, type WorldUniforms } from './FogOfWar';
import { GeometryBuilder } from './GeometryBuilder';
import type { TileAtlas } from './TileAtlas';
import { tileForeground } from './tileForeground';

export const WALL_HEIGHT = 1;
const WATER_LEVEL = -0.12;
const PIT_DEPTH = -3;
const WALL_TOP_SHADE = 0.16;

/** Terrain drawn as a full-height block, with the tile used on its faces. */
const BLOCK_FACE: Partial<Record<number, number>> = {
  [T.WALL]: T.WALL,
  [T.WALL_DECO]: T.WALL,
  [T.SECRET_DOOR]: T.WALL,
  [T.DOOR]: T.DOOR,
  [T.LOCKED_DOOR]: T.LOCKED_DOOR,
  [T.BOOKSHELF]: T.BOOKSHELF,
  [T.BARRICADE]: T.BARRICADE,
};

/** Features stood up as voxel models (their tile minus the floor painted behind them), and that floor tile. */
const PROPS: Partial<Record<number, number>> = {
  [T.STATUE]: T.EMPTY,
  [T.STATUE_SP]: T.EMPTY_SP,
  [T.SIGN]: T.EMPTY,
  [T.ALCHEMY]: T.EMPTY,
};
/** Voxel thickness per prop: boards stay thin, statues and pots get rounded out. */
const PROP_DEPTH: Partial<Record<number, number>> = { [T.SIGN]: 2 };

/** Terrain whose floor should use a different tile than itself. Other features (wells, pedestals, traps) stay
 * floor decals, as in the 2D game. */
const FLOOR_TILE: Partial<Record<number, number>> = {
  [T.HIGH_GRASS]: T.GRASS,
  [T.OPEN_DOOR]: T.EMPTY,
  ...PROPS,
};

const isWater = (t: number) => t >= T.WATER_TILES;
const isPit = (t: number) => (flags[t] & T.PIT) !== 0;
const isBlock = (t: number) => BLOCK_FACE[t] !== undefined;

export class LevelView extends THREE.Group {
  private terrain: THREE.Mesh | null = null;
  private waterOverlay: THREE.Mesh | null = null;
  private grass: THREE.Mesh | null = null;
  private props = new THREE.Group();
  private readonly propMat: THREE.MeshLambertMaterial;
  private readonly waterPlane: THREE.Mesh;
  private readonly waterTexture: THREE.Texture;
  private readonly terrainMat: THREE.MeshLambertMaterial;
  private readonly overlayMat: THREE.MeshLambertMaterial;
  private readonly grassMat: THREE.MeshLambertMaterial;
  map: Int32Array = new Int32Array(LENGTH);

  constructor(
    private readonly atlas: TileAtlas,
    waterTexture: THREE.Texture,
    uniforms: WorldUniforms,
  ) {
    super();
    this.terrainMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true });
    applyWorldShader(this.terrainMat, uniforms, true);
    this.overlayMat = new THREE.MeshLambertMaterial({ map: atlas.texture, vertexColors: true, alphaTest: 0.5 });
    applyWorldShader(this.overlayMat, uniforms, false);
    const blades = tileForeground(atlas.pixels, T.HIGH_GRASS, T.EMPTY);
    const bladeTex = new THREE.DataTexture(new Uint8Array(blades.data.buffer), 16, 16, THREE.RGBAFormat);
    bladeTex.flipY = true;
    bladeTex.magFilter = bladeTex.minFilter = THREE.NearestFilter;
    bladeTex.colorSpace = THREE.SRGBColorSpace;
    bladeTex.needsUpdate = true;
    this.grassMat = new THREE.MeshLambertMaterial({ map: bladeTex, alphaTest: 0.5, side: THREE.DoubleSide });
    applyWorldShader(this.grassMat, uniforms, false);
    this.propMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    applyWorldShader(this.propMat, uniforms, false);
    this.add(this.props);

    this.waterTexture = waterTexture;
    waterTexture.wrapS = waterTexture.wrapT = THREE.RepeatWrapping;
    waterTexture.magFilter = THREE.NearestFilter;
    waterTexture.minFilter = THREE.NearestFilter;
    waterTexture.colorSpace = THREE.SRGBColorSpace;
    // One water texture repeat spans two cells, as in PD (32px texture, 16px cells).
    waterTexture.repeat.set(WIDTH / 2, HEIGHT / 2);
    const waterMat = new THREE.MeshLambertMaterial({ map: waterTexture });
    applyWorldShader(waterMat, uniforms, false);
    this.waterPlane = new THREE.Mesh(new THREE.PlaneGeometry(WIDTH, HEIGHT), waterMat);
    this.waterPlane.rotation.x = -Math.PI / 2;
    this.waterPlane.position.set(WIDTH / 2, WATER_LEVEL, HEIGHT / 2);
    this.waterPlane.receiveShadow = true;
    this.add(this.waterPlane);
  }

  /** Scrolls the water and turns props to face the camera, like characters. */
  update(dt: number, camera: THREE.Camera): void {
    this.waterTexture.offset.y -= dt * 0.03;
    const cam = camera.getWorldPosition(_v);
    for (const p of this.props.children) p.rotation.y = Math.atan2(cam.x - p.position.x, cam.z - p.position.z);
  }

  build(map: Int32Array): void {
    this.map = map.slice();
    for (const m of [this.terrain, this.waterOverlay, this.grass]) {
      if (m) {
        this.remove(m);
        m.geometry.dispose();
      }
    }
    this.props.clear();
    const solid = new GeometryBuilder();
    const overlay = new GeometryBuilder();
    const grass = new GeometryBuilder();
    const a = this.atlas;
    const at = (x: number, y: number) =>
      x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT ? T.WALL : this.map[x + y * WIDTH];
    let anyWater = false;

    for (let y = 0; y < HEIGHT; y++) {
      for (let x = 0; x < WIDTH; x++) {
        const t = this.map[x + y * WIDTH];

        if (isBlock(t)) {
          const face = BLOCK_FACE[t]!;
          // Top cap: dark stone, so every solid block reads as part of the wall mass.
          solid.quad(
            [
              [x, WALL_HEIGHT, y + 1],
              [x + 1, WALL_HEIGHT, y + 1],
              [x + 1, WALL_HEIGHT, y],
              [x, WALL_HEIGHT, y],
            ],
            [0, 1, 0],
            a.uv(T.WALL),
            WALL_TOP_SHADE,
            x,
            y,
            1,
          );
          const neighbours = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
          for (let side = 0; side < 4; side++) {
            const n = neighbours[side];
            if (isBlock(n) && !(t === T.DOOR || t === T.LOCKED_DOOR || n === T.DOOR || n === T.LOCKED_DOOR)) continue;
            // In PD, decorated walls (sewer pipes) show their decoration on the face you see, i.e. the south face.
            const tile = t === T.WALL_DECO && side === 2 ? T.WALL_DECO : face;
            const bottom = isPit(n) ? PIT_DEPTH : isWater(n) ? WATER_LEVEL : 0;
            solid.side(x, y, side, 0, WALL_HEIGHT, a.uv(tile), side === 2 ? 1 : side === 0 ? 0.7 : 0.85, 1);
            if (bottom < 0) solid.side(x, y, side, bottom, 0, a.uv(T.WALL), 0.5, 1);
          }
          continue;
        }

        if (isPit(t)) {
          // A pit: dark floor far below; walls of neighbouring non-pit cells are drawn by them.
          solid.floor(x, y, PIT_DEPTH, a.uv(T.CHASM), 1);
          const neighbours = [at(x, y - 1), at(x + 1, y), at(x, y + 1), at(x - 1, y)];
          for (let side = 0; side < 4; side++) {
            const n = neighbours[side];
            if (isPit(n) || isBlock(n)) continue;
            // Inner wall of the pit below a floor edge, facing into the pit.
            const nx = x + [0, 1, 0, -1][side];
            const ny = y + [-1, 0, 1, 0][side];
            const top = isWater(n) ? WATER_LEVEL : 0;
            solid.side(nx, ny, (side + 2) % 4, PIT_DEPTH, top, a.uv(T.CHASM_WALL), 0.45);
          }
          continue;
        }

        if (isWater(t)) {
          anyWater = true;
          overlay.floor(x, y, 0.001, a.uv(t), 1);
          continue;
        }

        solid.floor(x, y, 0, a.uv(FLOOR_TILE[t] ?? t));

        const propBase = PROPS[t];
        if (propBase !== undefined) {
          const fg = tileForeground(a.pixels, t, propBase);
          const geo = voxelGeometry(
            `${a.file}#${t}`,
            fg,
            { x: 0, y: 0, w: 16, h: 16 },
            { maxDepth: PROP_DEPTH[t] ?? 7 },
          );
          const prop = new THREE.Mesh(geo, this.propMat);
          prop.position.set(x + 0.5, 0, y + 0.5);
          this.props.add(prop);
        }

        if (t === T.HIGH_GRASS) {
          // Two crossed, upright quads of the grass blades from the high-grass tile.
          const uv: [number, number, number, number] = [0, 0, 1, 1];
          const h = 0.85;
          grass.quad(
            [
              [x, 0, y],
              [x + 1, 0, y + 1],
              [x + 1, h, y + 1],
              [x, h, y],
            ],
            [0, 0, 1],
            uv,
            1,
            x,
            y,
          );
          grass.quad(
            [
              [x + 1, 0, y],
              [x, 0, y + 1],
              [x, h, y + 1],
              [x + 1, h, y],
            ],
            [0, 0, 1],
            uv,
            1,
            x,
            y,
          );
        }
      }
    }

    this.terrain = new THREE.Mesh(solid.build(), this.terrainMat);
    this.terrain.receiveShadow = true;
    this.add(this.terrain);
    this.waterOverlay = new THREE.Mesh(overlay.build(), this.overlayMat);
    this.add(this.waterOverlay);
    this.grass = new THREE.Mesh(grass.build(), this.grassMat);
    this.add(this.grass);
    this.waterPlane.visible = anyWater;
  }

  /** Terrain changed at runtime (doors, discovered secrets, burnt grass): rebuild. Cheap at 32x32. */
  setCell(cell: number, value: number): void {
    if (this.map[cell] === value) return;
    this.map[cell] = value;
    this.build(this.map);
  }
}

const _v = new THREE.Vector3();
