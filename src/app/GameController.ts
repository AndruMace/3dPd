// Glue between player input, the engine and the 3D view. The engine runs ahead synchronously and emits events;
// this controller replays them as animations (PD's sprite callbacks, in order and with the original timings)
// and only accepts the next command once the hero is ready. Requests for the player (pick a cell, an item, an
// option) are surfaced to the UI once the replay has caught up.
import * as THREE from 'three';
import { Assets } from '../content/generated/Assets';
import { Audio } from '../audio/Audio';
import { Dungeon } from '../engine/Dungeon';
import { Game, type SavedGame } from '../engine/Game';
import type { HeroClass } from '../engine/actors/hero/Hero';
import { Inspect, type ExamineView, type StatusView } from '../engine/Inspect';
import type { GameEvent } from '../engine/core/events';
import type { Prompt } from '../engine/core/ui';
import { HEIGHT, WIDTH } from '../engine/levels/constants';
import { onAppPause } from '../platform/lifecycle';
import { Storage } from '../platform/storage';
import { submitRanking } from './rankings';
import { CameraRig } from '../render/camera/CameraRig';
import { CharView, cellToWorld, MOVE_INTERVAL } from '../render/actors/CharView';
import { HeapView } from '../render/actors/HeapView';
import { FxView } from '../render/fx/FxView';
import { BlobEmitter, KINDS } from '../render/fx/Particles';
import { createWorldUniforms, FogOfWar, type WorldUniforms } from '../render/world/FogOfWar';
import { LevelView } from '../render/world/LevelView';
import { TileAtlas } from '../render/world/TileAtlas';
import { FloatingTextLayer } from '../ui/FloatingText';

const ASSETS = `${import.meta.env.BASE_URL}assets/img/`;
const TAP_SLOP = 8;
const SAVE_KEY = 'game';
const AUTOSAVE_INTERVAL = 15;

/** Everything the pixel UI needs to draw itself. */
export interface ViewState {
  /** The hero can take a command (no replay in progress, no request pending). */
  ready: boolean;
  /** InterlevelScene text while switching levels ("Descending..."), or null. */
  interlevel: string | null;
  status: StatusView | null;
  quickslot: { image: number; status: string | null; enabled: boolean } | null;
  /** The engine's pending request, shown once the replay has caught up. */
  prompt: Prompt | null;
  /** The toolbar's examine button is waiting for a cell. */
  examining: boolean;
  /** WndResurrect is up (died with an Ankh). */
  resurrect: boolean;
  /** Game over: the cause of death. */
  dead: string | null;
  /** A full-screen colour flash (GameScene.flash), as [color, serial]. */
  flash: [number, number] | null;
}

/** Events that take no time to show and never end a movement beat. */
const INSTANT = new Set<GameEvent['type']>([
  'observe',
  'sound',
  'terrain',
  'log',
  'status',
  'turn',
  'alert',
  'damage',
  'hp',
  'heap',
  'plant',
  'blob',
  'charState',
  'pickUp',
  'tier',
]);

const TRANSITION_TEXT: Record<string, string> = {
  descend: 'Descending...',
  ascend: 'Ascending...',
  fall: 'Falling...',
  fallIntoPit: 'Falling...',
  return: 'Returning...',
  win: 'Descending...',
};

export class GameController {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  private readonly fog = new FogOfWar();
  private readonly uniforms: WorldUniforms;
  private levelView: LevelView | null = null;
  private readonly chars = new Map<number, CharView>();
  private readonly heaps = new Map<number, HeapView>();
  private readonly plants = new Map<number, HeapView>();
  private readonly blobs = new Map<string, BlobEmitter>();
  /** Async view creation per cell: a later heap/plant event supersedes an earlier one still loading. */
  private readonly heapTokens = new Map<number, number>();
  private readonly fx = new FxView();
  private heroId = -1;
  private readonly heroLight: THREE.PointLight;
  private readonly floating: FloatingTextLayer;
  private readonly timer = new THREE.Timer();

  private queue: GameEvent[] = [];
  private wait = 0;
  private beat = new Set<number>();
  private loading = 0;
  private visited: Uint8Array = new Uint8Array(WIDTH * HEIGHT);
  private sinceSave = 0;
  private flashSerial = 0;

  state: ViewState = {
    ready: false,
    interlevel: null,
    status: null,
    quickslot: null,
    prompt: null,
    examining: false,
    resurrect: false,
    dead: null,
    flash: null,
  };
  onState: (state: ViewState) => void = () => {};
  onLog: (text: string, kind: string) => void = () => {};
  onExamine: (view: ExamineView) => void = () => {};
  /** The UI has a window open: the world ignores keys and taps. */
  inputBlocked: () => boolean = () => false;

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
    this.scene.add(this.fx);

    this.floating = new FloatingTextLayer(container);
    this.bindInput();
    addEventListener('resize', () => this.resize());
    onAppPause(
      () => {
        void this.save();
        Audio.pause();
      },
      () => Audio.resume(),
    );
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** The game scene is showing (the title and other menus pause rendering and hide the 3D view). */
  setActive(active: boolean): void {
    this.container.style.visibility = active ? '' : 'hidden';
    this.renderer.setAnimationLoop(active ? () => this.frame() : null);
  }

  /** Leaving for the main menu: save the run (PD saves when GameScene is left). */
  async leave(): Promise<void> {
    await this.save();
    this.setActive(false);
  }

  // ---- Runs ----

  start(seed: number | string, heroClass: HeroClass = 'WARRIOR'): void {
    this.reset();
    Game.newGame({ seed, heroClass });
    this.enqueue();
    Audio.music(Assets.TUNE);
  }

  /** Resumes the saved run, if any. */
  async resume(): Promise<boolean> {
    const saved = await Storage.get<SavedGame>(SAVE_KEY);
    if (!saved) return false;
    try {
      this.reset();
      this.patch({ interlevel: 'Loading...' });
      Game.load(saved);
      this.enqueue();
      setTimeout(() => this.patch({ interlevel: null }), 350);
      Audio.music(Assets.TUNE);
      return true;
    } catch (err) {
      console.error('Could not load the saved game', err);
      await Storage.remove(SAVE_KEY);
      return false;
    }
  }

  /** Dungeon.saveAll: only while the hero lives and nothing is half-resolved. */
  async save(): Promise<void> {
    const hero = Dungeon.hero;
    if (!hero || !hero.isAlive() || this.state.dead || this.state.resurrect) return;
    if (Game.prompt !== null || hero.pendingTransition) return;
    this.sinceSave = 0;
    await Storage.set(SAVE_KEY, Game.save());
  }

  private reset(): void {
    for (const v of this.chars.values()) v.removeFromParent();
    this.clearLevelObjects();
    this.chars.clear();
    this.queue = [];
    this.wait = 0;
    this.patch({ dead: null, resurrect: false, examining: false, prompt: null });
  }

  private clearLevelObjects(): void {
    for (const v of this.heaps.values()) v.removeFromParent();
    for (const v of this.plants.values()) v.removeFromParent();
    this.heaps.clear();
    this.plants.clear();
    this.heapTokens.clear();
    this.blobs.clear();
    this.fx.reset();
  }

  // ---- Commands from the UI ----

  private canCommand(): boolean {
    if (!Dungeon.hero) return false;
    return this.idle() && Game.isReady() && !this.state.interlevel && !this.state.dead;
  }

  /** The replay has caught up with the engine. */
  private idle(): boolean {
    return this.queue.length === 0 && this.loading === 0 && this.wait <= 0;
  }

  tapCell(cell: number): void {
    if (this.state.dead || this.state.resurrect || this.state.interlevel) return;
    const p = Game.prompt;
    if (p && p.kind === 'cell') {
      if (this.idle()) this.answer(cell);
      return;
    }
    if (this.state.examining) {
      this.patch({ examining: false });
      this.onExamine(Inspect.examine(cell));
      return;
    }
    if (Game.isBusy()) {
      Game.handle(cell); // interrupts a walk
      return;
    }
    if (!this.canCommand()) return;
    Game.handle(cell);
    this.enqueue();
  }

  step(dx: number, dy: number): void {
    if (!this.canCommand()) return;
    const [gx, gy] = this.rig.screenToGrid(dx, dy);
    Game.handle(Game.hero.pos + gx + gy * WIDTH);
    this.enqueue();
  }

  rest(tillHealthy = false): void {
    if (!this.canCommand()) return;
    Game.rest(tillHealthy);
    this.enqueue();
  }

  search(): void {
    if (!this.canCommand()) return;
    Game.search();
    this.enqueue();
  }

  examine(): void {
    if (this.state.examining) {
      this.patch({ examining: false });
      return;
    }
    if (this.canCommand()) this.patch({ examining: true });
  }

  itemAction(uid: number, action: string): void {
    if (!this.canCommand()) return;
    Game.itemAction(uid, action);
    this.enqueue();
  }

  quickslot(): void {
    const p = Game.prompt;
    if (!(this.canCommand() || (p && p.kind === 'cell' && this.idle()))) return;
    Game.useQuickslot();
    this.enqueue();
  }

  setQuickslot(uid: number): void {
    Game.setQuickslot(uid);
    this.refreshStatus();
  }

  /** Answers the engine's pending request (cell, item uid, option index, or null to cancel/close). */
  answer(value: number | null): void {
    if (!Game.prompt) return;
    Game.answer(value);
    this.patch({ prompt: null });
    this.enqueue();
  }

  resurrect(accept: boolean): void {
    if (!this.state.resurrect) return;
    this.patch({ resurrect: false });
    if (accept) {
      this.patch({ interlevel: 'Resurrecting...' });
      setTimeout(() => {
        Game.resurrect(true);
        this.enqueue();
        this.patch({ interlevel: null });
      }, 350);
    } else {
      Game.resurrect(false);
      this.enqueue();
    }
  }

  rotate(quarterTurns: number): void {
    this.rig.rotateBy((quarterTurns * Math.PI) / 2, true);
  }

  private enqueue(): void {
    this.queue.push(...Game.drainEvents());
  }

  // ---- Frame loop and playback ----

  /** One frame; exposed so tests can drive the loop when the page is hidden. */
  frame(fixedDt?: number): void {
    this.timer.update();
    const dt = fixedDt ?? Math.min(this.timer.getDelta(), 0.1);
    this.playback(dt);

    const heroView = this.chars.get(this.heroId);
    if (heroView) {
      this.rig.target.copy(heroView.position).setY(0);
      this.uniforms.uHero.value.copy(heroView.position);
    }
    this.rig.update(dt);
    const cam = this.rig.camera;
    this.fx.update(dt);
    cam.position.add(this.fx.shakeOffset);
    this.rig.viewDir(this.uniforms.uViewDir.value);
    this.levelView?.update(dt, cam);
    for (const [id, v] of this.chars) {
      v.seen = id === this.heroId || !!this.fog.visible[v.pos];
      v.update(dt, cam);
      if (v.visible && v.states.has('BURNING')) this.emitOn(v, 'FlameParticle', dt / 0.06);
      if (v.gone) {
        v.removeFromParent();
        this.chars.delete(id);
      }
    }
    for (const h of this.heaps.values()) h.update(dt, cam, !!(this.fog.visible[h.pos] || this.visited[h.pos]));
    for (const p of this.plants.values()) p.update(dt, cam, !!(this.fog.visible[p.pos] || this.visited[p.pos]));
    for (const b of this.blobs.values())
      b.update(
        dt,
        (cell) => !!this.fog.visible[cell],
        (cell) => cellToWorld(cell, _w),
      );
    this.renderer.render(this.scene, cam);
    const { clientWidth: w, clientHeight: h } = this.container;
    this.floating.update(dt, cam, w, h);

    this.sinceSave += dt;
    if (this.sinceSave > AUTOSAVE_INTERVAL && this.canCommand()) void this.save();
  }

  private emitOn(v: CharView, kind: string, expected: number): void {
    let n = Math.floor(expected) + (Math.random() < expected % 1 ? 1 : 0);
    const k = KINDS[kind];
    while (n-- > 0) this.fx.particles.spawn(k, v.position.x, v.position.y, v.position.z);
  }

  private playback(dt: number): void {
    if (this.loading > 0 || !Dungeon.hero) return;
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
    const prompt = this.idle() && !this.state.interlevel ? Game.prompt : null;
    if (ready !== this.state.ready || prompt !== this.state.prompt) {
      this.patch({ ready, prompt });
      if (ready || prompt) this.refreshStatus();
    }
  }

  private refreshStatus(): void {
    if (!Dungeon.hero) return;
    this.patch({ status: Inspect.status(), quickslot: Inspect.quickslot() });
  }

  /** When the replay has caught up, let the engine take the hero's next step or switch levels. */
  private advanceEngine(): boolean {
    if (this.state.interlevel || this.state.resurrect || this.state.dead) return false;
    if (Game.isBusy()) {
      Game.continue();
      this.enqueue();
      return this.queue.length > 0;
    }
    const t = Game.hero.pendingTransition;
    if (t) {
      this.patch({ interlevel: TRANSITION_TEXT[typeof t === 'string' ? t : 'return'] });
      setTimeout(() => {
        Game.transition();
        this.enqueue();
        this.patch({ interlevel: null });
        void this.save();
      }, 350);
      return false;
    }
    return false;
  }

  private world(cell: number): THREE.Vector3 {
    return cellToWorld(cell, new THREE.Vector3());
  }

  /** Where an effect anchored on a character or a cell happens. */
  private anchor(e: { id?: number; pos?: number }): THREE.Vector3 | null {
    if (e.id !== undefined) {
      const v = this.chars.get(e.id);
      if (v) return v.visible ? v.position.clone() : null;
    }
    if (e.pos !== undefined && e.pos >= 0) return this.fog.visible[e.pos] ? this.world(e.pos) : null;
    return null;
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
      case 'anim': {
        this.beat.clear();
        const v = this.chars.get(e.id);
        if (!v || !v.visible) return 0;
        if (e.target !== undefined && e.target !== v.pos) v.turnTo(v.pos, e.target, cam);
        return v.playOnce(e.anim);
      }
      case 'missile': {
        this.beat.clear();
        if (!this.fog.visible[e.from] && !this.fog.visible[e.to]) return 0;
        return this.fx.missile(e.image, this.world(e.from), this.world(e.to));
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
        if (e.id === this.heroId) this.patchHp(e.hp, e.ht);
        return 0;
      }
      case 'hp': {
        const v = this.chars.get(e.id);
        if (v) {
          v.hp = e.hp;
          v.ht = e.ht;
        }
        if (e.id === this.heroId) this.patchHp(e.hp, e.ht);
        return 0;
      }
      case 'status': {
        const v = this.chars.get(e.id);
        if (v && (v.visible || e.id === this.heroId))
          this.floating.show(v, e.text, e.color, v.sprite.def.frameHeight / 16);
        if (e.id === this.heroId) this.refreshStatus();
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
      case 'charState':
        this.chars.get(e.id)?.setState(e.state, e.on);
        return 0;
      case 'tier':
        this.chars.get(e.id)?.sprite.setTier(e.tier);
        this.refreshStatus();
        return 0;
      case 'terrain':
        this.levelView?.setCell(e.cell, e.value);
        return 0;
      case 'observe':
        this.fog.update(e.visible, e.visited, e.mapped);
        this.visited = e.visited;
        return 0;
      case 'heap':
        this.showHeap(e.pos, e.image, e.heapType, e.from);
        return 0;
      case 'plant':
        this.showPlant(e.pos, e.image);
        return 0;
      case 'blob': {
        let b = this.blobs.get(e.blob);
        if (!b) this.blobs.set(e.blob, (b = new BlobEmitter(e.blob, this.fx.particles)));
        b.cells = e.cells;
        return 0;
      }
      case 'pickUp':
        this.refreshStatus();
        return 0;
      case 'sound':
        this.playSound(e.name, e.pos);
        return 0;
      case 'log':
        this.onLog(e.text, e.kind);
        return 0;
      case 'fx':
        return this.showFx(e);
      case 'ranking':
        void submitRanking(e.record);
        return 0;
      case 'heroDied':
        void Storage.remove(SAVE_KEY);
        Audio.play(Assets.SND_DEATH);
        this.patch({ dead: Dungeon.resultDescription, examining: false });
        this.refreshStatus();
        return 0;
      default:
        return 0;
    }
  }

  private patchHp(hp: number, ht: number): void {
    if (this.state.status) this.patch({ status: { ...this.state.status, hp: Math.max(0, hp), ht } });
  }

  private showFx(e: Extract<GameEvent, { type: 'fx' }>): number {
    const cam = this.rig.camera;
    const name = e.fx;
    if (name.startsWith('MagicMissile.')) {
      this.beat.clear();
      if (!this.fog.visible[e.pos!] && !this.fog.visible[e.to!]) return 0;
      return this.fx.bolt(name, this.world(e.pos!), this.world(e.to!), e.color);
    }
    if (name === 'Lightning' || name === 'DeathRay') {
      this.beat.clear();
      return this.fx.ray(name, this.world(e.pos!), this.world(e.to!), e.color);
    }
    if (KINDS[name]) {
      const at = this.anchor(e);
      if (!at) return 0;
      if (e.v !== undefined) this.fx.stream(name, at, e.v, e.n ?? 0);
      else this.fx.burst(name, at, e.n ?? 1);
      return 0;
    }
    switch (name) {
      case 'burst': {
        const at = this.anchor(e);
        if (at) this.fx.burst('SparkParticle', at, e.n ?? 5, (e.color ?? 0xffffff) & 0xffffff);
        return 0;
      }
      case 'splash': {
        const at = this.anchor(e);
        if (at) this.fx.burst('BloodParticle', at, e.n ?? 5, e.color);
        return 0;
      }
      case 'blood': {
        const at = this.anchor(e);
        if (at) this.fx.burst('BloodParticle', at, Math.min(12, Math.max(2, e.n ?? 4)), 0xbb0000);
        return 0;
      }
      case 'itemSplash': {
        const at = this.anchor(e);
        if (at) this.fx.burst('BloodParticle', at, e.n ?? 5, 0x88aaff);
        return 0;
      }
      case 'flare': {
        const at = this.anchor(e);
        if (at) this.fx.flare(at, e.color ?? 0xffffff);
        return 0;
      }
      case 'shake':
        this.fx.shake(e.v ?? 2, e.n ?? 0.3);
        return 0;
      case 'wound': {
        const at = this.anchor(e);
        if (at) this.fx.burst('SparkParticle', at, 4, 0xff0000);
        return 0;
      }
      case 'checkedCell':
        if (e.pos !== undefined) this.fx.cellFlash(this.world(e.pos), 0x99ccff, 0.6);
        return 0;
      case 'discoverTile':
        if (e.pos !== undefined) {
          this.fx.cellFlash(this.world(e.pos), 0xffffff, 0.8);
          this.fx.burst('Speck.DISCOVER', this.world(e.pos), 4);
        }
        return 0;
      case 'ripple':
        if (e.pos !== undefined && this.fog.visible[e.pos]) this.fx.cellFlash(this.world(e.pos), 0x6688aa, 0.5, true);
        return 0;
      case 'identification':
      case 'heapReveal':
      case 'enchanting': {
        const at = this.anchor(e);
        if (at) this.fx.burst('Speck.LIGHT', at, 8, name === 'enchanting' ? 0xffff66 : 0xffffff);
        return 0;
      }
      case 'discardHeap': {
        const at = this.anchor(e);
        if (at) this.fx.burst('SmokeParticle', at, 6);
        return 0;
      }
      case 'pushing':
      case 'swap': {
        const v = this.chars.get(e.id!);
        if (!v) return 0;
        if (!v.visible) {
          v.place(e.to!);
          return 0;
        }
        this.beat.clear();
        return v.tween(e.pos!, e.to!, 0.15, 0);
      }
      case 'jump': {
        const v = this.chars.get(e.id!);
        if (!v) return 0;
        const d = this.world(e.pos!).distanceTo(this.world(e.to!));
        v.turnTo(e.pos!, e.to!, cam);
        v.sprite.play('jump', true);
        this.beat.clear();
        return v.tween(e.pos!, e.to!, Math.max(0.2, d * 0.1), d * 0.25);
      }
      case 'appear': {
        const v = this.chars.get(e.id!);
        if (!v) return 0;
        v.place(e.to!);
        if (v.visible) this.fx.burst('Speck.LIGHT', v.position, 6);
        return 0;
      }
      case 'fall': {
        const v = this.chars.get(e.id!);
        return v ? v.fall() : 0;
      }
      case 'fadeIn':
      case 'fadeOut': {
        const v = this.chars.get(e.id!);
        if (!v) return 0;
        if (name === 'fadeIn') {
          v.fadeTo(0, 0);
          v.fadeTo(1, e.v ?? 0.5);
        } else v.fadeTo(0, e.v ?? 0.5);
        return 0;
      }
      case 'idle':
        this.chars.get(e.id!)?.sprite.play('idle', true);
        return 0;
      case 'pumpUp': {
        const v = this.chars.get(e.id!);
        if (v?.visible) {
          v.sprite.play('pump', true);
          this.fx.burst('Speck.STEAM', v.position, 3);
        }
        return 0;
      }
      case 'flash':
        this.patch({ flash: [e.color ?? 0xffffff, ++this.flashSerial] });
        return 0;
      case 'bossSlain':
        this.patch({ flash: [0xffffff, ++this.flashSerial] });
        Audio.play(Assets.SND_BOSS);
        return 0;
      case 'resurrect':
        this.patch({ resurrect: true });
        return 0;
      default:
        return 0;
    }
  }

  private showHeap(pos: number, image: number, type: string, from?: number): void {
    const token = (this.heapTokens.get(pos) ?? 0) + 1;
    this.heapTokens.set(pos, token);
    const old = this.heaps.get(pos);
    if (image < 0) {
      old?.removeFromParent();
      this.heaps.delete(pos);
      return;
    }
    void HeapView.create(pos, image, type).then((v) => {
      if (this.heapTokens.get(pos) !== token) return;
      this.heaps.get(pos)?.removeFromParent();
      this.heaps.set(pos, v);
      this.scene.add(v);
      if (from !== undefined && from !== pos) v.drop(this.world(from));
      else v.drop(null);
    });
  }

  private showPlant(pos: number, image: number): void {
    const key = -1 - pos; // plant tokens share the map with heaps
    const token = (this.heapTokens.get(key) ?? 0) + 1;
    this.heapTokens.set(key, token);
    if (image < 0) {
      this.plants.get(pos)?.removeFromParent();
      this.plants.delete(pos);
      return;
    }
    void HeapView.createPlant(pos, image).then((v) => {
      if (this.heapTokens.get(key) !== token) return;
      this.plants.get(pos)?.removeFromParent();
      this.plants.set(pos, v);
      this.scene.add(v);
    });
  }

  private playSound(name: string, pos?: number): void {
    let pan = 0;
    if (pos !== undefined && pos >= 0) {
      const p = this.world(pos).project(this.rig.camera);
      pan = Math.max(-1, Math.min(1, p.x)) * 0.7;
    }
    Audio.play(name, pan);
  }

  private buildLevel(e: Extract<GameEvent, { type: 'level' }>): void {
    for (const v of this.chars.values()) v.removeFromParent();
    this.chars.clear();
    this.clearLevelObjects();
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
      hero.sprite.setTier(Dungeon.hero.tier());
      hero.add(this.heroLight);
      this.rig.snapTo(hero.position);

      const heaps = await Promise.all(e.heaps.map((h) => HeapView.create(h.pos, h.image, h.type)));
      for (const h of heaps) {
        this.heaps.set(h.pos, h);
        this.scene.add(h);
      }
      this.refreshStatus();
      this.loading--;
    };
    void load();
  }

  private patch(p: Partial<ViewState>): void {
    this.state = { ...this.state, ...p };
    this.onState(this.state);
  }

  // ---- Input ----

  private bindInput(): void {
    const el = this.renderer.domElement;
    const pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
    let dragged = false;
    let pinchDist = 0;

    el.addEventListener('pointerdown', (ev) => {
      Audio.unlock();
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
        if (this.inputBlocked()) return;
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
      Audio.unlock();
      if (ev.metaKey || ev.ctrlKey || this.inputBlocked()) return;
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
        this.rest(ev.shiftKey);
      } else if (key === 'q') {
        this.rotate(-1);
      } else if (key === 'e') {
        this.rotate(1);
      } else if (key === 'f') {
        this.search();
      } else if (key === 'z') {
        this.quickslot();
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
    this.fx.particles.setViewportHeight(h * this.renderer.getPixelRatio(), this.rig.camera.fov);
  }
}

const _w = new THREE.Vector3();
