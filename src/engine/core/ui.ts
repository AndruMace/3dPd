// Requests from game logic to the player: PD's GameScene.selectCell / selectItem / show(Wnd...). The engine
// stores one pending request; the view presents it and answers through Game.answer(), which runs the callback.
import type { Item } from '../items/Item';

export type ItemSelectorMode =
  | 'ALL'
  | 'UNIDENTIFED'
  | 'UPGRADEABLE'
  | 'QUICKSLOT'
  | 'FOR_SALE'
  | 'WEAPON'
  | 'ARMOR'
  | 'ENCHANTABLE'
  | 'WAND'
  | 'SEED';

export type Prompt =
  | { kind: 'cell'; prompt: string; onSelect: (cell: number | null) => void }
  | { kind: 'item'; mode: ItemSelectorMode; title: string; onSelect: (item: Item | null) => void }
  /** onSelect(-1) when dismissed; `cancellable: false` hides the back/close affordance. */
  | {
      kind: 'options';
      title: string;
      message: string;
      options: string[];
      cancellable?: boolean;
      /** Portrait for NPC dialogs (WndQuest): a character sprite id, or an item image index. */
      sprite?: string;
      itemImage?: number;
      onSelect: (index: number) => void;
    }
  /** Plain information windows (WndMessage, WndStory, sign text, quest text). */
  | { kind: 'message'; title?: string; sprite?: string; itemImage?: number; text: string; onClose?: () => void };

let pending: Prompt | null = null;
const queue: Prompt[] = [];

export const UI = {
  get pending(): Prompt | null {
    return pending;
  },

  request(p: Prompt): void {
    if (pending) queue.push(p);
    else pending = p;
  },

  selectCell(prompt: string, onSelect: (cell: number | null) => void): void {
    UI.request({ kind: 'cell', prompt, onSelect });
  },

  selectItem(mode: ItemSelectorMode, title: string, onSelect: (item: Item | null) => void): void {
    UI.request({ kind: 'item', mode, title, onSelect });
  },

  options(
    title: string,
    message: string,
    options: string[],
    onSelect: (index: number) => void,
    cancellable = true,
  ): void {
    UI.request({ kind: 'options', title, message, options, onSelect, cancellable });
  },

  message(text: string, title?: string, onClose?: () => void): void {
    UI.request({ kind: 'message', text, title, onClose });
  },

  /** WndQuest: an NPC speaks; with options, the answer is passed to onSelect. */
  quest(
    npc: { name: string; spriteId: string },
    text: string,
    options: string[] = [],
    onSelect: (index: number) => void = () => {},
  ): void {
    const title = npc.name.charAt(0).toUpperCase() + npc.name.slice(1);
    if (options.length === 0) UI.request({ kind: 'message', text, title, sprite: npc.spriteId });
    else
      UI.request({
        kind: 'options',
        title,
        message: text,
        options,
        sprite: npc.spriteId,
        onSelect,
        cancellable: false,
      });
  },

  /** Takes the current request (the caller runs its callback) and promotes the next queued one. */
  take(): Prompt | null {
    const p = pending;
    pending = queue.shift() ?? null;
    return p;
  },

  clear(): void {
    pending = null;
    queue.length = 0;
  },
};
