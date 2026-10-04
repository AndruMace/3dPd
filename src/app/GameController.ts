// Glue between player input, the engine and the 3D view. The engine runs ahead synchronously and emits events;
// this controller replays them as animations (PD's sprite callbacks, in order and with the original timings)
// and only accepts the next command once the hero is ready.
import * as THREE from 'three';
import { Game } from '../engine/Game';
import type { GameEvent } from '../engine/core/events';
import { HEIGHT, WIDTH } from '../engine/levels/constants';
import { CameraRig } from '../render/camera/CameraRig';
import { CharView, MOVE_INTERVAL } from '../render/actors/CharView';
import { HeapView } from '../render/actors/HeapView';
import { createWorldUniforms, FogOfWar, type WorldUniforms } from '../render/world/FogOfWar';
import { LevelView } from '../render/world/LevelView';
import { TileAtlas } from '../render/world/TileAtlas';
import { FloatingTextLayer } from '../ui/FloatingText';

const ASSETS = `${import.meta.env.BASE_URL}assets/img/`;
const TAP_SLOP = 8;

export interface HudState {
  depth: number;
  hp: number;
  ht: number;
  lvl: number;
  log: { text: string; kind: string }[];
  dead: boolean;
  ready: boolean;
  fading: boolean;
}

/** Events that take no time to show and never end a movement beat. */
const INSTANT = new Set<GameEvent['type']>(['observe', 'sound', 'terrain', 'log', 'status', 'turn', 'alert', 'damage']);

export class GameController {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private readonly fog = new FogOfWar();
  private readonly uniforms: WorldUniforms;
  private levelView: LevelView | null = null;
  private readonly chars = new Map<number, CharView>();
  private readonly heaps = new Map<number, HeapView>();
  private heroId = -1;
  private readonly heroLight: THREE.PointLight;
  private readonly floating: FloatingTextLayer;
  private readonly timer = new THREE.Timer();

  private queue: GameEvent[] = [];
  private wait = 0;
  private beat = new Set<number>();
  private loading = 0;
  private visited: Uint8Array = new Uint8Array(WIDTH * HEIGHT);

  hud: HudState = { depth: 0, hp: 0, ht: 0, lvl: 1, log: [], dead: false, ready: false, fading: false };
  onHud: (hud: HudState) => void = () => {};

  constructor(private readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);

    this.rig = new CameraRig(1);
    this.uniforms = createWorldUniforms(this.fog);
    this.scene.background = new THREE.Color(0x000000);

    this.scene.add(new THREE.HemisphereLight(0x8899aa, 0x223311, 0.9));
    this.scene.add(new THREE.AmbientLight(0x404040, 0.6));
    this.heroLight = new THREE.PointLight(0xffe2b0, 14, 10, 1.4);
    this.heroLight.position.set(0, 1.6, 0);

    this.floating = new FloatingTextLayer(container);
    this.bindInput();
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  start(seed: number | string): void {
    this.reset();
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    this.enqueue();
  }

  private reset(): void {
    for (const v of this.chars.values()) v.removeFromParent();
    for (const v of this.heaps.values()) v.removeFromParent();
    this.chars.clear();
    this.heaps.clear();
    this.queue = [];
    this.wait = 0;
    this.hud = { ...this.hud, log: [], dead: false };
  }

  // ---- Commands ----

  private canCommand(): boolean {
    return this.queue.length === 0 && this.loading === 0 && Game.isReady() && !this.hud.fading;
  }

  tapCell(cell: number): void {
    if (this.hud.dead) return;
    if (Game.isBusy()) {
      Game.handle(cell); // interrupts a walk
      return;
    }
    if (!this.canCommand()) return;
    Game.handle(cell);
    this.enqueue();
  }

  step(sx: number, sy: number): void {
    if (!this.canCommand()) return;
    const [dx, dy] = this.rig.screenToGrid(sx, sy);
    const hero = Game.hero;
    const target = hero.pos + dx + dy * WIDTH;
    Game.handle(target);
    this.enqueue();
  }

  rest(): void {
    if (!this.canCommand()) return;
    Game.rest();
    this.enqueue();
  }

  rotate(quarterTurns: number): void {
    this.rig.rotateBy((quarterTurns * Math.PI) / 2, true);
  }

  private enqueue(): void {
    this.queue.push(...Game.drainEvents());
  }

  // ---- Playback ----

  private frame(): void {
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    this.playback(dt);

    const heroView = this.chars.get(this.heroId);
    if (heroView) {
      this.rig.target.copy(heroView.position);
      this.uniforms.uHero.value.copy(heroView.position);
    }
    this.rig.update(dt);
    this.rig.viewDir(this.uniforms.uViewDir.value);
    const cam = this.rig.camera;
    this.levelView?.update(dt, cam);
    for (const [id, v] of this.chars) {
      v.seen = id === this.heroId || !!this.fog.visible[v.pos];
      v.update(dt, cam);
      if (v.gone) {
        v.removeFromParent();
        this.chars.delete(id);
      }
    }
    for (const h of this.heaps.values()) h.update(dt, cam, !!(this.fog.visible[h.pos] || this.visited[h.pos]));
    this.renderer.render(this.scene, cam);
    const { clientWidth: w, clientHeight: h } = this.container;
    this.floating.update(dt, cam, w, h);
  }

  private playback(dt: number): void {
    if (this.loading > 0) return;
    this.wait -= dt;
    while (this.wait <= 0 && this.loading === 0) {
      const e = this.queue.shift();
      if (!e) {
        this.wait = 0;
        if (this.advanceEngine()) continue;
        break;
      }
      this.wait += this.show(e);
    }
    const ready = this.canCommand();
    if (ready !== this.hud.ready) this.pushHud({ ready });
  }

  /** When the replay has caught up, let the engine take the hero's next step or switch levels. */
  private advanceEngine(): boolean {
    if (this.hud.fading) return false;
    if (Game.isBusy()) {
      Game.continue();
      this.enqueue();
      return this.queue.length > 0;
    }
    if (Game.hero.pendingTransition) {
      this.pushHud({ fading: true });
      setTimeout(() => {
        Game.transition();
        this.enqueue();
        this.pushHud({ fading: false });
      }, 350);
      return false;
    }
    return false;
  }

  /** Shows one event; returns how long playback should wait before the next one. */
  private show(e: GameEvent): number {
    const cam = this.rig.camera;
    switch (e.type) {
      case 'level':
        this.buildLevel(e);
        return 0;
      case 'spawn': {
        this.loading++;
        void CharView.create(e.id, e.sprite, e.pos).then((v) => {
          this.chars.set(e.id, v);
          this.scene.add(v);
          this.loading--;
        });
        return 0;
      }
      case 'move': {
        const v = this.chars.get(e.id);
        if (!v) return 0;
        const seen = e.id === this.heroId || this.fog.visible[e.from] || this.fog.visible[e.to];
        if (!seen) {
          v.place(e.to);
          return 0;
        }
        v.move(e.from, e.to, cam);
        this.beat.add(e.id);
        // Keep the beat open while the next timed event is another character's step.
        const next = this.queue.find((n) => !INSTANT.has(n.type));
        if (next && next.type === 'move' && !this.beat.has(next.id)) return 0;
        this.beat.clear();
        return MOVE_INTERVAL;
      }
      case 'place':
        this.chars.get(e.id)?.place(e.pos);
        return 0;
      case 'attack': {
        this.beat.clear();
        const v = this.chars.get(e.id);
        if (!v || !v.visible) return 0;
        v.turnTo(v.pos, e.target, cam);
        return v.playOnce('attack');
      }
      case 'turn': {
        const v = this.chars.get(e.id);
        v?.turnTo(e.from, e.to, cam);
        return 0;
      }
      case 'damage': {
        const v = this.chars.get(e.id);
        if (v) {
          v.hp = e.hp;
          v.ht = e.ht;
          if (e.amount > 0) v.flash();
        }
        if (e.id === this.heroId) this.pushHud({ hp: Math.max(0, e.hp), ht: e.ht });
        return 0;
      }
      case 'status': {
        const v = this.chars.get(e.id);
        if (v && (v.visible || e.id === this.heroId))
          this.floating.show(v, e.text, e.color, v.sprite.def.frameHeight / 16);
        if (e.id === this.heroId && e.text === 'level up!') this.pushHud({ lvl: Game.hero.lvl, ht: Game.hero.HT });
        return 0;
      }
      case 'alert': {
        const v = this.chars.get(e.id);
        if (v && v.visible) this.floating.show(v, '!', 'negative', v.sprite.def.frameHeight / 16);
        return 0;
      }
      case 'die': {
        const v = this.chars.get(e.id);
        if (v) v.die();
        return 0;
      }
      case 'remove':
        this.chars.get(e.id)?.removeFromParent();
        this.chars.delete(e.id);
        return 0;
      case 'terrain':
        this.levelView?.setCell(e.cell, e.value);
        return 0;
      case 'observe':
        this.fog.update(e.visible, e.visited, e.mapped);
        this.visited = e.visited;
        return 0;
      case 'log':
        this.pushHud({ log: [...this.hud.log, { text: e.text, kind: e.kind }].slice(-4) });
        return 0;
      case 'heroDied':
        this.pushHud({ dead: true });
        return 0;
      default:
        return 0;
    }
  }

  private buildLevel(e: Extract<GameEvent, { type: 'level' }>): void {
    for (const v of this.chars.values()) v.removeFromParent();
    for (const v of this.heaps.values()) v.removeFromParent();
    this.chars.clear();
    this.heaps.clear();
    this.heroId = e.heroId;
    this.loading++;

    const load = async () => {
      const [atlas, water] = await Promise.all([
        TileAtlas.load(e.tiles),
        new THREE.TextureLoader().loadAsync(ASSETS + e.water),
      ]);
      if (this.levelView) this.levelView.removeFromParent();
      this.levelView = new LevelView(atlas, water, this.uniforms);
      this.levelView.build(e.map);
      this.scene.add(this.levelView);

      const views = await Promise.all(e.chars.map((c) => CharView.create(c.id, c.sprite, c.pos)));
      views.forEach((v, i) => {
        v.hp = e.chars[i].hp;
        v.ht = e.chars[i].ht;
        this.chars.set(v.charId, v);
        this.scene.add(v);
      });
      const hero = this.chars.get(this.heroId)!;
      hero.add(this.heroLight);
      this.rig.snapTo(hero.position);

      const heaps = await Promise.all(e.heaps.map((h) => HeapView.create(h.pos, h.image, h.type)));
      for (const h of heaps) {
        this.heaps.set(h.pos, h);
        this.scene.add(h);
      }
      const heroChar = e.chars.find((c) => c.id === this.heroId)!;
      this.pushHud({ depth: e.depth, hp: heroChar.hp, ht: heroChar.ht, lvl: Game.hero.lvl });
      this.loading--;
    };
    void load();
  }

  private pushHud(patch: Partial<HudState>): void {
    this.hud = { ...this.hud, ...patch };
    this.onHud(this.hud);
  }

  // ---- Input ----

  private bindInput(): void {
    const el = this.renderer.domElement;
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let dragged = false;
    let pinchDist = 0;

    el.addEventListener('pointerdown', (ev) => {
      el.setPointerCapture(ev.pointerId);
      pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY, sx: ev.clientX, sy: ev.clientY });
      if (pointers.size === 1) dragged = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
        dragged = true;
      }
    });
    el.addEventListener('pointermove', (ev) => {
      const p = pointers.get(ev.pointerId);
      if (!p) return;
      const dx = ev.clientX - p.x;
      p.x = ev.clientX;
      p.y = ev.clientY;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) this.rig.zoomBy(pinchDist / d);
        pinchDist = d;
        return;
      }
      if (Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) > TAP_SLOP) dragged = true;
      if (dragged) this.rig.rotateBy((-dx / this.container.clientWidth) * Math.PI);
    });
    const end = (ev: PointerEvent) => {
      const p = pointers.get(ev.pointerId);
      pointers.delete(ev.pointerId);
      if (!p) return;
      if (!dragged && pointers.size === 0) {
        const cell = this.pickCell(ev.clientX, ev.clientY);
        if (cell !== -1) this.tapCell(cell);
      } else if (pointers.size === 0) {
        this.rig.settle();
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener(
      'wheel',
      (ev) => {
        ev.preventDefault();
        this.rig.zoomBy(Math.exp(ev.deltaY * 0.001));
      },
      { passive: false },
    );

    addEventListener('keydown', (ev) => {
      if (ev.metaKey || ev.ctrlKey) return;
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1],
        w: [0, -1],
        k: [0, -1],
        Numpad8: [0, -1],
        ArrowDown: [0, 1],
        s: [0, 1],
        j: [0, 1],
        Numpad2: [0, 1],
        ArrowLeft: [-1, 0],
        a: [-1, 0],
        h: [-1, 0],
        Numpad4: [-1, 0],
        ArrowRight: [1, 0],
        d: [1, 0],
        l: [1, 0],
        Numpad6: [1, 0],
        y: [-1, -1],
        Numpad7: [-1, -1],
        u: [1, -1],
        Numpad9: [1, -1],
        b: [-1, 1],
        Numpad1: [-1, 1],
        n: [1, 1],
        Numpad3: [1, 1],
      };
      const key = ev.code.startsWith('Numpad') ? ev.code : ev.key;
      const dir = dirs[key];
      if (dir) {
        ev.preventDefault();
        this.step(dir[0], dir[1]);
      } else if (key === ' ' || key === '.' || ev.code === 'Numpad5') {
        ev.preventDefault();
        this.rest();
      } else if (key === 'q') {
        this.rotate(-1);
      } else if (key === 'e') {
        this.rotate(1);
      }
    });
  }

  private readonly raycaster = new THREE.Raycaster();
  private readonly ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  pickCell(clientX: number, clientY: number): number {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    if (!hit) return -1;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    return x < 0 || y < 0 || x >= WIDTH || y >= HEIGHT ? -1 : x + y * WIDTH;
  }

  private resize(): void {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.rig.setAspect(w / h);
  }
}
