// PD's FloatingText: short coloured labels (damage, "dodged", "+5EXP") that rise and fade above a character.
import * as THREE from 'three';
import type { StatusColor } from '../engine/core/events';
import { computeZoom } from './pixel/components';
import { chooseFont, drawText, layoutText } from './pixel/font';

const COLORS: Record<StatusColor, string> = {
  default: '#ffffff',
  positive: '#00ff00',
  negative: '#ff0000',
  warning: '#ff8800',
  neutral: '#ffff00',
};

const LIFESPAN = 1;
const DISTANCE = 0.6;

interface Label {
  el: HTMLCanvasElement;
  anchor: THREE.Object3D;
  height: number;
  t: number;
}

export class FloatingTextLayer {
  private readonly root: HTMLDivElement;
  private labels: Label[] = [];

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'floating-text-layer';
    parent.appendChild(this.root);
  }

  show(anchor: THREE.Object3D, text: string, color: StatusColor, height = 1): void {
    // Stack on top of labels already rising from the same character, as PD does.
    const stacked = this.labels.filter((l) => l.anchor === anchor && l.t < 0.3).length;
    // PD's FloatingText: size-9 bitmap text, hardlit in the status colour, at the UI's integer zoom.
    const dpr = window.devicePixelRatio || 1;
    const zoom = computeZoom(innerWidth, innerHeight, dpr);
    const { font, scale } = chooseFont(9, zoom);
    const layout = layoutText(text, font);
    const el = document.createElement('canvas');
    el.className = 'floating-text';
    drawText(el, layout, font, scale, COLORS[color]);
    el.style.width = `${el.width / dpr}px`;
    el.style.height = `${el.height / dpr}px`;
    this.root.appendChild(el);
    this.labels.push({ el, anchor, height: height + stacked * 0.3, t: 0 });
  }

  update(dt: number, camera: THREE.Camera, width: number, height: number): void {
    this.labels = this.labels.filter((l) => {
      l.t += dt;
      if (l.t >= LIFESPAN || !l.anchor.parent) {
        l.el.remove();
        return false;
      }
      const p = l.anchor.getWorldPosition(_p);
      p.y += l.height + (l.t / LIFESPAN) * DISTANCE;
      p.project(camera);
      l.el.style.transform = `translate(${((p.x + 1) / 2) * width}px, ${((1 - p.y) / 2) * height}px) translate(-50%, -100%)`;
      l.el.style.opacity = String(Math.min(1, (LIFESPAN - l.t) / (LIFESPAN / 2)));
      l.el.style.display = l.anchor.visible ? '' : 'none';
      return true;
    });
  }
}

const _p = new THREE.Vector3();
