// The menu scenes: ports of TitleScene, StartScene, RankingsScene and AboutScene, laid out in UI pixels with
// PD's own constants, over the scrolling Archs background.
import { useEffect, useRef, useState } from 'preact/hooks';
import { ItemSpriteSheet } from '../content/generated/ItemSpriteSheet';
import type { RankingsTable } from '../engine/Rankings';
import { Img, ItemIcon, Text, useZoom } from './pixel/components';
import { RedButton, TITLE_COLOR } from './pixel/widgets';

export const VERSION = '0.2 (PD 1.9.x)';

/** ui/Archs: the two layers of arches scrolling upwards behind every menu. */
export function Archs() {
  return (
    <div class="archs">
      <div class="archs-layer archs-bg" />
      <div class="archs-layer archs-fg" />
    </div>
  );
}

/** ui/ExitButton (icons EXIT) in the top-right corner. */
function ExitButton({ onClick }: { onClick: () => void }) {
  return (
    <Img
      src="icons.png"
      x={98}
      y={0}
      w={16}
      h={16}
      class="scene-button"
      style={{ position: 'absolute', right: '1px', top: '1px' }}
      onClick={onClick}
    />
  );
}

/**
 * effects/Fireball: the title's torches. Additive, rotating light sprites with rising flames and the occasional
 * spark, drawn on a canvas at the UI's zoom.
 */
function Fireball({ x, y }: { x: number; y: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const zoom = useZoom();
  useEffect(() => {
    const canvas = ref.current!;
    const S = 64;
    canvas.width = S * zoom;
    canvas.height = S * zoom;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.src = `${import.meta.env.BASE_URL}assets/img/fireball.png`;
    const flames: { y: number; vy: number; t: number; frame: number; x: number }[] = [];
    const sparks: { x: number; y: number; vx: number; vy: number; t: number; life: number; c: string }[] = [];
    let angleB = 0;
    let angleF = 0;
    let acc = 0;
    let last = performance.now();
    let raf = 0;
    const drawFrame = (fx: number, cx: number, cy: number, angle: number, alpha: number, scale = 1) => {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(cx * zoom, cy * zoom);
      ctx.rotate(angle);
      ctx.scale(scale, scale);
      ctx.drawImage(img, fx * 32, 0, 32, 32, -16 * zoom, -16 * zoom, 32 * zoom, 32 * zoom);
      ctx.restore();
    };
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      angleB -= (Math.PI / 2) * dt;
      angleF += Math.PI * 2 * dt;
      acc += dt;
      while (acc > 0.1) {
        acc -= 0.1;
        flames.push({
          x: (Math.random() - 0.5) * 16,
          y: (Math.random() - 0.5) * 16,
          vy: -40,
          t: 1,
          frame: Math.random() < 0.5 ? 2 : 3,
        });
      }
      if (Math.random() < dt) {
        const hue = Math.random() < 0.5 ? '#ff66ff' : '#66ff66';
        sparks.push({
          x: 0,
          y: 0,
          vx: (Math.random() - 0.5) * 80,
          vy: -60 + Math.random() * 80,
          t: 0,
          life: 0.5 + Math.random() * 0.5,
          c: hue,
        });
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (img.complete) {
        ctx.globalCompositeOperation = 'lighter';
        drawFrame(0, S / 2, S / 2, angleB, 1);
        for (const f of flames) {
          f.t -= dt;
          f.vy -= 20 * dt;
          f.y += f.vy * dt;
          drawFrame(f.frame, S / 2 + f.x, S / 2 + f.y, 0, Math.max(0, f.t), Math.max(0, f.t));
        }
        drawFrame(1, S / 2, S / 2, angleF, 1);
        for (const s of sparks) {
          s.t += dt;
          s.vy += 80 * dt;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          const k = 1 - s.t / s.life;
          ctx.fillStyle = s.c;
          ctx.globalAlpha = Math.max(0, k);
          ctx.fillRect((S / 2 + s.x) * zoom, (S / 2 + s.y) * zoom, 2 * k * zoom, 2 * k * zoom);
        }
        ctx.globalAlpha = 1;
      }
      for (let i = flames.length - 1; i >= 0; i--) if (flames[i].t <= 0) flames.splice(i, 1);
      for (let i = sparks.length - 1; i >= 0; i--) if (sparks[i].t >= sparks[i].life) sparks.splice(i, 1);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [zoom]);
  return (
    <canvas
      ref={ref}
      class="fireball"
      style={{ left: `${x - 32}px`, top: `${y - 32}px`, width: '64px', height: '64px' }}
    />
  );
}

/** TitleScene.DashboardItem: a 32x32 dashboard icon with a size-9 label, in a 48x48 button. */
function DashboardItem({
  label,
  index,
  x,
  y,
  onClick,
}: {
  label: string;
  index: number;
  x: number;
  y: number;
  onClick: () => void;
}) {
  return (
    <div class="dashboard-item" style={{ left: `${x}px`, top: `${y}px` }} onClick={onClick}>
      <Img src="dashboard.png" x={index * 32} y={0} w={32} h={32} />
      <Text text={label} size={9} style={{ marginTop: '2px' }} />
    </div>
  );
}

export function TitleScene({
  w,
  h,
  onPlay,
  onRankings,
  onBadges,
  onAbout,
  onPrefs,
}: {
  w: number;
  h: number;
  onPlay: () => void;
  onRankings: () => void;
  onBadges: () => void;
  onAbout: () => void;
  onPrefs: () => void;
}) {
  const landscape = w > h;
  const SIZE = 48;
  const height = 70 + (landscape ? SIZE : SIZE * 2);
  const tx = Math.floor((w - 128) / 2);
  const ty = Math.floor((h - height) / 2);
  let items: [string, number, number, number, () => void][];
  if (landscape) {
    const y = (h + height) / 2 - SIZE;
    items = [
      ['Play', 0, w / 2 - SIZE * 2, y, onPlay],
      ['Rankings', 2, w / 2 - SIZE, y, onRankings],
      ['Badges', 3, w / 2, y, onBadges],
      ['About', 1, w / 2 + SIZE, y, onAbout],
    ];
  } else {
    const y2 = (h + height) / 2 - SIZE;
    items = [
      ['Badges', 3, w / 2 - SIZE, y2, onBadges],
      ['About', 1, w / 2, y2, onAbout],
      ['Play', 0, w / 2 - SIZE, y2 - SIZE, onPlay],
      ['Rankings', 2, w / 2, y2 - SIZE, onRankings],
    ];
  }
  return (
    <div class="scene">
      <Archs />
      <Img
        src="banners.png"
        x={0}
        y={0}
        w={128}
        h={70}
        style={{ position: 'absolute', left: `${tx}px`, top: `${ty}px` }}
      />
      <Fireball x={tx + 18} y={ty + 20} />
      <Fireball x={tx + 128 - 18} y={ty + 20} />
      <Img
        src="banners.png"
        x={0}
        y={161}
        w={128}
        h={57}
        class="title-signs"
        style={{ position: 'absolute', left: `${tx}px`, top: `${ty}px` }}
      />
      {items.map(([label, index, x, y, fn]) => (
        <DashboardItem key={label} label={label} index={index} x={Math.floor(x)} y={Math.floor(y)} onClick={fn} />
      ))}
      <Text text={`v ${VERSION}`} size={6} color="#888888" style={{ position: 'absolute', right: 0, bottom: 0 }} />
      <Img
        src="icons.png"
        x={30}
        y={0}
        w={16}
        h={16}
        class="scene-button"
        style={{ position: 'absolute', left: '1px', top: '1px' }}
        onClick={onPrefs}
      />
    </div>
  );
}

const CLASSES = ['WARRIOR', 'MAGE', 'ROGUE', 'HUNTRESS'];
/** Classes playable in this build; the rest arrive with their milestones. */
const AVAILABLE = new Set(['WARRIOR']);

export interface SaveInfo {
  depth: number;
  level: number;
  heroClass: string;
}

export function StartScene({
  w,
  h,
  save,
  onNewGame,
  onLoad,
  onClassInfo,
  onBack,
  confirm,
}: {
  w: number;
  h: number;
  save: SaveInfo | null;
  onNewGame: (heroClass: string) => void;
  onLoad: () => void;
  onClassInfo: (heroClass: string) => void;
  onBack: () => void;
  confirm: (title: string, message: string, options: string[], onSelect: (i: number) => void) => void;
}) {
  const [cur, setCur] = useState('WARRIOR');
  const landscape = w > h;
  const width = landscape ? 224 : 116;
  const height = landscape ? 124 : 220;
  const left = Math.floor((w - width) / 2);
  const top = Math.floor((h - height) / 2);
  const bottom = h - top;
  const BUTTON_HEIGHT = 24;
  const GAP = 2;
  const titleY = top;
  const titleH = 21;
  const buttonY = bottom - BUTTON_HEIGHT;
  const centralHeight = buttonY - titleY - titleH;
  const shields = CLASSES.map((cl, i) => {
    if (landscape) {
      const sw = width / 4;
      const sh = Math.min(centralHeight, sw);
      return { cl, x: left + i * sw, y: titleY + titleH + (centralHeight - sh) / 2, w: sw, h: sh };
    }
    const sw = width / 2;
    const sh = Math.min(centralHeight / 2, sw * 1.2);
    const t = titleY + titleH + centralHeight / 2 - sh;
    return { cl, x: left + (i % 2) * sw, y: t + Math.floor(i / 2) * sh, w: sw, h: sh };
  });
  const hasSave = save !== null && save.heroClass === cur;
  const available = AVAILABLE.has(cur);
  const startNew = () => {
    if (hasSave)
      confirm(
        'Do you really want to start new game?',
        'Your current game progress will be erased.',
        ['Yes, start new game', 'No, return to main menu'],
        (i) => {
          if (i === 0) onNewGame(cur);
          else onBack();
        },
      );
    else onNewGame(cur);
  };
  const bw = (w - GAP) / 2 - left;
  return (
    <div class="scene">
      <Archs />
      <Img
        src="banners.png"
        x={0}
        y={140}
        w={128}
        h={21}
        style={{ position: 'absolute', left: `${Math.floor((w - 128) / 2)}px`, top: `${titleY}px` }}
      />
      {shields.map((s) => {
        const selected = s.cl === cur;
        const index = CLASSES.indexOf(s.cl);
        return (
          <div
            key={s.cl}
            class="class-shield"
            style={{ left: `${s.x}px`, top: `${s.y}px`, width: `${s.w}px`, height: `${s.h}px` }}
            onClick={() => (selected ? onClassInfo(s.cl) : setCur(s.cl))}
          >
            <Img
              src="avatars.png"
              x={index * 24}
              y={0}
              w={24}
              h={28}
              style={{ transform: 'scale(2)', margin: '14px 0 16px', filter: `brightness(${selected ? 1 : 0.6})` }}
            />
            <Text text={s.cl} size={9} color={selected ? '#cacfc2' : '#444444'} />
          </div>
        );
      })}
      {available ? (
        hasSave ? (
          <>
            <GameButton
              x={left}
              y={buttonY}
              w={bw}
              label="Load Game"
              secondary={`Depth: ${save.depth}, level: ${save.level}`}
              onClick={onLoad}
            />
            <GameButton
              x={left + bw + GAP}
              y={buttonY}
              w={bw}
              label="New Game"
              secondary="Erase current game"
              onClick={startNew}
            />
          </>
        ) : (
          <GameButton x={left} y={buttonY} w={w - left * 2} label="New Game" onClick={startNew} />
        )
      ) : (
        <div
          class="unlock-text"
          style={{ left: `${left}px`, top: `${buttonY}px`, width: `${width}px`, height: `${BUTTON_HEIGHT}px` }}
        >
          <Text text="This class arrives in a later version of the port." size={9} color="#ffff00" maxWidth={width} />
        </div>
      )}
      <ExitButton onClick={onBack} />
    </div>
  );
}

/** StartScene.GameButton: a RedButton with an optional second, smaller line. */
function GameButton({
  x,
  y,
  w,
  label,
  secondary,
  onClick,
}: {
  x: number;
  y: number;
  w: number;
  label: string;
  secondary?: string;
  onClick: () => void;
}) {
  return (
    <div class={`game-button ${secondary ? 'with-secondary' : ''}`} style={{ left: `${x}px`, top: `${y}px` }}>
      <RedButton label={label} width={w} height={24} onClick={onClick} />
      {secondary && <Text text={secondary} size={6} color="#cacfc2" class="game-button-secondary" />}
    </div>
  );
}

const CLASS_ICON_X: Record<string, number> = { WARRIOR: 0, MAGE: 16, ROGUE: 32, HUNTRESS: 48 };

export function RankingsScene({
  w,
  h,
  table,
  onRecord,
  onBack,
}: {
  w: number;
  h: number;
  table: RankingsTable;
  onRecord: (index: number) => void;
  onBack: () => void;
}) {
  const landscape = w > h;
  const rowHeight = landscape ? 22 : 28;
  const GAP = 4;
  const left = Math.floor((w - Math.min(180, w)) / 2) + GAP;
  const n = table.records.length;
  const top = Math.floor((h - rowHeight * n) / 2);
  return (
    <div class="scene">
      <Archs />
      {n > 0 ? (
        <>
          <div class="center-text" style={{ top: `${top - 9 - GAP}px` }}>
            <Text text="Top Rankings" size={9} color={TITLE_COLOR} />
          </div>
          {table.records.map((rec, i) => {
            const color = rec.win ? '#ffff88' : '#cccccc';
            return (
              <div
                key={rec.time}
                class="ranking-row"
                style={{
                  left: `${left}px`,
                  top: `${top + i * rowHeight}px`,
                  width: `${w - left * 2}px`,
                  height: `${rowHeight}px`,
                }}
                onClick={() => onRecord(i)}
              >
                <div class="ranking-shield">
                  {i === table.lastRecord && <div class={`ranking-flare ${rec.win ? 'win' : ''}`} />}
                  <ItemIcon image={rec.win ? ItemSpriteSheet.AMULET : ItemSpriteSheet.TOMB} />
                  <Text text={String(i + 1)} size={6} color={color} class="ranking-pos" />
                </div>
                <Text
                  text={rec.info}
                  size={9}
                  color={color}
                  maxWidth={w - left * 2 - 16 - GAP - 16}
                  class="ranking-desc"
                />
                <Img src="icons.png" x={CLASS_ICON_X[rec.heroClass] ?? 0} y={29} w={16} h={16} class="ranking-class" />
              </div>
            );
          })}
          {table.totalNumber >= 6 && (
            <div class="center-text games-played" style={{ top: `${top + n * rowHeight + GAP}px` }}>
              <Text text="Games played: " size={8} color="#cccccc" />
              <Text text={String(table.wonNumber)} size={8} color={TITLE_COLOR} />
              <Text text={`/${table.totalNumber}`} size={8} color="#cccccc" />
            </div>
          )}
        </>
      ) : (
        <div class="center-text" style={{ top: `${Math.floor(h / 2) - 4}px` }}>
          <Text text="No games have been played yet." size={8} color="#cccccc" />
        </div>
      )}
      <ExitButton onClick={onBack} />
    </div>
  );
}

const ABOUT =
  "Code & graphics: Watabou\nMusic: Cube_Code\n\nThis game is inspired by Brian Walker's Brogue. Try it on Windows, Mac OS or Linux - it's awesome! ;)\n\nPlease visit official website for additional info:";

export function AboutScene({ w, onBack }: { w: number; onBack: () => void }) {
  const maxWidth = Math.min(w, 120);
  return (
    <div class="scene about">
      <Archs />
      <div class="about-content">
        <Img src="icons.png" x={30} y={16} w={15} h={10} style={{ marginBottom: '8px' }} />
        <Text text={ABOUT} size={8} maxWidth={maxWidth} />
        <a href="https://pixeldungeon.watabou.ru" target="_blank" rel="noreferrer" class="about-link">
          <Text text="pixeldungeon.watabou.ru" size={8} color={TITLE_COLOR} />
        </a>
        <div style={{ height: '8px' }} />
        <Text
          text={`3D port v ${VERSION}, GPL-3.0. Original sources and assets by Watabou, used under the GPL.`}
          size={6}
          color="#888888"
          maxWidth={maxWidth}
        />
      </div>
      <ExitButton onClick={onBack} />
    </div>
  );
}
