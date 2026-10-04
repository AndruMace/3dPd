// Minimal M1 HUD. The faithful pixel-art UI built from PD's own atlases replaces this in M2.
import type { GameController, HudState } from '../app/GameController';

const LOG_COLORS: Record<string, string> = {
  info: '#ffffff',
  positive: '#44ff44',
  negative: '#ff4444',
  warning: '#ff8800',
  highlight: '#ffff44',
};

export function Hud({ state, game, onRestart }: { state: HudState; game: GameController; onRestart: () => void }) {
  const hpFrac = state.ht > 0 ? Math.max(0, state.hp) / state.ht : 0;
  return (
    <div class="hud">
      <div class="status">
        <div class="hp-bar">
          <div class="hp-fill" style={{ width: `${hpFrac * 100}%` }} />
          <span class="hp-text">
            {Math.max(0, state.hp)}/{state.ht}
          </span>
        </div>
        <div class="badges">
          <span>Depth {state.depth}</span>
          <span>Lv {state.lvl}</span>
        </div>
      </div>

      <div class="log">
        {state.log.map((l, i) => (
          <div key={i} style={{ color: LOG_COLORS[l.kind] ?? '#fff' }}>
            {l.text}
          </div>
        ))}
      </div>

      <div class="toolbar">
        <button title="Rotate left (Q)" onClick={() => game.rotate(-1)}>
          ⟲
        </button>
        <button title="Wait a turn (Space)" disabled={!state.ready} onClick={() => game.rest()}>
          ⧗
        </button>
        <button title="Rotate right (E)" onClick={() => game.rotate(1)}>
          ⟳
        </button>
      </div>

      <div class={`fade ${state.fading ? 'on' : ''}`} />

      {state.dead && (
        <div class="death">
          <div>You died on depth {state.depth}.</div>
          <button onClick={onRestart}>Start a new game</button>
        </div>
      )}
    </div>
  );
}
