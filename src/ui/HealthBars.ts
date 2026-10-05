// Action mode: small health bars over damaged enemies in view (PD's HealthBar look: red under green), drawn in
// screen space above each character's head, at the pixel UI's scale.
import * as THREE from 'three';

interface Bar {
  el: HTMLDivElement;
  fill: HTMLDivElement;
  seen: boolean;
}

export interface BarTarget {
  id: number;
  anchor: THREE.Object3D;
  /** Height of the head above the anchor's origin (world units). */
  height: number;
  hp: number;
  ht: number;
}

export class HealthBarsLayer {
  private readonly root: HTMLDivElement;
  private readonly bars = new Map<number, Bar>();

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'health-bars-layer';
    parent.appendChild(this.root);
  }

  /** Shows bars for `targets` (and hides the rest); `scale` is CSS px per UI pixel. */
  update(targets: BarTarget[], camera: THREE.Camera, width: number, height: number, scale: number): void {
    for (const b of this.bars.values()) b.seen = false;
    for (const t of targets) {
      let bar = this.bars.get(t.id);
      if (!bar) {
        const el = document.createElement('div');
        el.className = 'enemy-health';
        const fill = document.createElement('div');
        el.appendChild(fill);
        this.root.appendChild(el);
        bar = { el, fill, seen: false };
        this.bars.set(t.id, bar);
      }
      bar.seen = true;
      const p = t.anchor.getWorldPosition(_p);
      p.y += t.height;
      p.project(camera);
      if (p.z > 1) {
        bar.el.style.display = 'none';
        continue;
      }
      const w = 16 * scale;
      bar.el.style.display = '';
      bar.el.style.width = `${w}px`;
      bar.el.style.height = `${Math.max(2, Math.round(2 * scale))}px`;
      bar.el.style.transform = `translate(${((p.x + 1) / 2) * width - w / 2}px, ${((1 - p.y) / 2) * height}px)`;
      bar.fill.style.width = `${Math.max(0, Math.min(1, t.hp / t.ht)) * 100}%`;
    }
    for (const [id, b] of this.bars) {
      if (!b.seen) {
        b.el.remove();
        this.bars.delete(id);
      }
    }
  }

  clear(): void {
    for (const b of this.bars.values()) b.el.remove();
    this.bars.clear();
  }
}

const _p = new THREE.Vector3();
