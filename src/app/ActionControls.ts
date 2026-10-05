// Action mode input. Keyboard: WASD/arrows to move, Shift to sprint, F/J to attack, E/Space/Enter to interact,
// 1 for the quickslot (aimed at the mouse), Q to search, Z/C to turn the camera. Mouse: click an enemy to fight it, drag to turn the camera, wheel to zoom. Touch: a floating joystick on the left half of the screen, drag on
// the right half to look around. Taps (no drag) are passed on, e.g. to answer cell prompts.

import { Settings } from '../platform/settings';

const JOYSTICK_RADIUS = 56; // CSS px
const TAP_SLOP = 10;
const LOOK_SPEED = Math.PI / 400; // radians per CSS px dragged

export interface ControlsHost {
  rotateCamera(radians: number): void;
  /** The quickslot key (1): aimed at the mouse cursor when it's over the view. */
  quickslot(): void;
  /** The search key (Q). */
  search(): void;
  zoomCamera(factor: number): void;
  interact(): void;
  tap(clientX: number, clientY: number): void;
  /** Windows or prompts are up: ignore movement keys. */
  blocked(): boolean;
}

interface TouchPointer {
  id: number;
  kind: 'stick' | 'look' | 'mouse';
  sx: number;
  sy: number;
  x: number;
  y: number;
  dragged: boolean;
}

export class ActionControls {
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, TouchPointer>();
  private stickX = 0;
  private stickY = 0;
  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  /** Seconds since the camera was turned by hand (auto-follow waits a moment after manual looking). */
  sinceLook = 99;
  /** The last movement came from a touch joystick (the camera follows movement only then). */
  touchMoving = false;
  enabled = false;
  /** The on-screen Attack button is held. */
  attackButton = false;
  /** The on-screen Sprint toggle. */
  sprintToggle = false;
  /** Where the mouse last was over the view (client coordinates), and when. */
  mouse: { x: number; y: number; t: number } | null = null;

  constructor(
    private readonly el: HTMLElement,
    private readonly host: ControlsHost,
  ) {
    this.base = document.createElement('div');
    this.base.className = 'joystick-base';
    this.knob = document.createElement('div');
    this.knob.className = 'joystick-knob';
    this.base.appendChild(this.knob);
    el.parentElement!.appendChild(this.base);

    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.mouse = null;
    });
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e));
    el.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      this.host.zoomCamera(Math.exp(e.deltaY * 0.001));
    });
    addEventListener('keydown', (e) => {
      if (!this.enabled || e.metaKey || e.ctrlKey) return;
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code))
        e.preventDefault();
      // Held keys are always tracked (a key pressed during a brief pause still counts once play resumes);
      // stick() and attacking() ignore them while play is blocked.
      this.keys.add(e.code);
      if (this.host.blocked()) return;
      if (e.repeat) return;
      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') this.host.interact();
      else if (e.code === 'Digit1') this.host.quickslot();
      else if (e.code === 'KeyQ') this.host.search();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
  }

  /** Attack is held (key or on-screen button). */
  attacking(): boolean {
    return !this.host.blocked() && (this.attackButton || this.keys.has('KeyF') || this.keys.has('KeyJ'));
  }

  /** Sprint is on (Shift held, or the touch toggle). */
  sprinting(): boolean {
    return this.sprintToggle || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
  }

  /** Camera-relative movement: x to the right, y forward, length up to 1. */
  stick(dt: number): [number, number] {
    this.sinceLook += dt;
    let x = 0;
    let y = 0;
    if (!this.host.blocked()) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      const turn = 2.2 * Settings.get().lookSpeed * dt;
      if (this.keys.has('KeyZ')) this.host.rotateCamera(-turn);
      if (this.keys.has('KeyC')) this.host.rotateCamera(turn);
    }
    const keyLen = Math.hypot(x, y);
    if (keyLen > 0) {
      this.touchMoving = false;
      return [x / keyLen, y / keyLen];
    }
    this.touchMoving = this.stickX !== 0 || this.stickY !== 0;
    return [this.stickX, this.stickY];
  }

  private down(e: PointerEvent): void {
    if (!this.enabled) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers can't be captured; the events still arrive.
    }
    const rect = this.el.getBoundingClientRect();
    let kind: TouchPointer['kind'] = 'mouse';
    if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      const hasStick = [...this.pointers.values()].some((p) => p.kind === 'stick');
      const leftHalf = e.clientX - rect.left < rect.width * 0.5;
      const stickHalf = Settings.get().stickSide === 'left' ? leftHalf : !leftHalf;
      kind = stickHalf && !hasStick && !this.host.blocked() ? 'stick' : 'look';
    }
    this.pointers.set(e.pointerId, {
      id: e.pointerId,
      kind,
      sx: e.clientX,
      sy: e.clientY,
      x: e.clientX,
      y: e.clientY,
      dragged: false,
    });
    if (kind === 'stick') {
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('active');
      this.knob.style.transform = 'translate(-50%, -50%)';
    }
  }

  private move(e: PointerEvent): void {
    if (e.pointerType === 'mouse') this.mouse = { x: e.clientX, y: e.clientY, t: performance.now() };
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    p.x = e.clientX;
    p.y = e.clientY;
    if (Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) p.dragged = true;
    if (p.kind === 'stick') {
      let ox = p.x - p.sx;
      let oy = p.y - p.sy;
      const len = Math.hypot(ox, oy);
      if (len > JOYSTICK_RADIUS) {
        ox = (ox / len) * JOYSTICK_RADIUS;
        oy = (oy / len) * JOYSTICK_RADIUS;
      }
      this.knob.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`;
      // A small dead zone, then full speed is reached a little before the rim.
      const mag = Math.min(1, Math.max(0, (Math.hypot(ox, oy) - 6) / (JOYSTICK_RADIUS * 0.8)));
      const ang = Math.atan2(oy, ox);
      this.stickX = Math.cos(ang) * mag;
      this.stickY = -Math.sin(ang) * mag;
    } else if (p.dragged) {
      this.host.rotateCamera(dx * LOOK_SPEED * Settings.get().lookSpeed);
      this.sinceLook = 0;
    }
  }

  private up(e: PointerEvent): void {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (!p) return;
    if (p.kind === 'stick') {
      this.stickX = this.stickY = 0;
      this.base.classList.remove('active');
    }
    if (!p.dragged && p.kind !== 'stick') this.host.tap(e.clientX, e.clientY);
    // A stick tap without dragging is also a tap (e.g. on a prompt's cell).
    if (!p.dragged && p.kind === 'stick') this.host.tap(e.clientX, e.clientY);
  }

  reset(): void {
    this.keys.clear();
    this.stickX = this.stickY = 0;
    this.attackButton = false;
    this.pointers.clear();
    this.base.classList.remove('active');
  }
}
