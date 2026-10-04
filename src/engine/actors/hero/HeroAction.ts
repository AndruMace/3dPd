// Port of actors/hero/HeroAction.java (the subset used so far).
import type { Char } from '../Char';

export type HeroAction =
  | { kind: 'move'; dst: number }
  | { kind: 'attack'; dst: number; target: Char }
  | { kind: 'descend'; dst: number }
  | { kind: 'ascend'; dst: number };
