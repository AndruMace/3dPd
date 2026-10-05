// Action mode's extra HUD: the Attack button and Run toggle (touch), the target frame, and a minimap that fills in
// as the hero explores (PD's own visited/mapped cells), north up, with the camera's view cone.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { GameController, MinimapView, ViewState } from '../app/GameController';
import { Dungeon } from '../engine/Dungeon';
import { ActionGame } from '../engine/realtime/ActionGame';
import { flags, Terrain as T } from '../engine/levels/Terrain';
import { HEIGHT, WIDTH } from '../engine/levels/constants';
import { Chrome, ItemIcon, NinePatch, Text, useZoom } from './pixel/components';
import { HealthBar, RedButton, TITLE_COLOR } from './pixel/widgets';

const TOOLBAR_HEIGHT = 25;

/** The touch buttons: hold Attack to fight; Run toggles sprinting (Shift on a keyboard). */
export function ActionButtons({ game, state }: { game: GameController; state: ViewState }) {
  const weapon = Dungeon.hero?.belongings.weapon;
  const release = () => game.setAttackButton(false);
  return (
    <>
      <div
        class="action-button attack-button"
        style={{ right: '3px', bottom: `${TOOLBAR_HEIGHT + 4}px` }}
        onPointerDown={(e) => {
          e.stopPropagation();
          game.setAttackButton(true);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
      >
        <NinePatch {...Chrome.BUTTON} margin={Chrome.BUTTON.margin} width={34} height={34}>
          <div class="action-button-inner">
            <ItemIcon image={weapon ? weapon.imageIndex() : 0} />
          </div>
          <Cooldown />
        </NinePatch>
      </div>
      <div class="action-button" style={{ right: '40px', bottom: `${TOOLBAR_HEIGHT + 6}px` }}>
        <RedButton
          label="Run"
          width={28}
          height={18}
          color={state.sprintToggle ? TITLE_COLOR : undefined}
          onClick={() => game.toggleSprint()}
        />
      </div>
    </>
  );
}

/** A shade over the Attack button that drains away as the next swing gets ready. */
function Cooldown() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      if (ref.current) ref.current.style.height = `${(1 - ActionGame.attackReadiness) * 100}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <div ref={ref} class="attack-cooldown" />;
}

/** Name and health of the enemy being fought. */
export function TargetFrame({ target }: { target: NonNullable<ViewState['target']> }) {
  const name = target.name.charAt(0).toUpperCase() + target.name.slice(1);
  return (
    <div class="target-frame">
      <Text text={name} size={6} color="#ffffff" />
      <div style={{ width: '60px', marginTop: '1px' }}>
        <HealthBar level={target.ht > 0 ? target.hp / target.ht : 0} />
      </div>
    </div>
  );
}

const PX = 4; // canvas pixels per cell

function cellColor(t: number, visited: boolean): string | null {
  const f = flags[t];
  if (t === T.EXIT || t === T.LOCKED_EXIT || t === T.UNLOCKED_EXIT) return '#ffd24a';
  if (t === T.ENTRANCE) return '#6fd0ff';
  if (t === T.DOOR || t === T.OPEN_DOOR || t === T.LOCKED_DOOR) return '#c07a2c';
  if (f & T.PIT) return '#151515';
  if (f & T.LIQUID) return visited ? '#3d6e9e' : '#2c5070';
  if (!(f & T.PASSABLE)) return f & T.LOS_BLOCKING ? '#34312b' : '#4a463e';
  if (f & T.AVOID) return '#c04848'; // a revealed trap
  return visited ? '#a59c8a' : '#6f685b';
}

function draw(canvas: HTMLCanvasElement, v: MinimapView): void {
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const c = x + y * WIDTH;
      const known = v.visited[c] || v.mapped[c];
      if (!known) continue;
      const color = cellColor(v.map[c], !!v.visited[c]);
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * PX, y * PX, PX, PX);
    }
  }
  // What the hero can see right now is lit a little.
  ctx.fillStyle = 'rgba(255,240,200,0.12)';
  for (let c = 0; c < WIDTH * HEIGHT; c++)
    if (v.visible[c]) ctx.fillRect((c % WIDTH) * PX, Math.floor(c / WIDTH) * PX, PX, PX);
  ctx.fillStyle = '#7fe0e0';
  for (const h of v.heaps) ctx.fillRect((h % WIDTH) * PX + 1, Math.floor(h / WIDTH) * PX + 1, PX - 2, PX - 2);
  ctx.fillStyle = '#ff4040';
  for (const m of v.mobs) ctx.fillRect(m.x * PX - 1.5, m.z * PX - 1.5, 3, 3);

  // The camera's view cone, then the hero and the way they face.
  const hx = v.hero.x * PX;
  const hz = v.hero.z * PX;
  const fx = Math.sin(v.yaw);
  const fz = -Math.cos(v.yaw);
  const spread = 0.6;
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(hx, hz);
  for (const s of [-spread, spread]) {
    const a = Math.atan2(fz, fx) + s;
    ctx.lineTo(hx + Math.cos(a) * 22, hz + Math.sin(a) * 22);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(hx - 2, hz - 2, 4, 4);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(hx, hz);
  ctx.lineTo(hx + Math.cos(v.hero.facing) * 5, hz + Math.sin(v.hero.facing) * 5);
  ctx.stroke();
}

/** The minimap: small in the corner, tap for a big one. */
export function Minimap({ game, top }: { game: GameController; top: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [big, setBig] = useState(false);
  const zoom = useZoom();
  useEffect(() => {
    const canvas = ref.current!;
    canvas.width = WIDTH * PX;
    canvas.height = HEIGHT * PX;
    const update = () => {
      const v = game.minimap();
      if (v) draw(canvas, v);
    };
    update();
    const id = window.setInterval(update, 150);
    return () => clearInterval(id);
  }, [game]);
  const size = big ? 160 : 56;
  return (
    <div
      class={`minimap ${big ? 'big' : ''}`}
      style={
        big
          ? { width: `${size}px`, height: `${size}px` }
          : { right: '2px', top: `${top}px`, width: `${size}px`, height: `${size}px` }
      }
      onClick={() => setBig((b) => !b)}
      data-zoom={zoom}
    >
      <canvas ref={ref} class="minimap-canvas" />
    </div>
  );
}
