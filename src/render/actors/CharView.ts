// The view of one character: its voxel flipbook plus PD's CharSprite behaviours (move tween, facing, attack,
// death fade, damage flash, hop on the spot).
import * as THREE from 'three';
import { WIDTH } from '../../engine/levels/constants';
import { VoxelSprite } from './VoxelSprite';

/** PD's CharSprite.MOVE_INTERVAL: seconds to cross one cell. */
export const MOVE_INTERVAL = 0.1;
const FLASH_INTERVAL = 0.05;

export function cellToWorld(cell: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set((cell % WIDTH) + 0.5, 0, Math.floor(cell / WIDTH) + 0.5);
}

export class CharView extends THREE.Group {
  pos = 0;
  hp = 1;
  ht = 1;
  private moveFrom = new THREE.Vector3();
  private moveTo = new THREE.Vector3();
  private moveT = 1;
  private dying = false;
  private fade = 1;
  private flashT = 0;
  /** Whether the hero can currently see this character. */
  seen = true;

  private constructor(
    readonly charId: number,
    readonly sprite: VoxelSprite,
  ) {
    super();
    this.add(sprite);
    this.add(new THREE.Mesh(BLOB_GEOMETRY, BLOB_MATERIAL));
  }

  static async create(id: number, spriteId: string, pos: number): Promise<CharView> {
    const view = new CharView(id, await VoxelSprite.create(spriteId));
    view.place(pos);
    view.sprite.play('idle');
    return view;
  }

  get isMoving(): boolean {
    return this.moveT < 1;
  }

  place(cell: number): void {
    this.pos = cell;
    cellToWorld(cell, this.position);
    this.moveT = 1;
  }

  move(from: number, to: number, camera: THREE.Camera): void {
    this.pos = to;
    cellToWorld(from, this.moveFrom);
    cellToWorld(to, this.moveTo);
    this.moveT = 0;
    this.turnTo(from, to, camera);
    this.sprite.play('run');
  }

  /** PD flips the sprite to face left when the target is to the left on screen. */
  turnTo(from: number, to: number, camera: THREE.Camera): void {
    const a = cellToWorld(from, _a);
    const b = cellToWorld(to, _b);
    const right = _r.setFromMatrixColumn(camera.matrixWorld, 0);
    const d = (b.x - a.x) * right.x + (b.z - a.z) * right.z;
    if (Math.abs(d) > 1e-3) this.sprite.flipped = d < 0;
  }

  /** Plays an animation once and returns its duration in seconds. */
  playOnce(name: string): number {
    const anim = this.sprite.def.animations[name];
    if (!anim) return 0;
    this.sprite.play(name, true);
    return anim.frames.length / anim.fps;
  }

  flash(): void {
    this.flashT = FLASH_INTERVAL * 2;
  }

  die(): number {
    this.dying = true;
    return this.playOnce('die');
  }

  get gone(): boolean {
    return this.dying && this.fade <= 0;
  }

  update(dt: number, camera: THREE.Camera): void {
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / MOVE_INTERVAL);
      this.position.lerpVectors(this.moveFrom, this.moveTo, this.moveT);
      if (this.moveT >= 1 && !this.dying) this.sprite.play('idle');
    }
    if (this.dying && this.sprite.clip.finished) this.fade -= dt / 1.0;
    this.sprite.update(dt, camera);

    const mat = this.sprite.material;
    const flashing = this.flashT > 0;
    this.flashT -= dt;
    mat.emissiveIntensity = flashing ? 1 : 0;
    mat.opacity = Math.max(0, this.fade);
    mat.transparent = this.fade < 1;
    this.visible = this.seen && !this.gone;
  }
}

// A soft contact shadow under every character.
const BLOB_GEOMETRY = new THREE.PlaneGeometry(0.8, 0.8).rotateX(-Math.PI / 2).translate(0, 0.01, 0);
const BLOB_MATERIAL = new THREE.MeshBasicMaterial({
  map: (() => {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })(),
  transparent: true,
  depthWrite: false,
});

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _r = new THREE.Vector3();
