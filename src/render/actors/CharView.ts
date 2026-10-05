// The view of one character: its voxel flipbook plus PD's CharSprite behaviours (move tween, facing, attack,
// death fade, damage flash, hop on the spot).
import * as THREE from 'three';
import type { CharState } from '../../engine/core/events';
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
  private moveDuration = MOVE_INTERVAL;
  /** Arc height of the current tween (jumps); 0 for walking. */
  private moveArc = 0;
  /** Falling into a chasm: shrink and sink. */
  private falling = 0;
  private fadeTarget = 1;
  private fadeSpeed = 0;
  readonly states = new Set<CharState>();
  private t = Math.random() * 10;
  private telegraphT = 0;
  private hopT = 1;
  private hopLen = 1;
  private hopHeight = 0;
  private telegraphLen = 0;
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
    this.tween(from, to, MOVE_INTERVAL, 0);
    this.turnTo(from, to, camera);
    this.sprite.play('run');
  }

  /** Action mode: run while the body moves, idle when it stops (one-shot animations play out first). */
  setRunning(running: boolean): void {
    const anims = this.sprite.def.animations;
    const cur = this.sprite.clip.anim;
    if (this.dying || this.falling > 0) return;
    if (running && (cur === anims.idle || !cur || this.sprite.clip.finished)) this.sprite.play('run');
    else if (!running && cur === anims.run) this.sprite.play('idle');
  }

  /** A position tween without the run animation (Pushing, Swap, jump arcs). Returns its duration. */
  tween(from: number, to: number, duration: number, arc: number): number {
    this.pos = to;
    cellToWorld(from, this.moveFrom);
    cellToWorld(to, this.moveTo);
    this.moveT = 0;
    this.moveDuration = duration;
    this.moveArc = arc;
    return duration;
  }

  /** Action mode: an arc in the air (a leap), leaving the ground position to the body. */
  hop(seconds: number, height: number): void {
    this.hopT = 0;
    this.hopLen = seconds;
    this.hopHeight = height;
  }

  /** CharSprite.fall(): drop into a chasm (scale down and sink), then vanish. */
  fall(): number {
    this.falling = 0.001;
    return 0.5;
  }

  /** AlphaTweener: fade to `alpha` over `duration` seconds. */
  fadeTo(alpha: number, duration: number): void {
    this.fadeTarget = alpha;
    this.fadeSpeed = duration > 0 ? Math.abs(alpha - this.fade) / duration : Infinity;
  }

  setState(state: CharState, on: boolean): void {
    if (on) this.states.add(state);
    else this.states.delete(state);
    if (state === 'INVISIBLE') this.fadeTo(on ? 0.4 : 1, 0.4);
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

  /** Action mode: an attack is coming. The character glows red for the wind-up. */
  telegraph(seconds: number): void {
    this.telegraphT = this.telegraphLen = seconds;
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
    this.t += dt;
    if (this.moveT < 1) {
      this.moveT = Math.min(1, this.moveT + dt / this.moveDuration);
      this.position.lerpVectors(this.moveFrom, this.moveTo, this.moveT);
      this.position.y = this.moveArc * 4 * this.moveT * (1 - this.moveT);
      if (this.moveT >= 1 && !this.dying && this.sprite.clip.anim === this.sprite.def.animations.run)
        this.sprite.play('idle');
    }
    // CharSprite.onComplete: one-shot actions return to idle.
    const anims = this.sprite.def.animations;
    const cur = this.sprite.clip.anim;
    if (!this.dying && this.sprite.clip.finished && cur && cur !== anims.die && cur !== anims.idle && cur !== anims.run)
      this.sprite.play('idle');
    if (this.dying && this.sprite.clip.finished) this.fade -= dt / 1.0;
    else if (this.fade !== this.fadeTarget && !this.dying) {
      const step = this.fadeSpeed * dt;
      this.fade =
        Math.abs(this.fadeTarget - this.fade) <= step
          ? this.fadeTarget
          : this.fade + Math.sign(this.fadeTarget - this.fade) * step;
    }
    if (this.falling > 0) {
      this.falling += dt;
      const k = Math.max(0, 1 - this.falling / 0.5);
      this.sprite.scale.setScalar(k);
      this.position.y = -(1 - k) * 1.5;
      if (k === 0) this.fade = 0;
      this.dying = this.dying || k === 0;
    }
    if (this.hopT < this.hopLen) {
      this.hopT += dt;
      const k = Math.min(1, this.hopT / this.hopLen);
      this.position.y = this.hopHeight * 4 * k * (1 - k);
    }
    // Paralysed and frozen characters stop animating.
    const frozen = this.states.has('PARALYSED') || this.states.has('FROZEN');
    this.sprite.update(frozen ? 0 : dt, camera);
    if (this.states.has('LEVITATING') && this.moveT >= 1 && this.falling === 0)
      this.sprite.position.y = 0.25 + Math.sin(this.t * 3) * 0.06;
    else this.sprite.position.y = 0;

    const mat = this.sprite.material;
    const flashing = this.flashT > 0;
    this.flashT -= dt;
    this.telegraphT = Math.max(0, this.telegraphT - dt);
    if (flashing) {
      mat.emissive.setRGB(1, 1, 1);
      mat.emissiveIntensity = 1;
    } else if (this.telegraphT > 0) {
      // Builds up towards the strike.
      const k = 1 - this.telegraphT / Math.max(this.telegraphLen, 1e-3);
      mat.emissive.setRGB(1, 0.15, 0.1);
      mat.emissiveIntensity = 0.25 + 0.6 * k;
    } else {
      mat.emissiveIntensity = 0;
    }
    if (this.states.has('FROZEN')) mat.color.setRGB(0.6, 0.8, 1.6);
    else if (this.states.has('ILLUMINATED')) mat.color.setRGB(1.3, 1.3, 1.1);
    else mat.color.setRGB(1, 1, 1);
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
