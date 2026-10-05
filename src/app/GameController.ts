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
import type { Mob } from '../engine/actors/mobs/Mob';
import { Inspect, type ExamineView, type StatusView } from '../engine/Inspect';
import type { GameEvent } from '../engine/core/events';
import type { Prompt } from '../engine/core/ui';
import { HEIGHT, WIDTH } from '../engine/levels/constants';
import { onAppPause } from '../platform/lifecycle';
import { Storage } from '../platform/storage';
import { submitRanking } from './rankings';
import { CameraRig } from '../render/camera/CameraRig';
import { ChaseCamera } from '../render/camera/ChaseCamera';
import { ActionGame, type Interaction } from '../engine/realtime/ActionGame';
import { Settings } from '../platform/settings';
import { ActionControls } from './ActionControls';
import { CharView, cellToWorld, MOVE_INTERVAL } from '../render/actors/CharView';
import { HeapView } from '../render/actors/HeapView';
import { FxView } from '../render/fx/FxView';
import { BlobEmitter, KINDS } from '../render/fx/Particles';
import { createWorldUniforms, CUT_CHASE, CUT_TOP_DOWN, FogOfWar, type WorldUniforms } from '../render/world/FogOfWar';
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
  /** Action mode (real time) is running this run. */
  action: boolean;
  /** Action mode: what the Interact button would do here (stairs), or null. */
  interaction: Interaction | null;
  /** Action mode: the enemy being fought, for the target frame. */
  target: { id: number; name: string; hp: number; ht: number } | null;
  /** Action mode: sprinting right now. */
  sprinting: boolean;
  /** Action mode: the touch Sprint toggle is on. */
  sprintToggle: boolean;
}

/** What the minimap draws: the level as the hero knows it, and where things are (in cells). */
export interface MinimapView {
  map: ArrayLike<number>;
  visited: ArrayLike<number>;
  mapped: ArrayLike<number>;
  visible: ArrayLike<number>;
  hero: { x: number; z: number; facing: number };
  /** Camera yaw (0 looks north). */
  yaw: number;
  mobs: { x: number; z: number }[];
  heaps: number[];
}

/** Action mode: characters are drawn this big relative to a cell (one cell is 3 m). */
const ACTION_CHAR_SCALE = 0.55;
const ACTION_ITEM_SCALE = 0.5;

/** What both cameras offer the controller. */
type Rig = CameraRig | ChaseCamera;

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
  private readonly topRig: CameraRig;
  private readonly chase: ChaseCamera;
  /** Action mode is on for the current run. */
  private action = false;
  private actionAlpha = 1;
  /** An enemy the player tapped or clicked, handed to the next world step. */
  private pendingEngage: Mob | null = null;
  private readonly targetRing: THREE.Mesh;
  private readonly aimLine: THREE.Mesh;
  private controls!: ActionControls;
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
    action: false,
    interaction: null,
    target: null,
    sprinting: false,
    sprintToggle: false,
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

    this.topRig = new CameraRig(1);
    this.chase = new ChaseCamera(1);
    this.targetRing = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.2, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd040, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.targetRing.visible = false;
    // A thin strip on the floor along the aimed direction (length in cells).
    this.aimLine = new THREE.Mesh(
      new THREE.PlaneGeometry(6, 0.06).rotateX(-Math.PI / 2).translate(3, 0, 0),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false }),
    );
    this.aimLine.visible = false;
    this.uniforms = createWorldUniforms(this.fog);
    this.scene.background = new THREE.Color(0x000000);

    this.scene.add(new THREE.HemisphereLight(0x8899aa, 0x223311, 0.9));
    this.scene.add(new THREE.AmbientLight(0x404040, 0.6));
    this.heroLight = new THREE.PointLight(0xffe2b0, 14, 10, 1.4);
    this.heroLight.position.set(0, 1.6, 0);
    this.scene.add(this.fx);
    this.scene.add(this.targetRing);
    this.scene.add(this.aimLine);

    this.floating = new FloatingTextLayer(container);
    this.controls = new ActionControls(this.renderer.domElement, {
      rotateCamera: (r) => this.chase.rotateBy(r),
      zoomCamera: (f) => this.chase.zoomBy(f),
      interact: () => this.interact(),
      quickslot: () => this.quickslot(this.mouseAim()),
      search: () => this.search(),
      tap: (x, y) => {
        Audio.unlock();
        if (this.inputBlocked()) return;
        const cell = this.pickCell(x, y);
        if (cell !== -1 && Game.prompt?.kind === 'cell') this.tapCell(cell);
        else if (this.action) this.pendingEngage = this.pickMob(x, y);
      },
      blocked: () => this.inputBlocked() || !this.canCommand(),
    });
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

  get rig(): Rig {
    return this.action ? this.chase : this.topRig;
  }

  /** Classic (turn-based) or action (real-time) for the run about to start, from Settings. */
  private applyMode(): void {
    this.action = Settings.get().mode === 'action';
    ActionGame.enable(this.action);
    this.controls.enabled = this.action;
    this.controls.reset();
    const cut = this.action ? CUT_CHASE : CUT_TOP_DOWN;
    this.uniforms.uCutAlong.value.copy(cut.along);
    this.uniforms.uCutLateral.value.copy(cut.lateral);
    this.uniforms.uCutHeight.value = this.action ? 0.12 : 0.18;
    // Up close the hero's lantern would blow out nearby walls: dimmer and shorter-ranged in action mode.
    this.heroLight.position.set(0, this.action ? 1.4 : 1.6, 0);
    this.heroLight.intensity = this.action ? 3 : 14;
    this.heroLight.distance = this.action ? 6 : 10;
    this.heroLight.decay = this.action ? 1 : 1.4;
    this.resize();
    this.patch({ action: this.action, interaction: null });
  }

  /** Action mode's Interact button / key. */
  interact(): void {
    if (!this.action || !this.canCommand()) return;
    ActionGame.interact();
    this.enqueue();
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
    this.applyMode();
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
      this.applyMode();
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

  /** The replay has caught up with the engine (in action mode events are shown as they come). */
  private idle(): boolean {
    if (this.action) return this.loading === 0;
    return this.queue.length === 0 && this.loading === 0 && this.wait <= 0;
  }

  /** Action mode: the world is frozen (windows, prompts, level changes, death). */
  private actionPaused(): boolean {
    return !this.canCommand() || this.inputBlocked() || this.state.resurrect || !!Dungeon.hero.pendingTransition;
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
    if (this.action) {
      if (this.canCommand()) ActionGame.search();
      this.enqueue();
      return;
    }
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
    if (this.action) {
      const item = Game.findItem(uid);
      if (item) ActionGame.useItem(item, action);
      this.enqueue();
      return;
    }
    Game.itemAction(uid, action);
    this.enqueue();
  }

  /**
   * The quickslot. In action mode it fires at once: at the target or best enemy ahead, or along `aim` (a world
   * direction) when the player aimed by hand.
   */
  quickslot(aim: [number, number] | null = null): void {
    if (this.action) {
      if (!this.canCommand()) return;
      ActionGame.useQuickslot(aim);
      this.enqueue();
      return;
    }
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
    if (this.action) this.stepAction(dt);
    this.playback(dt);
    if (this.action) this.syncBodies();
    this.placeTargetRing();

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
    if (this.action) {
      // Real time: everything that happened this frame is shown at once; nothing waits on animations.
      while (this.loading === 0) {
        const e = this.queue.shift();
        if (!e) break;
        if (e.type !== 'move' && e.type !== 'place') this.show(e);
      }
      this.wait = 0;
      if (this.queue.length === 0) this.advanceEngine();
    } else this.wait -= dt;
    while (!this.action && this.wait <= 0 && this.loading === 0) {
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

  /** Action mode: feed the stick to the world and advance it (unless something has it paused). */
  private stepAction(dt: number): void {
    if (!Dungeon.hero || this.loading > 0) return;
    const [sx, sy] = this.controls.stick(dt);
    if (this.actionPaused()) {
      this.actionAlpha = 1;
    } else {
      const [mx, mz] = this.chase.stickToWorld(sx, sy);
      this.actionAlpha = ActionGame.update(dt, {
        moveX: mx,
        moveZ: mz,
        attack: this.controls.attacking(),
        sprint: this.controls.sprinting(),
        engage: this.pendingEngage,
      });
      this.pendingEngage = null;
      this.enqueue();
      // On touch, the camera swings round behind the direction of travel unless the player is looking around.
      if (this.controls.touchMoving && this.controls.sinceLook > 1)
        this.chase.follow(mx, mz, 1.1 * Math.hypot(sx, sy), dt);
    }
    const t = ActionGame.target;
    const target = t ? { id: t.id(), name: t.name, hp: Math.max(0, t.HP), ht: t.HT } : null;
    const cur = this.state.target;
    if (
      (target === null) !== (cur === null) ||
      (target && cur && (target.id !== cur.id || target.hp !== cur.hp || target.ht !== cur.ht))
    )
      this.patch({ target });
    if (ActionGame.sprinting !== this.state.sprinting) this.patch({ sprinting: ActionGame.sprinting });
    const interaction = ActionGame.interaction();
    if (interaction?.kind !== this.state.interaction?.kind || interaction?.cell !== this.state.interaction?.cell)
      this.patch({ interaction });
  }

  /** Action mode: characters stand where their bodies are (interpolated between steps), run while moving. */
  private syncBodies(): void {
    if (this.loading > 0 || !Dungeon.hero) return;
    const a = this.actionAlpha;
    const turn = Settings.get().turnFigures;
    const cam = this.chase.camera;
    const right = _r.setFromMatrixColumn(cam.matrixWorld, 0);
    for (const b of ActionGame.bodies().values()) {
      const v = this.chars.get(b.char.id());
      if (!v) continue;
      v.pos = b.char.pos;
      v.position.x = b.px + (b.x - b.px) * a;
      v.position.z = b.pz + (b.z - b.pz) * a;
      const speed = Math.hypot(b.vx, b.vz);
      v.setRunning(speed > 0.15);
      // Resting: the hero sits down (squashed a little towards the floor).
      const sit = b.char === Dungeon.hero && ActionGame.sitting;
      v.sprite.scale.y += ((sit ? 0.78 : 1) - v.sprite.scale.y) * 0.2;
      v.sprite.billboard = !turn;
      if (turn) {
        v.sprite.flipped = false;
        v.sprite.yaw = -b.facing;
      } else {
        const lateral = b.vx * right.x + b.vz * right.z;
        if (Math.abs(lateral) > 0.08) v.sprite.flipped = lateral < 0;
      }
    }
  }

  /** Action mode: the ring under the current target. */
  private placeTargetRing(): void {
    const t = this.action ? ActionGame.target : null;
    const v = t ? this.chars.get(t.id()) : undefined;
    this.targetRing.visible = !!v && v.visible;
    if (v) {
      this.targetRing.position.set(v.position.x, 0.02, v.position.z);
      this.targetRing.scale.setScalar(1 + Math.sin(performance.now() / 160) * 0.06);
    }
  }

  /** The enemy closest to where the player tapped/clicked (within about half a cell), if any. */
  pickMob(clientX: number, clientY: number): Mob | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    let best: Mob | null = null;
    let bestD = 0.45;
    for (const b of ActionGame.bodies().values()) {
      const m = b.char;
      if (m === Dungeon.hero || !Dungeon.visible[m.pos]) continue;
      // Distance from the tap ray to the character's middle.
      const d = this.raycaster.ray.distanceToPoint(_p.set(b.x, 0.25, b.z));
      if (d < bestD) {
        bestD = d;
        best = m as Mob;
      }
    }
    return best;
  }

  /** The minimap's view of the level (action mode). */
  minimap(): MinimapView | null {
    if (!this.action || !Dungeon.hero || !Dungeon.level) return null;
    const level = Dungeon.level;
    const bodies = ActionGame.bodies();
    const hb = bodies.get(Dungeon.hero);
    if (!hb) return null;
    const mobs: { x: number; z: number }[] = [];
    for (const b of bodies.values())
      if (b.char !== Dungeon.hero && Dungeon.visible[b.char.pos]) mobs.push({ x: b.x, z: b.z });
    const heaps: number[] = [];
    for (const h of level.heaps.values()) if (level.visited[h.pos] || level.mapped[h.pos]) heaps.push(h.pos);
    return {
      map: level.map,
      visited: level.visited,
      mapped: level.mapped,
      visible: Dungeon.visible,
      hero: { x: hb.x, z: hb.z, facing: hb.facing },
      yaw: this.chase.yaw,
      mobs,
      heaps,
    };
  }

  /** The direction from the hero to the ground under the mouse, if the mouse is over the view. */
  private mouseAim(): [number, number] | null {
    const m = this.controls.mouse;
    if (!m || performance.now() - m.t > 4000) return null;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((m.x - rect.left) / rect.width) * 2 - 1, -((m.y - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.rig.camera);
    const hit = this.raycaster.ray.intersectPlane(this.ground, new THREE.Vector3());
    const hb = Dungeon.hero && ActionGame.bodies().get(Dungeon.hero);
    if (!hit || !hb) return null;
    const dx = hit.x - hb.x;
    const dz = hit.z - hb.z;
    return Math.hypot(dx, dz) > 0.05 ? [dx, dz] : null;
  }

  /** A screen-space drag (CSS px, y down) as a world direction, relative to the camera. */
  dragToWorld(dx: number, dy: number): [number, number] {
    return this.chase.stickToWorld(dx, -dy);
  }

  /** Touch aiming from the quickslot: show the line while dragging, null to hide it. */
  setAimPreview(dir: [number, number] | null): void {
    this.aimLine.visible = !!dir && this.action;
    if (!dir || !Dungeon.hero) return;
    const hb = ActionGame.bodies().get(Dungeon.hero);
    if (!hb) return;
    this.aimLine.position.set(hb.x, 0.05, hb.z);
    this.aimLine.rotation.y = Math.atan2(-dir[1], dir[0]);
  }

  /** On-screen Attack button (held) and Sprint toggle. */
  setAttackButton(down: boolean): void {
    this.controls.attackButton = down;
  }

  toggleSprint(): void {
    this.controls.sprintToggle = !this.controls.sprintToggle;
    this.patch({ sprintToggle: this.controls.sprintToggle });
  }

  get sprintToggled(): boolean {
    return this.controls.sprintToggle;
  }

  /** Size a character view for the current mode. */
  private styleChar(v: CharView): CharView {
    v.scale.setScalar(this.action ? ACTION_CHAR_SCALE : 1);
    return v;
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
          this.styleChar(v);
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
          this.floating.show(v, e.text, e.color, (v.sprite.def.frameHeight / 16) * v.scale.y);
        if (e.id === this.heroId) this.refreshStatus();
        return 0;
      }
      case 'alert': {
        const v = this.chars.get(e.id);
        if (v && v.visible) this.floating.show(v, '!', 'negative', (v.sprite.def.frameHeight / 16) * v.scale.y);
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
      case 'area':
        if (e.x !== undefined && e.z !== undefined) this.fx.areaWarning(e.x, e.z, e.r ?? 0.5, e.v ?? 1);
        return 0;
      case 'pushing':
      case 'swap': {
        // Action mode: bodies carry characters; pushes are knockback in the engine.
        if (this.action) return 0;
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
        if (this.action) {
          v.sprite.play('jump', true);
          v.hop(0.45, 0.7);
          return 0;
        }
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
      case 'windup': {
        // Action mode: a mob is about to strike.
        const v = this.chars.get(e.id!);
        v?.telegraph(e.v ?? 0.4);
        return 0;
      }
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
      if (this.action) v.scale.setScalar(ACTION_ITEM_SCALE);
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
      if (this.action) v.scale.setScalar(ACTION_ITEM_SCALE);
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
      this.levelView = new LevelView(atlas, water, this.uniforms, this.action ? ACTION_ITEM_SCALE : 1);
      this.levelView.build(e.map);
      this.scene.add(this.levelView);

      const views = await Promise.all(e.chars.map((c) => CharView.create(c.id, c.sprite, c.pos)));
      views.forEach((v, i) => {
        this.styleChar(v);
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
        if (this.action) h.scale.setScalar(ACTION_ITEM_SCALE);
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
      if (this.action) return;
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
      if (this.action) return;
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
      if (this.action) return;
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
        if (this.action) return;
        ev.preventDefault();
        this.rig.zoomBy(Math.exp(ev.deltaY * 0.001));
      },
      { passive: false },
    );

    addEventListener('keydown', (ev) => {
      Audio.unlock();
      if (ev.metaKey || ev.ctrlKey || this.inputBlocked() || this.action) return;
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
    this.topRig.setAspect(w / h);
    this.chase.setAspect(w / h);
    this.fx.particles.setViewportHeight(h * this.renderer.getPixelRatio(), this.rig.camera.fov);
  }
}

const _w = new THREE.Vector3();
const _r = new THREE.Vector3();
const _p = new THREE.Vector3();
