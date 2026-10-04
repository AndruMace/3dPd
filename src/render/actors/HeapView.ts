// An item heap on the floor: the voxelized item (or chest/tomb/bones) from items.png, gently bobbing.
import * as THREE from 'three';
import { voxelGeometry } from '../voxel/geometry';
import { frameRect, loadSheet } from '../voxel/sheets';
import { cellToWorld } from './CharView';

const material = new THREE.MeshLambertMaterial({ vertexColors: true });

export class HeapView extends THREE.Group {
  private readonly mesh: THREE.Mesh;
  private t = Math.random() * 10;
  private dropT = 0;
  private readonly dropFrom = new THREE.Vector3();
  private readonly home = new THREE.Vector3();

  private constructor(
    readonly pos: number,
    geometry: THREE.BufferGeometry,
    private readonly bob: boolean,
  ) {
    super();
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.castShadow = true;
    this.mesh.scale.setScalar(bob ? 0.7 : 0.9);
    this.add(this.mesh);
    cellToWorld(pos, this.position);
    this.home.copy(this.position);
  }

  /** Heap.drop animation: falls into place, or arcs over from the cell it was thrown/dropped from. */
  drop(from: THREE.Vector3 | null): void {
    this.dropT = 1;
    this.dropFrom.copy(from ?? this.home);
  }

  static async create(pos: number, image: number, type: string): Promise<HeapView> {
    const sheet = await loadSheet('items.png');
    const geo = voxelGeometry('items.png', sheet, frameRect(sheet, 16, 16, image), {
      maxDepth: type === 'HEAP' ? 3 : 7,
    });
    return new HeapView(pos, geo, type === 'HEAP' || type === 'FOR_SALE');
  }

  /** A plant (plants.png): a flat, non-bobbing voxel tuft. */
  static async createPlant(pos: number, image: number): Promise<HeapView> {
    const sheet = await loadSheet('plants.png');
    const geo = voxelGeometry('plants.png', sheet, frameRect(sheet, 16, 16, image), { maxDepth: 2 });
    return new HeapView(pos, geo, false);
  }

  update(dt: number, camera: THREE.Camera, seen: boolean): void {
    this.visible = seen;
    if (this.dropT > 0) {
      this.dropT = Math.max(0, this.dropT - dt / 0.2);
      const k = 1 - this.dropT;
      this.position.lerpVectors(this.dropFrom, this.home, k);
      this.position.y = this.dropT * 0.5;
    }
    if (this.bob) {
      this.t += dt;
      this.mesh.position.y = 0.06 + Math.sin(this.t * 2.5) * 0.04;
    }
    const cam = camera.getWorldPosition(_v);
    this.mesh.rotation.y = Math.atan2(cam.x - this.position.x, cam.z - this.position.z);
  }
}

const _v = new THREE.Vector3();
