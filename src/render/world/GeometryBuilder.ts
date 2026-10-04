// Accumulates textured quads into one BufferGeometry. Each quad carries the cell it belongs to (aCell) and a
// "cut" weight (aCut) so the wall cut-away shader can lower whole wall columns near the hero.
import * as THREE from 'three';

type V3 = [number, number, number];

export class GeometryBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uv: number[] = [];
  private col: number[] = [];
  private cell: number[] = [];
  private cut: number[] = [];
  private idx: number[] = [];

  /** Corners in counter-clockwise order (as seen from the front), starting bottom-left of the texture. */
  quad(
    corners: [V3, V3, V3, V3],
    normal: V3,
    uv: [number, number, number, number],
    shade: number,
    cellX: number,
    cellY: number,
    cut = 0,
  ): void {
    const base = this.pos.length / 3;
    const [u0, v0, u1, v1] = uv;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    for (let i = 0; i < 4; i++) {
      this.pos.push(...corners[i]);
      this.nor.push(...normal);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]);
      this.col.push(shade, shade, shade);
      this.cell.push(cellX + 0.5, cellY + 0.5);
      this.cut.push(cut);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Horizontal quad covering cell (x, y) at height h, texture "up" towards -z (north). */
  floor(x: number, y: number, h: number, uv: [number, number, number, number], shade = 1): void {
    this.quad(
      [
        [x, h, y + 1],
        [x + 1, h, y + 1],
        [x + 1, h, y],
        [x, h, y],
      ],
      [0, 1, 0],
      uv,
      shade,
      x,
      y,
    );
  }

  /** Vertical face on one side of cell (x, y) spanning heights [h0, h1]. side: 0=N(-z) 1=E(+x) 2=S(+z) 3=W(-x). */
  side(
    x: number,
    y: number,
    side: number,
    h0: number,
    h1: number,
    uv: [number, number, number, number],
    shade: number,
    cut = 0,
  ): void {
    let c: [V3, V3, V3, V3];
    let n: V3;
    switch (side) {
      case 0:
        c = [
          [x + 1, h0, y],
          [x, h0, y],
          [x, h1, y],
          [x + 1, h1, y],
        ];
        n = [0, 0, -1];
        break;
      case 1:
        c = [
          [x + 1, h0, y + 1],
          [x + 1, h0, y],
          [x + 1, h1, y],
          [x + 1, h1, y + 1],
        ];
        n = [1, 0, 0];
        break;
      case 2:
        c = [
          [x, h0, y + 1],
          [x + 1, h0, y + 1],
          [x + 1, h1, y + 1],
          [x, h1, y + 1],
        ];
        n = [0, 0, 1];
        break;
      default:
        c = [
          [x, h0, y],
          [x, h0, y + 1],
          [x, h1, y + 1],
          [x, h1, y],
        ];
        n = [-1, 0, 0];
    }
    // Map only the visible fraction of the texture when the face is shorter than a tile.
    const [u0, v0, u1, v1] = uv;
    const frac = Math.min(1, h1 - h0);
    this.quad(c, n, [u0, v1 - (v1 - v0) * frac, u1, v1], shade, x, y, cut);
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('aCell', new THREE.Float32BufferAttribute(this.cell, 2));
    g.setAttribute('aCut', new THREE.Float32BufferAttribute(this.cut, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
