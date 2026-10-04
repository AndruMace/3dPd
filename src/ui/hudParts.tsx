// The in-game HUD, ported from ui/StatusPane, ui/Toolbar, ui/GameLog, ui/BuffIndicator and ui/DangerIndicator.
import type { StatusView } from '../engine/Inspect';
import { Img, ItemIcon, NinePatch, Chrome, Text } from './pixel/components';
import { hex } from './pixel/widgets';

const HERO_SHEETS: Record<string, string> = {
  WARRIOR: 'warrior.png',
  MAGE: 'mage.png',
  ROGUE: 'rogue.png',
  HUNTRESS: 'ranger.png',
};

/** StatusPane: avatar, HP and XP bars, level, depth, iron keys, buffs, danger indicator and menu button. */
export function StatusPane({
  status,
  hp,
  width,
  onHero,
  onMenu,
  onDanger,
}: {
  status: StatusView;
  hp: number;
  width: number;
  onHero: () => void;
  onMenu: () => void;
  onDanger: () => void;
}) {
  const health = status.ht > 0 ? Math.max(0, hp) / status.ht : 0;
  const avatarFilter =
    health === 0 ? 'brightness(0.4)' : health < 0.25 ? 'sepia(1) saturate(4) hue-rotate(-30deg)' : undefined;
  return (
    <div class="status-pane" style={{ width: `${width}px` }}>
      {/* NinePatch(STATUS, 80, 0, 48, 0): left 80px, right 48px, the column at x=80 stretched between. */}
      <Img src="status_pane.png" x={0} y={0} w={80} h={64} style={{ position: 'absolute', left: 0, top: 0 }} />
      <StretchColumn left={80} width={width - 128} />
      <Img
        src="status_pane.png"
        x={80}
        y={0}
        w={48}
        h={64}
        style={{ position: 'absolute', left: `${width - 48}px`, top: 0 }}
      />

      <div class="touch" style={{ left: 0, top: '1px', width: '30px', height: '30px' }} onClick={onHero} />
      <Img
        src={HERO_SHEETS[status.heroClass]}
        x={1}
        y={status.tier * 15}
        w={12}
        h={15}
        style={{ position: 'absolute', left: '9px', top: '8px', filter: avatarFilter, pointerEvents: 'none' }}
      />

      <div class="pixel-img hp-bar" style={{ left: '30px', top: '3px', width: `${64 * health}px` }} />
      <div class="pixel-img xp-bar" style={{ left: 0, top: 0, width: `${(width * status.exp) / status.maxExp}px` }} />

      <Text
        text={String(status.lvl)}
        size={6}
        color="#ffeba4"
        style={{ position: 'absolute', left: '27.5px', top: '25px', transform: 'translateX(-50%)' }}
      />
      <Text
        text={String(status.depth)}
        size={6}
        color="#cacfc2"
        style={{ position: 'absolute', right: '42px', top: '6px' }}
      />
      <Text
        text={String(status.keys)}
        size={6}
        color="#cacfc2"
        style={{ position: 'absolute', right: '26px', top: '6px' }}
      />

      <div class="buffs" style={{ left: '32px', top: '11px' }}>
        {status.buffs.map((b) => (
          <Img
            key={b.icon}
            src="buffs.png"
            x={(b.icon % 18) * 7}
            y={Math.floor(b.icon / 18) * 7}
            w={7}
            h={7}
            style={{ marginRight: '2px' }}
          />
        ))}
      </div>

      <div
        class="touch"
        style={{ left: `${width - 16}px`, top: '1px', width: '16px', height: '15px' }}
        onClick={onMenu}
      />

      {status.visibleEnemies > 0 && (
        <NinePatch
          {...Chrome.TAG}
          margin={Chrome.TAG.margin}
          width={24}
          height={16}
          class="tag danger"
          style={{ left: `${width - 24}px`, top: '18px' }}
          onClick={onDanger}
        >
          <Img src="icons.png" x={0} y={0} w={8} h={8} style={{ position: 'absolute', left: '1px', top: '1px' }} />
          <Text
            text={String(status.visibleEnemies)}
            size={6}
            color="#ff4c4c"
            style={{ position: 'absolute', right: '8px', top: '2px' }}
          />
        </NinePatch>
      )}
    </div>
  );
}

/** The status pane's middle is PD's 1-pixel column at x=80 stretched across. */
function StretchColumn({ left, width }: { left: number; width: number }) {
  const w = Math.max(1, width);
  return (
    <div
      class="pixel-img"
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: 0,
        width: `${w}px`,
        height: '64px',
        backgroundImage: `url(${import.meta.env.BASE_URL}assets/img/status_pane.png)`,
        backgroundSize: `${128 * w}px 64px`,
        backgroundPosition: `${-80 * w}px 0`,
      }}
    />
  );
}

export interface QuickslotView {
  image: number;
  status: string | null;
  enabled: boolean;
}

/** Toolbar: wait, search, examine, inventory (with gold) and the quickslot. */
export function Toolbar({
  width,
  enabled,
  quickslot,
  onWait,
  onRest,
  onSearch,
  onInfo,
  onInventory,
  onQuickslot,
  onQuickslotLong,
  infoActive,
}: {
  width: number;
  enabled: boolean;
  quickslot: QuickslotView | null;
  onWait: () => void;
  onRest: () => void;
  onSearch: () => void;
  onInfo: () => void;
  onInventory: () => void;
  onQuickslot: () => void;
  onQuickslotLong: () => void;
  infoActive: boolean;
}) {
  const tool = (
    x: number,
    w: number,
    left: number,
    onClick: () => void,
    onLong?: () => void,
    extra?: preact.ComponentChildren,
  ) => (
    <Tool x={x} w={w} left={left} enabled={enabled} onClick={onClick} onLong={onLong}>
      {extra}
    </Tool>
  );
  return (
    <div class="toolbar" style={{ width: `${width}px` }}>
      {tool(0, 20, 0, onWait, onRest)}
      {tool(20, 20, 20, onSearch)}
      {tool(40, 21, 40, onInfo, undefined, infoActive ? <div class="tool-active" /> : null)}
      {tool(60, 23, width - 22 - 23, onInventory)}
      {tool(
        83,
        22,
        width - 22,
        onQuickslot,
        onQuickslotLong,
        quickslot && (
          <div class="quickslot" style={{ opacity: quickslot.enabled ? 1 : 0.3 }}>
            <ItemIcon image={quickslot.image} style={{ position: 'absolute', left: '2px', top: '4px' }} />
            {quickslot.status && (
              <Text text={quickslot.status} size={6} style={{ position: 'absolute', left: '1px', top: '2px' }} />
            )}
          </div>
        ),
      )}
    </div>
  );
}

function Tool({
  x,
  w,
  left,
  enabled,
  onClick,
  onLong,
  children,
}: {
  x: number;
  w: number;
  left: number;
  enabled: boolean;
  onClick: () => void;
  onLong?: () => void;
  children?: preact.ComponentChildren;
}) {
  let timer = 0;
  let longFired = false;
  return (
    <div
      class={`tool ${enabled ? '' : 'disabled'}`}
      style={{ left: `${left}px`, width: `${w}px`, height: '25px' }}
      onPointerDown={() => {
        longFired = false;
        if (onLong)
          timer = window.setTimeout(() => {
            longFired = true;
            onLong();
          }, 500);
      }}
      onPointerUp={() => {
        clearTimeout(timer);
        if (!longFired) onClick();
      }}
      onPointerLeave={() => clearTimeout(timer)}
    >
      <Img src="toolbar.png" x={x} y={7} w={w} h={25} />
      {children}
    </div>
  );
}

export interface LogEntry {
  text: string;
  color: number;
}

/** GameLog: the last few messages above the toolbar (at most 3 lines in total). */
export function GameLog({ entries, width, bottom }: { entries: LogEntry[]; width: number; bottom: number }) {
  return (
    <div class="game-log" style={{ width: `${width}px`, bottom: `${bottom}px` }}>
      {entries.map((e, i) => (
        <Text key={`${i}-${e.text}`} text={e.text} size={6} color={hex(e.color)} maxWidth={width} />
      ))}
    </div>
  );
}

const PUNCTUATION = /[.,;?! ]$/;
export const LOG_COLORS: Record<string, number> = {
  info: 0xffffff,
  positive: 0x00ff00,
  negative: 0xff0000,
  warning: 0xff8800,
  highlight: 0xffff00,
};

/** GameLog.onSignal: capitalise, add a full stop, and merge into the previous entry when the colour matches. */
export function appendLog(
  entries: LogEntry[],
  text: string,
  kind: string,
  measureLines: (t: string) => number,
): LogEntry[] {
  const color = LOG_COLORS[kind] ?? 0xffffff;
  text = text.charAt(0).toUpperCase() + text.slice(1) + (PUNCTUATION.test(text) ? '' : '.');
  const out = [...entries];
  const last = out[out.length - 1];
  if (last && last.color === color && measureLines(last.text) < 3) {
    out[out.length - 1] = { text: `${last.text} ${text}`, color };
  } else {
    out.push({ text, color });
  }
  let lines = out.reduce((n, e) => n + measureLines(e.text), 0);
  while (lines > 3 && out.length > 1) {
    lines -= measureLines(out[0].text);
    out.shift();
  }
  return out;
}
