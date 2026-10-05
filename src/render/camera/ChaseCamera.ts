// Action mode's third-person camera: behind and above the hero, looking slightly down, with a small shoulder
// offset so the voxel figures are seen a little from the side rather than straight from behind. The player turns
// it by dragging (or with Q/E); with touch movement it slowly swings round behind the direction of travel.
import * as THREE from 'three';

/** Distances in cells (one cell is 3 m). */
const MIN_DIST = 0.9;
const MAX_DIST = 3.2;
/** Height of the point the camera looks at, above the hero's feet. */
const LOOK_HEIGHT = 0.25;
/** The camera looks this far ahead of the hero, so the hero sits low in the frame and what's in front shows. */
const LOOK_AHEAD = 0.55;

export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** The hero's position (feet). */
  readonly target = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  /** Yaw in radians; 0 looks north (towards -z), as the top-down rig. */
  yaw = 0;
  private yawTarget = 0;
  pitch = THREE.MathUtils.degToRad(40);
  distance = 2.0;
  private distanceTarget = 2.0;
  /** Sideways offset of the camera, in cells (positive: over the right shoulder). */
  shoulder = 0.22;
  /** Pulled back further on narrow (portrait) screens, where the hero would otherwise fill the view. */
  private aspectZoom = 1;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.03, 120);
  }

  /** Unit vector the camera looks along, on the ground plane. */
  forward(out = new THREE.Vector2()): THREE.Vector2 {
    return out.set(Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  snapTo(pos: THREE.Vector3): void {
    this.target.copy(pos);
    this.focus.copy(pos);
  }

  /** Turn by `radians`; `snap` eases there instead of jumping. */
  rotateBy(radians: number, snap = false): void {
    this.yawTarget += radians;
    if (!snap) this.yaw = this.yawTarget;
  }

  /** Ease the yaw towards looking along world direction (dx, dz), at up to `rate` radians per second. */
  follow(dx: number, dz: number, rate: number, dt: number): void {
    if (Math.hypot(dx, dz) < 1e-3) return;
    const want = Math.atan2(dx, -dz);
    let diff = want - this.yawTarget;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    // Running back towards the camera shouldn't spin it round.
    if (Math.abs(diff) > THREE.MathUtils.degToRad(120)) return;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
    this.yawTarget += step;
    this.yaw += step;
  }

  settle(): void {}

  zoomBy(factor: number): void {
    this.distanceTarget = THREE.MathUtils.clamp(this.distanceTarget * factor, MIN_DIST, MAX_DIST);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 72 : 60;
    this.aspectZoom = aspect < 1 ? 1.35 : 1;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 14);
    this.focus.lerp(this.target, k);
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 12));
    this.distance += (this.distanceTarget - this.distance) * (1 - Math.exp(-dt * 10));
    const f = this.forward(_f);
    const dist = this.distance * this.aspectZoom;
    const horiz = dist * Math.cos(this.pitch);
    const up = dist * Math.sin(this.pitch);
    // Right vector is forward turned 90° clockwise: (-f.y, f.x).
    const rx = -f.y;
    const rz = f.x;
    const lx = this.focus.x + f.x * LOOK_AHEAD + rx * this.shoulder;
    const lz = this.focus.z + f.y * LOOK_AHEAD + rz * this.shoulder;
    _look.set(lx, this.focus.y + LOOK_HEIGHT, lz);
    this.camera.position.set(lx - f.x * horiz, this.focus.y + LOOK_HEIGHT + up, lz - f.y * horiz);
    this.camera.lookAt(_look);
  }

  /** Direction from the camera towards the hero on the ground plane (for the wall cut-away). */
  viewDir(out: THREE.Vector2): THREE.Vector2 {
    return this.forward(out);
  }

  /** Camera-relative stick (x right, y forward) to a world direction on the ground plane. */
  stickToWorld(sx: number, sy: number): [number, number] {
    const f = this.forward(_f);
    return [-f.y * sx + f.x * sy, f.x * sx + f.y * sy];
  }

  screenToGrid(sx: number, sy: number): [number, number] {
    const [x, z] = this.stickToWorld(sx, -sy);
    return [Math.round(x), Math.round(z)];
  }
}

const _f = new THREE.Vector2();
const _look = new THREE.Vector3();
