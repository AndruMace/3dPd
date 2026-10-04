import { describe, expect, it } from 'vitest';
import { edgeDistance, voxelize, type PixelSource } from '../src/render/voxel/voxelize';
import { MovieClip } from '../src/render/actors/MovieClip';

function image(rows: string[]): PixelSource {
  const h = rows.length;
  const w = rows[0].length;
  const data = new Uint8Array(w * h * 4);
  rows.forEach((row, y) =>
    [...row].forEach((c, x) => {
      if (c === '.') return;
      const p = (y * w + x) * 4;
      data.set(c === 'r' ? [255, 0, 0, 255] : [0, 0, 255, 255], p);
    }),
  );
  return { width: w, height: h, data };
}

const quads = (m: { indices: Uint32Array }) => m.indices.length / 6;

describe('voxelize', () => {
  it('turns a single pixel into a closed unit cube', () => {
    const m = voxelize(image(['r']), { x: 0, y: 0, w: 1, h: 1 });
    expect(quads(m)).toBe(6);
    const zs = [...m.positions].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs) - Math.min(...zs)).toBe(1);
  });

  it('inflates interior pixels and stays symmetric around z = 0', () => {
    const src = image(['rrrrr', 'rrrrr', 'rrrrr', 'rrrrr', 'rrrrr']);
    const m = voxelize(src, { x: 0, y: 0, w: 5, h: 5 }, { maxDepth: 9 });
    const zs = [...m.positions].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBe(2.5); // center pixel is 3 from the edge -> thickness 5
    expect(Math.min(...zs)).toBe(-2.5);
  });

  it('clamps thickness to maxDepth', () => {
    const src = image(['rrrrr', 'rrrrr', 'rrrrr', 'rrrrr', 'rrrrr']);
    const zs = [...voxelize(src, { x: 0, y: 0, w: 5, h: 5 }, { maxDepth: 1 }).positions].filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs)).toBe(0.5);
  });

  it('places the origin at the bottom-center of the frame', () => {
    const m = voxelize(image(['.r', '.r']), { x: 0, y: 0, w: 2, h: 2 });
    const xs = [...m.positions].filter((_, i) => i % 3 === 0);
    const ys = [...m.positions].filter((_, i) => i % 3 === 1);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(1);
    expect(Math.min(...ys)).toBe(0);
    expect(Math.max(...ys)).toBe(2);
  });

  it('merges same-colored runs on the front face', () => {
    const m = voxelize(image(['rrb']), { x: 0, y: 0, w: 3, h: 1 }, { maxDepth: 1 });
    const front = [...m.normals].filter((_, i) => i % 12 === 2).filter((z) => z === 1).length;
    expect(front).toBe(2);
  });

  it('respects the frame rect within a sheet', () => {
    const m = voxelize(image(['r.', '..']), { x: 1, y: 0, w: 1, h: 2 });
    expect(m.indices.length).toBe(0);
  });

  it('every face normal points away from the solid', () => {
    const m = voxelize(image(['.r.', 'rrr', '.r.']), { x: 0, y: 0, w: 3, h: 3 }, { maxDepth: 3 });
    for (let t = 0; t < m.indices.length; t += 3) {
      const [a, b, c] = [m.indices[t], m.indices[t + 1], m.indices[t + 2]].map((i) => [
        m.positions[i * 3],
        m.positions[i * 3 + 1],
        m.positions[i * 3 + 2],
      ]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const i = m.indices[t] * 3;
      const dot = n[0] * m.normals[i] + n[1] * m.normals[i + 1] + n[2] * m.normals[i + 2];
      expect(dot).toBeGreaterThan(0);
    }
  });
});

describe('edgeDistance', () => {
  it('measures chessboard distance to empty space', () => {
    const solid = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect([...edgeDistance(solid, 3, 3)]).toEqual([1, 1, 1, 1, 2, 1, 1, 1, 1]);
  });
});

describe('MovieClip', () => {
  it('follows Noosa frame timing and loops', () => {
    const shown: number[] = [];
    const clip = new MovieClip((f) => shown.push(f));
    clip.play({ fps: 10, loop: true, frames: [5, 6, 7] });
    clip.update(0.15); // past one delay of 0.1
    clip.update(0.1);
    clip.update(0.1);
    expect(shown).toEqual([5, 6, 7, 5]);
  });

  it('stops on the last frame of a one-shot animation and reports completion once', () => {
    let done = 0;
    const shown: number[] = [];
    const clip = new MovieClip(
      (f) => shown.push(f),
      () => done++,
    );
    clip.play({ fps: 10, loop: false, frames: [1, 2] });
    clip.update(1);
    expect(shown).toEqual([1, 2]);
    expect(done).toBe(1);
    expect(clip.finished).toBe(true);
  });

  it('does not restart an animation that is already playing', () => {
    const shown: number[] = [];
    const clip = new MovieClip((f) => shown.push(f));
    const anim = { fps: 10, loop: true, frames: [1, 2] };
    clip.play(anim);
    clip.update(0.15);
    clip.play(anim);
    expect(shown).toEqual([1, 2]);
  });
});
