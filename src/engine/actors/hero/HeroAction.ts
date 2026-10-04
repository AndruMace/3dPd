// Port of actors/hero/HeroAction.java.
import type { Char } from '../Char';
import type { NPC } from '../mobs/npcs';

export type HeroAction =
  | { kind: 'move'; dst: number }
  | { kind: 'pickUp'; dst: number }
  | { kind: 'openChest'; dst: number }
  | { kind: 'buy'; dst: number }
  | { kind: 'interact'; dst: number; npc: NPC }
  | { kind: 'unlock'; dst: number }
  | { kind: 'descend'; dst: number }
  | { kind: 'ascend'; dst: number }
  | { kind: 'cook'; dst: number }
  | { kind: 'attack'; dst: number; target: Char };
