// Turns one sprite frame into a voxel mesh. Every opaque pixel becomes a column of voxels whose thickness grows
// with its distance from the silhouette edge ("inflation"), centered on z = 0, so flat pixel art reads as a
// rounded solid while the front view stays pixel-identical to the original sprite.
//
// Units: one voxel = one source pixel. The mesh origin is the bottom-center of the frame, matching how PD
// bottom-aligns and horizontally centers character sprites within their cell.

export interface PixelSource {
  width: number;
  height: number;
  /** RGBA, row-major, top row first (ImageData layout). */
  data: Uint8ClampedArray | Uint8Array;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VoxelizeOptions {
  /** Maximum total thickness in voxels. 1 gives a flat cut-out. */
  maxDepth?: number;
  /** Alpha at or above which a pixel counts as solid. */
  alphaThreshold?: number;
  /** Brightness multiplier for side faces, a cheap stand-in for ambient occlusion in the creases. */
  sideShade?: number;
}

export interface VoxelMeshData {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear-space RGB per vertex. */
  colors: Float32Array;
  indices: Uint32Array;
  /** Frame size in voxels. */
  width: number;
  height: number;
}

const srgbToLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
};

/** Chessboard distance from each solid pixel to the nearest empty pixel (or frame edge); 0 for empty pixels. */
export function edgeDistance(solid: Uint8Array, w: number, h: number): Uint16Array {
  const INF = 0xffff;
  const d = new Uint16Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = solid[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : d[y * w + x]);
  // Two-pass 8-connected distance transform.
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1, at(x + 1, y - 1) + 1);
    }
  for (let y = h - 1; y >= 0; y--)
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      d[i] = Math.min(d[i], at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1, at(x - 1, y + 1) + 1);
    }
  return d;
}

export function voxelize(src: PixelSource, rect: Rect, opts: VoxelizeOptions = {}): VoxelMeshData {
  const maxDepth = Math.max(1, opts.maxDepth ?? 5);
  const alphaThreshold = opts.alphaThreshold ?? 128;
  const sideShade = opts.sideShade ?? 0.85;
  const { w, h } = rect;

  const solid = new Uint8Array(w * h);
  const rgb = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = rect.x + x;
      const sy = rect.y + y;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) continue;
      const p = (sy * src.width + sx) * 4;
      if (src.data[p + 3] < alphaThreshold) continue;
      const i = y * w + x;
      solid[i] = 1;
      rgb[i * 3] = srgbToLinear(src.data[p]);
      rgb[i * 3 + 1] = srgbToLinear(src.data[p + 1]);
      rgb[i * 3 + 2] = srgbToLinear(src.data[p + 2]);
    }

  // Column extent [-half, +half] in voxel units; thickness is odd so columns stay centered on z = 0.
  const dist = edgeDistance(solid, w, h);
  const half = new Float32Array(w * h);
  for (let i = 0; i < half.length; i++) {
    if (!solid[i]) continue;
    const thickness = Math.min(maxDepth, 2 * dist[i] - 1);
    half[i] = thickness / 2;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  // World position of pixel corner (px, py): x centered, y up from the frame's bottom edge.
  const X = (px: number) => px - w / 2;
  const Y = (py: number) => h - py;

  const quad = (corners: [number, number, number][], n: [number, number, number], r: number, g: number, b: number) => {
    const base = positions.length / 3;
    for (const c of corners) {
      positions.push(c[0], c[1], c[2]);
      normals.push(n[0], n[1], n[2]);
      colors.push(r, g, b);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  // Front and back faces, merged into horizontal runs of identical color and depth.
  for (let y = 0; y < h; y++) {
    let x = 0;
    while (x < w) {
      const i = y * w + x;
      if (!solid[i]) {
        x++;
        continue;
      }
      let end = x + 1;
      while (end < w) {
        const j = y * w + end;
        if (!solid[j] || half[j] !== half[i]) break;
        if (rgb[j * 3] !== rgb[i * 3] || rgb[j * 3 + 1] !== rgb[i * 3 + 1] || rgb[j * 3 + 2] !== rgb[i * 3 + 2]) break;
        end++;
      }
      const z = half[i];
      const [r, g, b] = [rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]];
      const x0 = X(x);
      const x1 = X(end);
      const y0 = Y(y + 1);
      const y1 = Y(y);
      quad(
        [
          [x0, y0, z],
          [x1, y0, z],
          [x1, y1, z],
          [x0, y1, z],
        ],
        [0, 0, 1],
        r,
        g,
        b,
      );
      quad(
        [
          [x1, y0, -z],
          [x0, y0, -z],
          [x0, y1, -z],
          [x1, y1, -z],
        ],
        [0, 0, -1],
        r,
        g,
        b,
      );
      x = end;
    }
  }

  // Side faces: the part of each column not covered by its neighbor's (centered) column.
  const dirs: { dx: number; dy: number; n: [number, number, number] }[] = [
    { dx: 1, dy: 0, n: [1, 0, 0] },
    { dx: -1, dy: 0, n: [-1, 0, 0] },
    { dx: 0, dy: -1, n: [0, 1, 0] },
    { dx: 0, dy: 1, n: [0, -1, 0] },
  ];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!solid[i]) continue;
      const hz = half[i];
      const r = rgb[i * 3] * sideShade;
      const g = rgb[i * 3 + 1] * sideShade;
      const b = rgb[i * 3 + 2] * sideShade;
      for (const { dx, dy, n } of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        const nh = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : half[ny * w + nx];
        if (nh >= hz) continue;
        // Exposed bands: [nh, hz] in front and [-hz, -nh] behind (one band when the neighbor is empty).
        const bands: [number, number][] =
          nh === 0
            ? [[-hz, hz]]
            : [
                [nh, hz],
                [-hz, -nh],
              ];
        for (const [za, zb] of bands) {
          let corners: [number, number, number][];
          if (dx === 1) {
            const fx = X(x + 1);
            corners = [
              [fx, Y(y + 1), zb],
              [fx, Y(y + 1), za],
              [fx, Y(y), za],
              [fx, Y(y), zb],
            ];
          } else if (dx === -1) {
            const fx = X(x);
            corners = [
              [fx, Y(y + 1), za],
              [fx, Y(y + 1), zb],
              [fx, Y(y), zb],
              [fx, Y(y), za],
            ];
          } else if (dy === -1) {
            const fy = Y(y);
            corners = [
              [X(x), fy, zb],
              [X(x + 1), fy, zb],
              [X(x + 1), fy, za],
              [X(x), fy, za],
            ];
          } else {
            const fy = Y(y + 1);
            corners = [
              [X(x), fy, za],
              [X(x + 1), fy, za],
              [X(x + 1), fy, zb],
              [X(x), fy, zb],
            ];
          }
          quad(corners, n, r, g, b);
        }
      }
    }

  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices: new Uint32Array(indices),
    width: w,
    height: h,
  };
}
