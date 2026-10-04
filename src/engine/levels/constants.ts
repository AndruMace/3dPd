export const WIDTH = 32;
export const HEIGHT = 32;
export const LENGTH = WIDTH * HEIGHT;

export const NEIGHBOURS4 = [-WIDTH, +1, +WIDTH, -1];
export const NEIGHBOURS8 = [+1, -1, +WIDTH, -WIDTH, +1 + WIDTH, +1 - WIDTH, -1 + WIDTH, -1 - WIDTH];
export const NEIGHBOURS9 = [0, +1, -1, +WIDTH, -WIDTH, +1 + WIDTH, +1 - WIDTH, -1 + WIDTH, -1 - WIDTH];

/** Chebyshev distance between two cells. */
export function distance(a: number, b: number): number {
  const ax = a % WIDTH;
  const ay = Math.floor(a / WIDTH);
  const bx = b % WIDTH;
  const by = Math.floor(b / WIDTH);
  return Math.max(Math.abs(ax - bx), Math.abs(ay - by));
}

export function adjacent(a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff === 1 || diff === WIDTH || diff === WIDTH + 1 || diff === WIDTH - 1;
}
