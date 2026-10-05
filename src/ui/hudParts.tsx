// The in-game HUD, ported from ui/StatusPane, ui/Toolbar, ui/GameLog, ui/BuffIndicator and ui/DangerIndicator.
import { useRef } from 'preact/hooks';
import type { StatusView } from '../engine/Inspect';
import { Img, ItemIcon, NinePatch, Chrome, Text } from './pixel/components';
import { HERO_SHEETS, hex } from './pixel/widgets';

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
  classicTools = true,
  onQuickslotDrag,
  onQuickslotDragEnd,
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
  /** Wait and examine: turn-based tools, hidden in action mode (search stays). */
  classicTools?: boolean;
  /** Action mode: drag from the quickslot to aim it (CSS px from the press); a long press still picks the item. */
  onQuickslotDrag?: (dx: number, dy: number) => void;
  onQuickslotDragEnd?: (dx: number, dy: number) => void;
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
      {classicTools && tool(0, 20, 0, onWait, onRest)}
      {tool(20, 20, classicTools ? 20 : 0, onSearch)}
      {classicTools && tool(40, 21, 40, onInfo, undefined, infoActive ? <div class="tool-active" /> : null)}
      {tool(60, 23, width - 22 - 23, onInventory)}
      <Tool
        x={83}
        w={22}
        left={width - 22}
        enabled={enabled}
        onClick={onQuickslot}
        onLong={onQuickslotLong}
        onDrag={onQuickslotDrag}
        onDragEnd={onQuickslotDragEnd}
      >
        {quickslot && (
          <div class="quickslot" style={{ opacity: quickslot.enabled ? 1 : 0.3 }}>
            <ItemIcon image={quickslot.image} style={{ position: 'absolute', left: '2px', top: '4px' }} />
            {quickslot.status && (
              <Text text={quickslot.status} size={6} style={{ position: 'absolute', left: '1px', top: '2px' }} />
            )}
          </div>
        )}
      </Tool>
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
  onDrag,
  onDragEnd,
  children,
}: {
  x: number;
  w: number;
  left: number;
  enabled: boolean;
  onClick: () => void;
  onLong?: () => void;
  /** Dragging away from the tool (CSS px from where the press started), e.g. to aim the quickslot. */
  onDrag?: (dx: number, dy: number) => void;
  onDragEnd?: (dx: number, dy: number) => void;
  children?: preact.ComponentChildren;
}) {
  const press = useRef({ timer: 0, longFired: false, x: 0, y: 0, dragging: false, down: false });
  const DRAG = 14;
  return (
    <div
      class={`tool ${enabled ? '' : 'disabled'}`}
      style={{ left: `${left}px`, width: `${w}px`, height: '25px' }}
      onPointerDown={(e) => {
        const p = press.current;
        p.longFired = false;
        p.dragging = false;
        p.down = true;
        p.x = e.clientX;
        p.y = e.clientY;
        if (onDrag) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        if (onLong)
          p.timer = window.setTimeout(() => {
            p.longFired = true;
            onLong();
          }, 500);
      }}
      onPointerMove={(e) => {
        const p = press.current;
        if (!p.down || !onDrag) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        if (!p.dragging && Math.hypot(dx, dy) > DRAG) {
          p.dragging = true;
          clearTimeout(p.timer);
        }
        if (p.dragging) onDrag(dx, dy);
      }}
      onPointerUp={(e) => {
        const p = press.current;
        clearTimeout(p.timer);
        if (!p.down) return;
        p.down = false;
        if (p.dragging) onDragEnd?.(e.clientX - p.x, e.clientY - p.y);
        else if (!p.longFired) onClick();
      }}
      onPointerCancel={() => {
        const p = press.current;
        clearTimeout(p.timer);
        if (p.dragging) onDragEnd?.(0, 0);
        p.down = p.dragging = false;
      }}
      onPointerLeave={() => {
        if (!press.current.dragging) clearTimeout(press.current.timer);
      }}
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
