// Ports of PD's basic UI widgets: Window (chrome + shadow + centred), RedButton, IconTitle, HealthBar.
import type { ComponentChildren } from 'preact';
import { Chrome, Img, ItemIcon, NinePatch, Text, useZoom } from './components';
import { SPRITES } from '../../content/sprites';

export const TITLE_COLOR = '#ffff44';

export function hex(color: number | null | undefined, fallback = '#ffffff'): string {
  return color === null || color === undefined ? fallback : `#${color.toString(16).padStart(6, '0')}`;
}

/** Window: chrome nine-patch around a content box of `width` UI pixels, centred, with a dimming blocker. */
export function Window({
  width,
  children,
  onClose,
  chrome = Chrome.WINDOW,
  below,
}: {
  width: number;
  children: ComponentChildren;
  onClose?: () => void;
  chrome?: typeof Chrome.WINDOW;
  /** Rendered under the window (WndTabbed's tabs). */
  below?: ComponentChildren;
}) {
  const [l, t, r, b] = chrome.margin;
  return (
    <div
      class="wnd-blocker"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div class="wnd-stack">
        <NinePatch {...chrome} margin={chrome.margin} style={{ padding: 0 }} class="wnd">
          <div class="wnd-content" style={{ width: `${width}px`, margin: `${0}px` }}>
            {children}
          </div>
        </NinePatch>
        {below && (
          <div
            class="wnd-below"
            style={{ marginLeft: `${l}px`, marginTop: `${-b}px`, paddingTop: `${t - t}px`, marginRight: `${r}px` }}
          >
            {below}
          </div>
        )}
      </div>
    </div>
  );
}

/** RedButton: a BUTTON chrome with centred size-9 text. */
export function RedButton({
  label,
  onClick,
  width,
  height = 20,
  color,
  enabled = true,
  icon,
}: {
  label: string;
  onClick: () => void;
  width?: number;
  height?: number;
  color?: string;
  enabled?: boolean;
  icon?: ComponentChildren;
}) {
  return (
    <NinePatch
      {...Chrome.BUTTON}
      margin={Chrome.BUTTON.margin}
      width={width}
      height={height}
      class={`red-button ${enabled ? '' : 'disabled'}`}
      onClick={(e) => {
        e.stopPropagation();
        if (enabled) onClick();
      }}
    >
      <div class="red-button-inner">
        {icon}
        <Text text={label} size={9} color={color ?? '#ffffff'} style={{ opacity: enabled ? 1 : 0.3 }} />
      </div>
    </NinePatch>
  );
}

/** A character portrait: frame 0 of its sprite sheet (the idle pose), as WndQuest/WndInfoMob show. */
export function CharPortrait({ sprite }: { sprite: string }) {
  const def = SPRITES[sprite];
  if (!def) return null;
  return <Img src={def.texture} x={0} y={0} w={def.frameWidth} h={def.frameHeight} />;
}

/** IconTitle: icon, yellow multi-line label, optional health bar. */
export function IconTitle({
  icon,
  label,
  color = TITLE_COLOR,
  health,
  width,
}: {
  icon: ComponentChildren;
  label: string;
  color?: string;
  health?: number | null;
  width: number;
}) {
  return (
    <div class="icon-title" style={{ width: `${width}px` }}>
      <div class="icon-title-icon">{icon}</div>
      <div class="icon-title-label">
        <Text text={label} size={9} color={color} maxWidth={width - 20} />
        {health !== null && health !== undefined && <HealthBar level={health} />}
      </div>
    </div>
  );
}

/** ui/HealthBar: 2px bar, red background, green fill. */
export function HealthBar({ level, width }: { level: number; width?: number }) {
  return (
    <div class="health-bar" style={{ width: width ? `${width}px` : '100%' }}>
      <div style={{ width: `${Math.max(0, Math.min(1, level)) * 100}%` }} />
    </div>
  );
}

export function ItemIconGlow({ image, glow }: { image: number; glow?: number | null }) {
  return (
    <div
      class="item-icon"
      style={glow !== null && glow !== undefined ? { filter: `drop-shadow(0 0 1px ${hex(glow)})` } : undefined}
    >
      <ItemIcon image={image} />
    </div>
  );
}

export function useUiWidth(): number {
  const zoom = useZoom();
  return (window.innerWidth * (window.devicePixelRatio || 1)) / zoom;
}
