// A pooled particle system for PD's emitters (FlameParticle, PoisonParticle, Speck, ...), drawn as square
// "pixel" points in 3D, plus the named-effect table that maps engine fx names onto particle behaviour.
import * as THREE from 'three';

const MAX = 4096;

interface Particle {
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  ay: number;
  life: number;
  left: number;
  size: number;
  color: THREE.Color;
  fade: boolean;
  shrink: boolean;
}

export interface ParticleKind {
  colors: number[];
  /** Upward speed range (world units/s) and spread. */
  rise: [number, number];
  spread: number;
  gravity: number;
  life: [number, number];
  /** Size in world units (1 = a tile). */
  size: number;
  shrink?: boolean;
  /** Spawn height above the cell floor. */
  height?: [number, number];
}

const K = (colors: number[], o: Partial<ParticleKind> = {}): ParticleKind => ({
  colors,
  rise: [0.2, 0.6],
  spread: 0.3,
  gravity: 0,
  life: [0.4, 0.8],
  size: 2 / 16,
  height: [0.1, 0.6],
  ...o,
});

/** Approximations of PD's particle factories and specks (colours from the original sources). */
export const KINDS: Record<string, ParticleKind> = {
  FlameParticle: K([0xee7722, 0xffaa33, 0xff4400], { rise: [0.4, 0.9], life: [0.3, 0.6], shrink: true }),
  ElmoParticle: K([0x22ee66, 0x44ff88], { rise: [0.5, 1], shrink: true }),
  PoisonParticle: K([0x8844ff, 0x00ff00]),
  'PoisonParticle.SPLASH': K([0x8844ff, 0x00ff00], { gravity: -2, rise: [0.5, 1], spread: 0.8 }),
  ShadowParticle: K([0x000000, 0x220022]),
  'ShadowParticle.CURSE': K([0x000000, 0x330033], { spread: 0.6 }),
  'ShadowParticle.UP': K([0x000000, 0x220022], { rise: [0.6, 1.2] }),
  'LeafParticle.GENERAL': K([0x004400, 0x88cc44], { gravity: -1, rise: [0.2, 0.5], spread: 0.6 }),
  'LeafParticle.LEVEL_SPECIFIC': K([0x48763c, 0x59994a], { gravity: -1, rise: [0.2, 0.5], spread: 0.6 }),
  ShaftParticle: K([0xffffaa, 0xffffff], { rise: [0.5, 0.9], spread: 0.1, life: [0.8, 1.2] }),
  SparkParticle: K([0xffffff, 0xffff66], { spread: 1.2, rise: [0, 0.5], life: [0.2, 0.4] }),
  EnergyParticle: K([0xffffaa, 0xffff00], { spread: 0.8 }),
  'PurpleParticle.BURST': K([0x4488ff, 0x9933ff], { spread: 0.8 }),
  SnowParticle: K([0xffffff, 0xaaccff], { gravity: -0.3, rise: [0, 0.1], life: [0.8, 1.2], height: [0.5, 1] }),
  EarthParticle: K([0x444444, 0x777766], { gravity: -1, spread: 0.5 }),
  BlastParticle: K([0xffcc44, 0xff6600, 0xffffff], { spread: 2, rise: [0, 1], life: [0.2, 0.5] }),
  SmokeParticle: K([0x666666, 0x999999], { rise: [0.3, 0.6], life: [0.6, 1] }),
  WebParticle: K([0xffffff], { rise: [0, 0.1], spread: 0.05, life: [0.6, 1] }),
  BloodParticle: K([0xcc0000, 0x990000], { gravity: -3, rise: [0.3, 1], spread: 1, life: [0.3, 0.6] }),
  SacrificialParticle: K([0x4488ff, 0x66ffff], { rise: [0.5, 1] }),
  'Speck.HEALING': K([0x00ff00], { rise: [0.4, 0.8], spread: 0.1, life: [0.6, 1] }),
  'Speck.STAR': K([0xffff00, 0xffffff], { spread: 1 }),
  'Speck.LIGHT': K([0xffffff], { spread: 0.5 }),
  'Speck.QUESTION': K([0xffffff], { rise: [0.4, 0.6] }),
  'Speck.UP': K([0xffffff, 0xffff99], { rise: [0.6, 1] }),
  'Speck.SCREAM': K([0xffffff], { spread: 1 }),
  'Speck.WOOL': K([0xffffff, 0xeeeeee], { spread: 0.6 }),
  'Speck.ROCK': K([0x777777, 0x555555], { gravity: -3, spread: 0.6, height: [0.6, 1.2] }),
  'Speck.NOTE': K([0xffffff, 0xffff66], { rise: [0.3, 0.6] }),
  'Speck.CHANGE': K([0xff66ff, 0x66ffff]),
  'Speck.HEART': K([0xff3366], { rise: [0.3, 0.6] }),
  'Speck.BUBBLE': K([0xccffff, 0xffffff], { rise: [0.2, 0.4] }),
  'Speck.STEAM': K([0xcccccc, 0xffffff], { rise: [0.4, 0.8] }),
  'Speck.COIN': K([0xffcc00], { gravity: -3, rise: [0.5, 1] }),
  'Speck.DISCOVER': K([0xffffff], { spread: 0.2, rise: [0.1, 0.3] }),
  'Speck.EVOKE': K([0xffffff, 0x99ccff], { spread: 0.8 }),
  'Speck.RATTLE': K([0xffffff], { spread: 0.5 }),
  'Speck.TOXIC': K([0x50ff60, 0x30aa40], {
    rise: [0.05, 0.2],
    spread: 0.15,
    life: [1, 1.6],
    size: 4 / 16,
    height: [0.05, 0.5],
  }),
  'Speck.PARALYSIS': K([0xffff66, 0xcccc33], {
    rise: [0.05, 0.2],
    spread: 0.15,
    life: [1, 1.6],
    size: 4 / 16,
    height: [0.05, 0.5],
  }),
  'Speck.CONFUSION': K([0xff66ff, 0x9966ff], {
    rise: [0.05, 0.2],
    spread: 0.15,
    life: [1, 1.6],
    size: 4 / 16,
    height: [0.05, 0.5],
  }),
  'SpellSprite.FOOD': K([0xffcc66], { rise: [0.6, 0.8], spread: 0 }),
  'SpellSprite.MAP': K([0xffffff], { rise: [0.6, 0.8], spread: 0 }),
  'SpellSprite.CHARGE': K([0xffffaa], { rise: [0.6, 0.8], spread: 0 }),
  degradation: K([0xff4444], { spread: 0.3 }),
};

/** Blob class name -> how its BlobEmitter looks (particle kind and particles per second at volume 1). */
export const BLOB_EMITTERS: Record<string, { kind: string; rate: number; perAmount?: boolean }> = {
  ToxicGas: { kind: 'Speck.TOXIC', rate: 1 / 0.6, perAmount: true },
  ParalyticGas: { kind: 'Speck.PARALYSIS', rate: 1 / 0.6, perAmount: true },
  ConfusionGas: { kind: 'Speck.CONFUSION', rate: 1 / 0.6, perAmount: true },
  Fire: { kind: 'FlameParticle', rate: 1 / 0.03 },
  Web: { kind: 'WebParticle', rate: 1 / 0.4 },
  Regrowth: { kind: 'LeafParticle.LEVEL_SPECIFIC', rate: 1 / 0.2 },
  Foliage: { kind: 'ShaftParticle', rate: 1 / 0.9 },
  Alchemy: { kind: 'Speck.BUBBLE', rate: 1 / 0.4 },
  WaterOfHealth: { kind: 'Speck.HEALING', rate: 1 / 0.5 },
  WaterOfAwareness: { kind: 'Speck.QUESTION', rate: 1 / 0.3 },
  WaterOfTransmutation: { kind: 'Speck.CHANGE', rate: 1 / 0.2 },
  SacrificialFire: { kind: 'SacrificialParticle', rate: 1 / 0.04 },
};

export class ParticleSystem {
  readonly points: THREE.Points;
  private readonly particles: Particle[] = [];
  private readonly positions = new Float32Array(MAX * 3);
  private readonly colors = new Float32Array(MAX * 4);
  private readonly sizes = new Float32Array(MAX);
  private next = 0;

  constructor() {
    for (let i = 0; i < MAX; i++) {
      this.particles.push({
        alive: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        ay: 0,
        life: 1,
        left: 0,
        size: 0,
        color: new THREE.Color(),
        fade: true,
        shrink: false,
      });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `
        attribute float size;
        attribute vec4 color;
        varying vec4 vColor;
        uniform float uScale;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * uScale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec4 vColor;
        void main() {
          if (vColor.a <= 0.01) discard;
          gl_FragColor = vColor;
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  setViewportHeight(h: number, fovDeg: number): void {
    (this.points.material as THREE.ShaderMaterial).uniforms.uScale.value =
      h / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  /** emitter.burst(kind, n) at a world position. */
  burst(kindName: string, x: number, y: number, z: number, n: number, colorOverride?: number): void {
    const kind = KINDS[kindName] ?? KINDS['Speck.LIGHT'];
    for (let i = 0; i < n; i++) this.spawn(kind, x, y, z, colorOverride);
  }

  spawn(kind: ParticleKind, x: number, y: number, z: number, colorOverride?: number): void {
    const p = this.particles[this.next];
    this.next = (this.next + 1) % MAX;
    const r = Math.random;
    const [h0, h1] = kind.height ?? [0.1, 0.6];
    p.alive = true;
    p.x = x + (r() - 0.5) * 0.5;
    p.y = y + h0 + r() * (h1 - h0);
    p.z = z + (r() - 0.5) * 0.5;
    const a = r() * Math.PI * 2;
    p.vx = Math.cos(a) * kind.spread * r();
    p.vz = Math.sin(a) * kind.spread * r();
    p.vy = kind.rise[0] + r() * (kind.rise[1] - kind.rise[0]);
    p.ay = kind.gravity;
    p.life = p.left = kind.life[0] + r() * (kind.life[1] - kind.life[0]);
    p.size = kind.size;
    p.shrink = !!kind.shrink;
    p.color.setHex(colorOverride ?? kind.colors[Math.floor(r() * kind.colors.length)]);
  }

  update(dt: number): void {
    for (let i = 0; i < MAX; i++) {
      const p = this.particles[i];
      if (p.alive) {
        p.left -= dt;
        if (p.left <= 0) p.alive = false;
        p.vy += p.ay * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
      const k = p.alive ? p.left / p.life : 0;
      this.positions[i * 3] = p.x;
      this.positions[i * 3 + 1] = p.y;
      this.positions[i * 3 + 2] = p.z;
      this.colors[i * 4] = p.color.r;
      this.colors[i * 4 + 1] = p.color.g;
      this.colors[i * 4 + 2] = p.color.b;
      this.colors[i * 4 + 3] = p.alive ? Math.min(1, k * 2) : 0;
      this.sizes[i] = p.alive ? (p.shrink ? p.size * k : p.size) : 0;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }
}

/** A blob's cells, emitting particles every frame (PD's BlobEmitter). */
export class BlobEmitter {
  cells: number[] = [];
  private acc = new Map<number, number>();

  constructor(
    readonly name: string,
    private readonly system: ParticleSystem,
  ) {}

  update(dt: number, visible: (cell: number) => boolean, toWorld: (cell: number) => THREE.Vector3): void {
    const em = BLOB_EMITTERS[this.name];
    if (!em) return;
    const kind = KINDS[em.kind];
    for (let i = 0; i < this.cells.length; i += 2) {
      const cell = this.cells[i];
      if (!visible(cell)) continue;
      const amount = em.perAmount ? Math.min(3, this.cells[i + 1] / 100 + 0.3) : 1;
      let a = (this.acc.get(cell) ?? Math.random()) + dt * em.rate * amount;
      const w = toWorld(cell);
      while (a >= 1) {
        this.system.spawn(kind, w.x, 0, w.z);
        a -= 1;
      }
      this.acc.set(cell, a);
    }
  }
}
