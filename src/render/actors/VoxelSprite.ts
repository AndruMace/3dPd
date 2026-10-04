// A character drawn as a flipbook of voxelized frames of its original sprite sheet.
import * as THREE from 'three';
import { SPRITES, type SpriteDef } from '../../content/sprites';
import { voxelGeometry } from '../voxel/geometry';
import { frameRect, loadSheet } from '../voxel/sheets';
import type { PixelSource } from '../voxel/voxelize';
import { MovieClip } from './MovieClip';

export class VoxelSprite extends THREE.Group {
  readonly def: SpriteDef;
  readonly clip: MovieClip;
  /** Armor tier row for hero sheets. */
  tier = 0;
  /** Rotate around Y to face the camera so the original silhouette is always readable. */
  billboard = true;
  /** PD sprites face right; flipping mirrors them to face left. */
  flipped = false;

  private readonly mesh: THREE.Mesh;
  /** Per-sprite material so flashes and fades don't affect other characters. */
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0xffffff, emissiveIntensity: 0 });
  private sheet: PixelSource | null = null;
  private pendingFrame = 0;

  static async create(id: string): Promise<VoxelSprite> {
    const def = SPRITES[id];
    if (!def) throw new Error(`Unknown sprite ${id}`);
    const s = new VoxelSprite(id, def);
    s.sheet = await loadSheet(def.texture);
    s.showFrame(s.pendingFrame);
    return s;
  }

  private constructor(
    readonly spriteId: string,
    def: SpriteDef,
  ) {
    super();
    this.def = def;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.material);
    this.add(this.mesh);
    this.clip = new MovieClip((f) => this.showFrame(f));
    this.name = spriteId;
  }

  play(name: string, force = false): void {
    const anim = this.def.animations[name];
    if (anim) this.clip.play(anim, force);
  }

  update(elapsed: number, camera?: THREE.Camera): void {
    this.clip.update(elapsed);
    if (this.billboard && camera) {
      const camPos = camera.getWorldPosition(_v);
      const myPos = this.getWorldPosition(_w);
      this.mesh.rotation.y = Math.atan2(camPos.x - myPos.x, camPos.z - myPos.z);
    }
    this.mesh.scale.x = this.flipped ? -1 : 1;
  }

  private showFrame(frame: number): void {
    this.pendingFrame = frame;
    if (!this.sheet) return;
    const { frameWidth: fw, frameHeight: fh } = this.def;
    const rect = frameRect(this.sheet, fw, fh, frame, this.def.rowsAreTiers ? this.tier : undefined);
    this.mesh.geometry = voxelGeometry(this.def.texture, this.sheet, rect);
  }
}

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
