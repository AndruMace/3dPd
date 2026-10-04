// Tilted top-down camera that follows the hero, rotates around it (snapping or free) and zooms.
import * as THREE from 'three';

const MIN_DIST = 5;
const MAX_DIST = 18;

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly target = new THREE.Vector3();
  private readonly focus = new THREE.Vector3();
  /** Yaw in radians; 0 looks north (towards -z), matching PD's screen orientation. */
  yaw = 0;
  private yawTarget = 0;
  pitch = THREE.MathUtils.degToRad(55);
  /** Extra distance on narrow (portrait) screens so a similar number of cells fits across. */
  private aspectZoom = 1;
  distance = 10;
  private distanceTarget = 10;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(35, aspect, 0.1, 200);
  }

  snapTo(pos: THREE.Vector3): void {
    this.target.copy(pos);
    this.focus.copy(pos);
  }

  rotateBy(radians: number, snap = false): void {
    this.yawTarget += radians;
    if (!snap) this.yaw = this.yawTarget;
  }

  /** Rotate to the nearest quarter turn (after a free drag). */
  settle(): void {
    this.yawTarget = Math.round(this.yawTarget / (Math.PI / 2)) * (Math.PI / 2);
  }

  zoomBy(factor: number): void {
    this.distanceTarget = THREE.MathUtils.clamp(this.distanceTarget * factor, MIN_DIST, MAX_DIST);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 1 ? 46 : 35;
    this.aspectZoom = aspect < 1 ? 1.25 : 1;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    const k = 1 - Math.exp(-dt * 8);
    this.focus.lerp(this.target, k);
    this.yaw += (this.yawTarget - this.yaw) * (1 - Math.exp(-dt * 12));
    this.distance += (this.distanceTarget - this.distance) * k;
    const dist = this.distance * this.aspectZoom;
    const horiz = Math.cos(this.pitch) * dist;
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * horiz,
      this.focus.y + Math.sin(this.pitch) * dist,
      this.focus.z + Math.cos(this.yaw) * horiz,
    );
    this.camera.lookAt(this.focus);
  }

  /** Horizontal unit vector the camera looks along. */
  viewDir(out: THREE.Vector2): THREE.Vector2 {
    return out.set(-Math.sin(this.yaw), -Math.cos(this.yaw));
  }

  /** Grid direction (dx, dy) for a screen-relative direction (sx right, sy down) given the current yaw. */
  screenToGrid(sx: number, sy: number): [number, number] {
    const quarter = ((Math.round(this.yaw / (Math.PI / 2)) % 4) + 4) % 4;
    let dx = sx;
    let dy = sy;
    for (let i = 0; i < quarter; i++) [dx, dy] = [dy, -dx];
    return [dx, dy];
  }
}
