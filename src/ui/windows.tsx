// Ports of PD's windows: WndBag, WndItem, WndOptions, WndMessage, WndQuest, WndStory, WndInfo*, WndHero, WndGame.
import type { ComponentChildren } from 'preact';
import type { ExamineView, ItemWindowView, SlotView, StatusView } from '../engine/Inspect';
import { Chrome, Img, ItemIcon, NinePatch, Text } from './pixel/components';
import { CharPortrait, hex, HealthBar, IconTitle, ItemIconGlow, RedButton, TITLE_COLOR, Window } from './pixel/widgets';

const GAP = 2;

/** WndBag: the inventory grid (4 columns portrait, 6 landscape), with bag tabs underneath. */
export function WndBag({
  title,
  slots,
  cols,
  bags,
  currentBag,
  onSlot,
  onBag,
  onClose,
}: {
  title: string;
  slots: SlotView[];
  cols: number;
  bags: { uid: number; name: string }[];
  currentBag: number;
  onSlot: (slot: SlotView) => void;
  onBag: (uid: number) => void;
  onClose: () => void;
}) {
  const SLOT = 28;
  const MARGIN = 1;
  const width = SLOT * cols + MARGIN * (cols - 1);
  const BAG_ICONS: Record<string, [number, number]> = {
    backpack: [58, 0],
    'scroll holder': [68, 0],
    'seed pouch': [78, 0],
    'wand holster': [88, 0],
    'key ring': [64, 29],
  };
  const tabs =
    bags.length > 1 ? (
      <div class="tabs">
        {bags.map((b) => {
          const sel = b.uid === currentBag;
          const [ix, iy] = BAG_ICONS[b.name] ?? [58, 0];
          return (
            <NinePatch
              key={b.uid}
              src="chrome.png"
              x={sel ? 64 : 74}
              y={22}
              w={10}
              h={14}
              margin={[4, 7, 4, 6]}
              width={25}
              height={20}
              class="tab"
              onClick={() => onBag(b.uid)}
            >
              <Img
                src="icons.png"
                x={ix}
                y={iy}
                w={10}
                h={10}
                style={{ opacity: sel ? 1 : 0.6, margin: '1px auto 0' }}
              />
            </NinePatch>
          );
        })}
      </div>
    ) : null;
  return (
    <Window width={width} onClose={onClose} below={tabs}>
      <div style={{ height: '12px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <Text text={title} size={9} color={TITLE_COLOR} />
      </div>
      <div class="bag-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${SLOT}px)`, gap: `${MARGIN}px` }}>
        {slots.map((s, i) => (
          <ItemSlot key={i} slot={s} onClick={() => onSlot(s)} />
        ))}
      </div>
    </Window>
  );
}

function ItemSlot({ slot, onClick }: { slot: SlotView; onClick: () => void }) {
  const isGold = slot.image === 14 && slot.uid === null && !slot.placeholder;
  let bg = slot.equipped ? '#63665b' : '#4a4d44';
  if (slot.cursed) bg = slot.equipped ? '#96665b' : '#7d4d44';
  else if (slot.unidentified && slot.uid !== null) bg = slot.equipped ? '#7d667f' : '#644d6a';
  const active = slot.uid !== null && slot.enabled;
  return (
    <div
      class="item-slot"
      style={{ background: isGold ? 'transparent' : bg, opacity: slot.uid !== null && !slot.enabled ? 0.3 : 1 }}
      onClick={() => active && onClick()}
    >
      {slot.image >= 0 && (
        <div style={{ opacity: slot.placeholder ? 0.3 : 1 }}>
          <ItemIconGlow image={slot.image} glow={slot.glow} />
        </div>
      )}
      {slot.status && <Text text={slot.status} size={6} style={{ position: 'absolute', left: 0, top: 0 }} />}
      {slot.topRight && (
        <Text
          text={slot.topRight.text}
          size={6}
          color={hex(slot.topRight.color)}
          style={{ position: 'absolute', right: 0, top: 0 }}
        />
      )}
      {slot.bottomRight && slot.bottomRight.text && (
        <Text
          text={slot.bottomRight.text}
          size={6}
          color={hex(slot.bottomRight.color)}
          style={{ position: 'absolute', right: 0, bottom: 0 }}
        />
      )}
      {slot.durability !== null && (
        <div class="durability">
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ background: i < Math.round(3 * slot.durability!) ? '#00ee00' : '#cc0000' }} />
          ))}
        </div>
      )}
    </div>
  );
}

/** WndItem: icon title, description and one button per action (the default action in yellow). */
export function WndItem({
  view,
  onAction,
  onClose,
}: {
  view: ItemWindowView;
  onAction: (action: string) => void;
  onClose: () => void;
}) {
  const WIDTH = 120;
  return (
    <Window width={WIDTH} onClose={onClose}>
      <IconTitle
        width={WIDTH}
        icon={<ItemIconGlow image={view.image} glow={view.glow} />}
        label={view.title}
        color={view.titleColor !== null ? hex(view.titleColor) : TITLE_COLOR}
        health={view.durability}
      />
      <Text text={view.info} size={6} maxWidth={WIDTH} style={{ marginTop: `${GAP}px` }} />
      {view.actions.length > 0 && (
        <div class="item-actions">
          {view.actions.map((a) => (
            <RedButton
              key={a}
              label={a}
              height={16}
              onClick={() => onAction(a)}
              color={a === view.defaultAction ? TITLE_COLOR : undefined}
            />
          ))}
        </div>
      )}
    </Window>
  );
}

export function WndOptions({
  title,
  message,
  options,
  onSelect,
  onClose,
  portrait,
}: {
  title: string;
  message: string;
  options: string[];
  onSelect: (i: number) => void;
  onClose?: () => void;
  portrait?: ComponentChildren;
}) {
  const WIDTH = 120;
  return (
    <Window width={WIDTH} onClose={onClose}>
      {portrait ? (
        <IconTitle width={WIDTH} icon={portrait} label={title} />
      ) : (
        <Text text={title} size={9} color={TITLE_COLOR} maxWidth={WIDTH - 4} style={{ margin: '2px' }} />
      )}
      <Text text={message} size={portrait ? 6 : 8} maxWidth={WIDTH - 4} highlight style={{ margin: '2px' }} />
      {options.map((o, i) => (
        <div key={i} style={{ margin: '2px' }}>
          <RedButton label={o} width={WIDTH - 4} onClick={() => onSelect(i)} />
        </div>
      ))}
    </Window>
  );
}

export function WndMessage({
  text,
  title,
  portrait,
  onClose,
}: {
  text: string;
  title?: string;
  portrait?: ComponentChildren;
  onClose: () => void;
}) {
  const WIDTH = 120;
  return (
    <Window width={WIDTH} onClose={onClose}>
      <div onClick={onClose}>
        {(title || portrait) && <IconTitle width={WIDTH} icon={portrait} label={title ?? ''} />}
        <Text text={text} size={6} maxWidth={WIDTH - 8} highlight style={{ margin: title ? `${GAP}px 0 0` : '4px' }} />
      </div>
    </Window>
  );
}

/** WndStory: chapter text on a parchment scroll. */
export function WndStory({ text, onClose }: { text: string; onClose: () => void }) {
  return (
    <Window width={108} chrome={Chrome.SCROLL} onClose={onClose}>
      <div onClick={onClose}>
        <Text text={text} size={7} color="#000000" maxWidth={108} />
      </div>
    </Window>
  );
}

/** WndInfoMob / WndInfoItem / WndInfoPlant / WndInfoCell. */
export function WndInfo({ view, onClose }: { view: ExamineView; onClose: () => void }) {
  const WIDTH = 120;
  if (view.kind === 'message') return <WndMessage text={view.text} onClose={onClose} />;
  if (view.kind === 'hero') return null;
  let icon: ComponentChildren = null;
  let title = '';
  let info = '';
  let health: number | null = null;
  if (view.kind === 'mob') {
    icon = <CharPortrait sprite={view.sprite} />;
    title = view.name.charAt(0).toUpperCase() + view.name.slice(1);
    info = view.desc;
    health = view.hp / view.ht;
  } else if (view.kind === 'heap') {
    icon = <ItemIcon image={view.image} />;
    title = view.title;
    info = view.info;
  } else if (view.kind === 'plant') {
    icon = <Img src="plants.png" x={view.image * 16} y={0} w={16} h={16} />;
    title = view.title;
    info = view.info;
  } else {
    icon = <TileIcon tile={view.tile} />;
    title = view.title;
    info = view.info;
  }
  return (
    <Window width={WIDTH} onClose={onClose}>
      <div onClick={onClose}>
        <IconTitle width={WIDTH} icon={icon} label={title} health={health} />
        {view.kind === 'mob' && view.buffs.length > 0 && (
          <div class="buffs-row">
            {view.buffs.map((b) => (
              <Img key={b.icon} src="buffs.png" x={(b.icon % 18) * 7} y={Math.floor(b.icon / 18) * 7} w={7} h={7} />
            ))}
          </div>
        )}
        <Text text={info} size={6} maxWidth={WIDTH} highlight style={{ marginTop: `${GAP}px` }} />
      </div>
    </Window>
  );
}

let currentTiles = 'tiles0.png';
export function setTileSheet(file: string): void {
  currentTiles = file;
}
function TileIcon({ tile }: { tile: number }) {
  return <Img src={currentTiles} x={(tile % 16) * 16} y={Math.floor(tile / 16) * 16} w={16} h={16} />;
}

/** WndHero: the hero's stats and active buffs. */
export function WndHero({
  status,
  title,
  gold,
  deepest,
  onClose,
}: {
  status: StatusView;
  title: string;
  gold: number;
  deepest: number;
  onClose: () => void;
}) {
  const WIDTH = 100;
  const rows: [string, string][] = [
    ['Strength', String(status.str)],
    ['Health', `${status.hp}/${status.ht}`],
    ['Experience', `${status.exp}/${status.maxExp}`],
  ];
  const rows2: [string, string][] = [
    ['Gold Collected', String(gold)],
    ['Maximum Depth', String(deepest)],
  ];
  const statRow = ([label, value]: [string, string]) => (
    <div key={label} class="stat-row">
      <Text text={label} size={8} />
      <Text text={value} size={8} style={{ position: 'absolute', left: `${WIDTH * 0.65}px` }} />
    </div>
  );
  return (
    <Window width={WIDTH} onClose={onClose}>
      <div onClick={onClose}>
        <Text text={title.toUpperCase()} size={9} color={TITLE_COLOR} />
        <div style={{ height: '5px' }} />
        {rows.map(statRow)}
        <div style={{ height: '5px' }} />
        {rows2.map(statRow)}
        {status.buffs.length > 0 && <div style={{ height: '5px' }} />}
        {status.buffs.map((b) => (
          <div key={b.icon} class="buff-row">
            <Img src="buffs.png" x={(b.icon % 18) * 7} y={Math.floor(b.icon / 18) * 7} w={7} h={7} />
            <Text text={b.name} size={8} />
          </div>
        ))}
      </div>
    </Window>
  );
}

/** WndGame: the in-game menu. */
export function WndGame({ onNewGame, onClose }: { onNewGame: () => void; onClose: () => void }) {
  const WIDTH = 120;
  return (
    <Window width={WIDTH} onClose={onClose}>
      <div class="menu-buttons">
        <RedButton label="Start New Game" width={WIDTH} onClick={onNewGame} />
        <RedButton label="Return to Game" width={WIDTH} onClick={onClose} />
      </div>
    </Window>
  );
}

/** The game-over screen (PD shows the "You died" banner and a WndGame without "Return to Game"). */
export function GameOver({ description, onNewGame }: { description: string; onNewGame: () => void }) {
  return (
    <div class="wnd-blocker game-over">
      <Img src="banners.png" x={0} y={105} w={128} h={35} />
      <Text text={description} size={7} color="#ffffff" maxWidth={120} style={{ marginTop: '8px' }} />
      <div style={{ marginTop: '12px' }}>
        <RedButton label="Start New Game" width={120} onClick={onNewGame} />
      </div>
    </div>
  );
}

export { HealthBar };
