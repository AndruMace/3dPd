// PD's Music and Sample: the original MP3s through Web Audio. Sound effects are panned by where their cell is
// on screen (PD plays them flat; panning is the one 3D liberty taken here).
import { Settings } from '../platform/settings';

const ROOT = `${import.meta.env.BASE_URL}assets/audio/`;

class AudioSystem {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private musicEl: HTMLAudioElement | null = null;
  private musicFile: string | null = null;
  get musicOn(): boolean {
    return Settings.get().music;
  }
  get soundOn(): boolean {
    return Settings.get().sound;
  }

  /** WndSettings toggled music: start or stop the current track. */
  applySettings(): void {
    if (!this.musicEl) return;
    if (this.musicOn && this.ctx) void this.musicEl.play().catch(() => {});
    else this.musicEl.pause();
  }

  /** Browsers only allow audio after a user gesture: call this from the first pointer/key event. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    if (this.musicFile && this.musicEl?.paused && this.musicOn) void this.musicEl.play().catch(() => {});
  }

  private load(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p && this.ctx) {
      const ctx = this.ctx;
      p = fetch(ROOT + file)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .catch(() => null);
      this.buffers.set(file, p);
    }
    return p ?? Promise.resolve(null);
  }

  /** Sample.play: `pan` in -1..1. */
  play(file: string, pan = 0, volume = 1): void {
    if (!this.soundOn || !this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    void this.load(file).then((buffer) => {
      if (!buffer || !this.sfxGain) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = volume;
      let node: AudioNode = src;
      if (ctx.createStereoPanner) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = Math.max(-1, Math.min(1, pan));
        node.connect(panner);
        node = panner;
      }
      node.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
    });
  }

  /** Music.play(file, looping): streamed through an <audio> element. */
  music(file: string): void {
    if (this.musicFile === file) return;
    this.musicFile = file;
    this.musicEl?.pause();
    const el = new window.Audio(ROOT + file);
    el.loop = true;
    el.volume = 0.6;
    this.musicEl = el;
    if (this.musicOn && this.ctx) void el.play().catch(() => {});
  }

  /** Pause everything while the app is in the background. */
  pause(): void {
    this.musicEl?.pause();
    void this.ctx?.suspend();
  }

  resume(): void {
    if (this.ctx?.state === 'suspended') void this.ctx.resume();
    if (this.musicOn && this.musicEl && this.ctx) void this.musicEl.play().catch(() => {});
  }
}

export const Audio = new AudioSystem();
