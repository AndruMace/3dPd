// Transient effects on top of the particle system: PD's MagicMissile bolts, Lightning and DeathRay, thrown
// items (MissileSprite), Flare, CellEmitter streams and the camera shake.
import * as THREE from 'three';
import { voxelGeometry } from '../voxel/geometry';
import { frameRect, loadSheet } from '../voxel/sheets';
import { KINDS, ParticleSystem } from './Particles';

/** MagicMissile.SPEED (200 px/s) and MissileSprite.SPEED (240 px/s) in cells per second. */
const BOLT_SPEED = 200 / 16;
const MISSILE_SPEED = 240 / 16;

/** MagicMissile variants: the particle trail and head colour of each. */
const BOLTS: Record<string, { kind: string; color: number }> = {
  'MagicMissile.blueLight': { kind: 'Speck.LIGHT', color: 0x88ccff },
  'MagicMissile.fire': { kind: 'FlameParticle', color: 0xff6600 },
  'MagicMissile.earth': { kind: 'EarthParticle', color: 0x997755 },
  'MagicMissile.purpleLight': { kind: 'PurpleParticle.BURST', color: 0xaa66ff },
  'MagicMissile.whiteLight': { kind: 'Speck.LIGHT', color: 0xffffff },
  'MagicMissile.wool': { kind: 'Speck.WOOL', color: 0xffffff },
  'MagicMissile.poison': { kind: 'PoisonParticle', color: 0x8844ff },
  'MagicMissile.foliage': { kind: 'LeafParticle.GENERAL', color: 0x88cc44 },
  'MagicMissile.slowness': { kind: 'Speck.LIGHT', color: 0x664422 },
  'MagicMissile.force': { kind: 'Speck.LIGHT', color: 0xeeeeee },
  'MagicMissile.coldLight': { kind: 'Speck.LIGHT', color: 0xccffff },
};

interface Bolt {
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  duration: number;
  kind: string;
  color: number;
  head: THREE.Object3D;
}

interface Stream {
  kind: string;
  at: THREE.Vector3;
  interval: number;
  left: number;
  acc: number;
}

interface Ray {
  line: THREE.Line;
  t: number;
  duration: number;
}

interface Flare {
  light: THREE.PointLight;
  t: number;
}

export class FxView extends THREE.Group {
  readonly particles = new ParticleSystem();
  private bolts: Bolt[] = [];
  private streams: Stream[] = [];
  private rays: Ray[] = [];
  private flares: Flare[] = [];
  private flashes: { mesh: THREE.Mesh; t: number; duration: number; grow: boolean }[] = [];
  private shakeT = 0;
  private shakeDuration = 0;
  private shakeIntensity = 0;
  readonly shakeOffset = new THREE.Vector3();

  constructor() {
    super();
    this.add(this.particles.points);
  }

  burst(kind: string, at: THREE.Vector3, n: number, color?: number): void {
    this.particles.burst(kind, at.x, at.y, at.z, n, color);
  }

  /** CellEmitter.start(factory, interval, quantity): one particle every `interval` seconds. */
  stream(kind: string, at: THREE.Vector3, interval: number, n: number): void {
    this.streams.push({
      kind,
      at: at.clone(),
      interval: Math.max(0.01, interval),
      left: n > 0 ? n : 10,
      acc: interval,
    });
  }

  /** A magic bolt flying between two points; returns its flight time (playback waits for it). */
  bolt(name: string, from: THREE.Vector3, to: THREE.Vector3, color?: number): number {
    const def = BOLTS[name] ?? { kind: 'Speck.LIGHT', color: color ?? 0xffffff };
    const head = new THREE.Mesh(BOLT_GEO, new THREE.MeshBasicMaterial({ color: color ?? def.color }));
    const light = new THREE.PointLight(color ?? def.color, 3, 3, 1.5);
    head.add(light);
    this.add(head);
    const duration = Math.max(0.05, from.distanceTo(to) / BOLT_SPEED);
    this.bolts.push({
      from: from.clone().setY(0.55),
      to: to.clone().setY(0.55),
      t: 0,
      duration,
      kind: def.kind,
      color: color ?? def.color,
      head,
    });
    return duration;
  }

  /** Lightning and DeathRay: a jagged or straight beam that fades out. */
  ray(name: string, from: THREE.Vector3, to: THREE.Vector3, color?: number): number {
    const lightning = name === 'Lightning';
    const pts: THREE.Vector3[] = [];
    const a = from.clone().setY(0.6);
    const b = to.clone().setY(0.6);
    const segments = lightning ? Math.max(2, Math.round(a.distanceTo(b) * 2)) : 1;
    for (let i = 0; i <= segments; i++) {
      const p = a.clone().lerp(b, i / segments);
      if (lightning && i > 0 && i < segments)
        p.add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.4));
      pts.push(p);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: color ?? (lightning ? 0xffffff : 0xff66ff), transparent: true }),
    );
    this.add(line);
    const duration = lightning ? 0.3 : 0.5;
    this.rays.push({ line, t: 0, duration });
    this.burst('SparkParticle', b, lightning ? 6 : 3, color);
    return duration;
  }

  /** A thrown item arcing between cells (MissileSprite); returns its flight time. */
  missile(image: number, from: THREE.Vector3, to: THREE.Vector3): number {
    const head = new THREE.Group();
    this.add(head);
    void loadSheet('items.png').then((sheet) => {
      const geo = voxelGeometry('items.png', sheet, frameRect(sheet, 16, 16, image), { maxDepth: 2 });
      const mesh = new THREE.Mesh(geo, MISSILE_MATERIAL);
      mesh.scale.setScalar(0.6);
      head.add(mesh);
    });
    const duration = Math.max(0.05, from.distanceTo(to) / MISSILE_SPEED);
    this.bolts.push({
      from: from.clone().setY(0.5),
      to: to.clone().setY(0.4),
      t: 0,
      duration,
      kind: '',
      color: 0,
      head,
    });
    return duration;
  }

  /** A flat square flashing on a cell (CheckedCell, Discovery, Ripple). */
  cellFlash(at: THREE.Vector3, color: number, duration = 0.5, grow = false): void {
    const mesh = new THREE.Mesh(
      FLASH_GEO,
      new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    mesh.position.copy(at).setY(0.03);
    this.add(mesh);
    this.flashes.push({ mesh, t: 0, duration, grow });
  }

  flare(at: THREE.Vector3, color: number): void {
    const light = new THREE.PointLight(color, 6, 5, 1.2);
    light.position.copy(at).setY(1);
    this.add(light);
    this.flares.push({ light, t: 0 });
    this.burst('Speck.LIGHT', at, 8, color);
  }

  shake(intensity: number, duration: number): void {
    this.shakeIntensity = intensity;
    this.shakeDuration = this.shakeT = duration;
  }

  update(dt: number): void {
    for (const b of this.bolts) {
      b.t += dt;
      const k = Math.min(1, b.t / b.duration);
      b.head.position.lerpVectors(b.from, b.to, k);
      if (b.kind) {
        const kind = KINDS[b.kind];
        if (kind)
          for (let i = 0; i < 2; i++)
            this.particles.spawn(kind, b.head.position.x, b.head.position.y - 0.35, b.head.position.z, b.color);
      } else {
        b.head.position.y += Math.sin(k * Math.PI) * 0.3;
        b.head.rotation.z -= dt * 12;
      }
      if (k >= 1) b.head.removeFromParent();
    }
    this.bolts = this.bolts.filter((b) => b.t < b.duration);

    for (const s of this.streams) {
      s.acc += dt;
      while (s.acc >= s.interval && s.left > 0) {
        s.acc -= s.interval;
        s.left--;
        this.burst(s.kind, s.at, 1);
      }
    }
    this.streams = this.streams.filter((s) => s.left > 0);

    for (const r of this.rays) {
      r.t += dt;
      (r.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, 1 - r.t / r.duration);
      if (r.t >= r.duration) r.line.removeFromParent();
    }
    this.rays = this.rays.filter((r) => r.t < r.duration);

    for (const f of this.flares) {
      f.t += dt;
      f.light.intensity = 6 * Math.max(0, 1 - f.t);
      if (f.t >= 1) f.light.removeFromParent();
    }
    this.flares = this.flares.filter((f) => f.t < 1);

    for (const f of this.flashes) {
      f.t += dt;
      const k = f.t / f.duration;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - k) * 0.6;
      if (f.grow) f.mesh.scale.setScalar(0.3 + k * 1.2);
      if (k >= 1) f.mesh.removeFromParent();
    }
    this.flashes = this.flashes.filter((f) => f.t < f.duration);

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const p = (this.shakeIntensity * Math.max(0, this.shakeT)) / this.shakeDuration / 16;
      this.shakeOffset.set((Math.random() - 0.5) * 2 * p, 0, (Math.random() - 0.5) * 2 * p);
    } else this.shakeOffset.set(0, 0, 0);

    this.particles.update(dt);
  }

  reset(): void {
    for (const b of this.bolts) b.head.removeFromParent();
    for (const r of this.rays) r.line.removeFromParent();
    for (const f of this.flares) f.light.removeFromParent();
    this.bolts = [];
    this.rays = [];
    for (const f of this.flashes) f.mesh.removeFromParent();
    this.flares = [];
    this.streams = [];
    this.flashes = [];
  }
}

const FLASH_GEO = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
const BOLT_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);
const MISSILE_MATERIAL = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
