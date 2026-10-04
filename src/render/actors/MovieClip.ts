// Frame timing ported from Noosa's MovieClip.updateAnimation / play, so animations keep PD's exact pacing.
import type { AnimationDef } from '../../content/sprites';

export class MovieClip {
  anim: AnimationDef | null = null;
  curFrame = 0;
  finished = false;
  private frameTimer = 0;

  constructor(
    private readonly onFrame: (frame: number) => void,
    private readonly onComplete?: (anim: AnimationDef) => void,
  ) {}

  play(anim: AnimationDef, force = false): void {
    if (!force && this.anim === anim && (anim.loop || !this.finished)) return;
    this.anim = anim;
    this.curFrame = 0;
    this.finished = false;
    this.frameTimer = 0;
    this.onFrame(anim.frames[0]);
  }

  update(elapsed: number): void {
    const anim = this.anim;
    if (!anim || anim.fps <= 0 || (!anim.loop && this.finished)) return;
    const delay = 1 / anim.fps;
    const last = this.curFrame;
    this.frameTimer += elapsed;
    while (this.frameTimer > delay) {
      this.frameTimer -= delay;
      if (this.curFrame === anim.frames.length - 1) {
        if (anim.loop) this.curFrame = 0;
        this.finished = true;
        this.onComplete?.(anim);
        if (this.anim !== anim) return;
        if (!anim.loop) break;
      } else {
        this.curFrame++;
      }
    }
    if (this.curFrame !== last) this.onFrame(anim.frames[this.curFrame]);
  }
}
