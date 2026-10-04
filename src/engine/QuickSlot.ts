// Port of ui/QuickSlot's game-state half: what the quickslots hold. A stackable item is remembered by class
// (so the slot refills when you pick more up), anything else by instance.
import type { Item } from './items/Item';

export type QuickSlotValue = Item | string | null;

export const QuickSlot = {
  primaryValue: null as QuickSlotValue,
  secondaryValue: null as QuickSlotValue,
  /** Auto-aim target for the last quickslotted throw/zap (QuickSlot.target in PD). */
  lastTarget: -1,

  reset(): void {
    QuickSlot.primaryValue = null;
    QuickSlot.secondaryValue = null;
    QuickSlot.lastTarget = -1;
  },
};
