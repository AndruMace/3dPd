// Port of mechanics/ShadowCaster.java: PD's recursive-free octant shadowcasting with rounded view limits.
import { HEIGHT, WIDTH } from '../levels/constants';

const MAX_DISTANCE = 8;

const rounding: number[][] = [];
for (let i = 1; i <= MAX_DISTANCE; i++) {
  rounding[i] = new Array(i + 1).fill(0);
  for (let j = 1; j <= i; j++) {
    rounding[i][j] = Math.trunc(Math.min(j, Math.round(i * Math.cos(Math.asin(j / (i + 0.5))))));
  }
}

const SIZE = Math.trunc(((MAX_DISTANCE + 1) * (MAX_DISTANCE + 1)) / 2);
const obsA1 = new Float32Array(SIZE);
const obsA2 = new Float32Array(SIZE);
let obsLength = 0;
let obsLimit = 0;

function obsAdd(o1: number, o2: number) {
  if (obsLength > obsLimit && o1 <= obsA2[obsLength - 1]) {
    obsA2[obsLength - 1] = o2; // merge consecutive blocking cells
  } else {
    obsA1[obsLength] = o1;
    obsA2[obsLength++] = o2;
  }
}

function obsBlocked(a: number): boolean {
  for (let i = 0; i < obsLimit; i++) if (a >= obsA1[i] && a <= obsA2[i]) return true;
  return false;
}

export function castShadow(
  x: number,
  y: number,
  fieldOfView: Uint8Array,
  distance: number,
  losBlocking: Uint8Array,
): void {
  distance = Math.min(distance, MAX_DISTANCE);
  const limits = rounding[distance];
  fieldOfView.fill(0);
  fieldOfView[y * WIDTH + x] = 1;
  const scan = (m1: number, m2: number, m3: number, m4: number) => {
    obsLength = 0;
    obsLimit = 0;
    for (let p = 1; p <= distance; p++) {
      const dq2 = 0.5 / p;
      const pp = limits[p];
      for (let q = 0; q <= pp; q++) {
        const cx = x + q * m1 + p * m3;
        const cy = y + p * m2 + q * m4;
        if (cy >= 0 && cy < HEIGHT && cx >= 0 && cx < WIDTH) {
          const a0 = Math.fround(q / p);
          const a1 = Math.fround(a0 - dq2);
          const a2 = Math.fround(a0 + dq2);
          const pos = cy * WIDTH + cx;
          if (!(obsBlocked(a0) && obsBlocked(a1) && obsBlocked(a2))) fieldOfView[pos] = 1;
          if (losBlocking[pos]) obsAdd(a1, a2);
        }
      }
      obsLimit = obsLength;
    }
  };
  scan(+1, +1, 0, 0);
  scan(-1, +1, 0, 0);
  scan(+1, -1, 0, 0);
  scan(-1, -1, 0, 0);
  scan(0, 0, +1, +1);
  scan(0, 0, -1, +1);
  scan(0, 0, +1, -1);
  scan(0, 0, -1, -1);
}
