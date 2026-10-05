// The in-game pixel UI (GameScene's uiCamera layer): status pane, toolbar, log, toasts, and the window stack.
// Windows opened by the player live here; requests from the engine (Game.prompt) are drawn on top of them.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GameController, ViewState } from '../app/GameController';
import { ItemSpriteSheet } from '../content/generated/ItemSpriteSheet';
import { Statistics } from '../engine/Dungeon';
import { Game } from '../engine/Game';
import { Inspect, type ExamineView } from '../engine/Inspect';
import type { ItemSelectorMode, Prompt } from '../engine/core/ui';
import type { Bag } from '../engine/items/bags';
import { ActionButtons, Minimap, TargetFrame } from './actionHud';
import { appendLog, GameLog, StatusPane, Toolbar, type LogEntry } from './hudParts';
import type { Prefs } from '../platform/settings';
import { Chrome, Img, ItemIcon, measureText, NinePatch, Text } from './pixel/components';
import { CharPortrait, hex, RedButton } from './pixel/widgets';
import {
  GameOver,
  WndBag,
  WndGame,
  WndHero,
  WndInfo,
  WndItem,
  WndMessage,
  WndOptions,
  WndSettings,
  WndStory,
} from './windows';

type Wnd =
  | { kind: 'bag'; bag: number | null; mode: ItemSelectorMode; purpose: 'inventory' | 'quickslot' }
  | { kind: 'item'; uid: number }
  | { kind: 'info'; view: ExamineView }
  | { kind: 'hero' }
  | { kind: 'menu' }
  | { kind: 'settings' };

/** Ways out of the game scene, provided by the App. */
export interface GameNav {
  newGame: () => void;
  rankings: () => void;
  mainMenu: () => void;
}

const TOOLBAR_HEIGHT = 25;
/** Touch screens get on-screen Attack/Run buttons; mouse and keyboard use click, F and Shift. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export function GameUI({
  game,
  zoom,
  uiW,
  uiH,
  nav,
  prefs,
  onPrefs,
}: {
  game: GameController;
  zoom: number;
  uiW: number;
  uiH: number;
  nav: GameNav;
  prefs: Prefs;
  onPrefs: (p: Partial<Prefs>) => void;
}) {
  const [state, setState] = useState<ViewState>(game.state);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [wnds, setWnds] = useState<Wnd[]>([]);
  const landscape = uiW > uiH;
  const newGame = () => {
    setWnds([]);
    setLog([]);
    nav.newGame();
  };

  const wndsRef = useRef(wnds);
  wndsRef.current = wnds;
  const stateRef = useRef(state);
  stateRef.current = state;
  const metrics = useRef({ zoom, uiW });
  metrics.current = { zoom, uiW };

  const push = (w: Wnd) => setWnds((s) => [...s, w]);
  const pop = () => setWnds((s) => s.slice(0, -1));
  const closeAll = () => setWnds([]);

  useEffect(() => {
    const measureLines = (text: string) => {
      const { zoom: z, uiW: w } = metrics.current;
      const line = measureText('A', 6, z).height;
      return Math.max(1, Math.round(measureText(text, 6, z, w).height / line));
    };
    game.onState = setState;
    game.onLog = (text, kind) => setLog((l) => appendLog(l, text, kind, measureLines));
    game.onExamine = (view) => push(view.kind === 'hero' ? { kind: 'hero' } : { kind: 'info', view });
    game.inputBlocked = () => wndsRef.current.length > 0 || modalPrompt(stateRef.current);
    setState(game.state);
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey) return;
      if (ev.key === 'Escape') {
        if (wndsRef.current.length > 0) pop();
        else if (stateRef.current.prompt && promptCancellable(stateRef.current.prompt)) game.answer(null);
        else if (stateRef.current.examining) game.examine();
        else push({ kind: 'menu' });
      } else if (wndsRef.current.length === 0 && !modalPrompt(stateRef.current)) {
        if (ev.key === 'i') push({ kind: 'bag', bag: null, mode: 'ALL', purpose: 'inventory' });
        else if (ev.key === 'x') game.examine();
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      game.inputBlocked = () => true;
    };
  }, [game]);

  // A new run clears the log and any open windows.
  const runKey = state.dead === null && state.status?.depth;
  useEffect(() => {
    if (state.dead) closeAll();
  }, [state.dead]);
  useEffect(() => {
    if (state.interlevel) closeAll();
  }, [state.interlevel]);

  const status = state.status;
  const cols = landscape ? 6 : 4;

  const windows = wnds.map((w, i) => {
    const key = `w${i}`;
    switch (w.kind) {
      case 'bag': {
        const bag = w.bag === null ? null : (Game.findItem(w.bag) as Bag | null);
        const view = Inspect.bag(bag, w.mode, cols);
        return (
          <WndBag
            key={key}
            title={w.purpose === 'quickslot' ? 'Select an item for the quickslot' : view.title}
            slots={view.slots}
            cols={cols}
            bags={view.bags}
            currentBag={bag?.uid ?? view.bags[0].uid}
            onBag={(uid) =>
              setWnds((s) => s.map((x, j) => (j === i ? { ...w, bag: uid === view.bags[0].uid ? null : uid } : x)))
            }
            onSlot={(slot) => {
              if (slot.uid === null) return;
              if (w.purpose === 'quickslot') {
                game.setQuickslot(slot.uid);
                pop();
              } else push({ kind: 'item', uid: slot.uid });
            }}
            onClose={pop}
          />
        );
      }
      case 'item': {
        const view = Inspect.item(w.uid);
        if (!view) return null;
        return (
          <WndItem
            key={key}
            view={view}
            onClose={pop}
            onAction={(action) => {
              closeAll();
              game.itemAction(w.uid, action);
            }}
          />
        );
      }
      case 'info':
        return <WndInfo key={key} view={w.view} onClose={pop} />;
      case 'hero':
        return status ? (
          <WndHero
            key={key}
            status={status}
            title={`Level ${status.lvl} ${status.heroClass.toLowerCase()}`}
            gold={status.gold}
            deepest={Statistics.deepestFloor}
            onClose={pop}
          />
        ) : null;
      case 'menu':
        return (
          <WndGame
            key={key}
            dead={state.dead !== null}
            onClose={pop}
            onSettings={() => push({ kind: 'settings' })}
            onNewGame={newGame}
            onRankings={nav.rankings}
            onMainMenu={nav.mainMenu}
          />
        );
      case 'settings':
        return <WndSettings key={key} prefs={prefs} onChange={onPrefs} onClose={pop} />;
    }
  });

  const promptView = state.prompt ? renderPrompt(state.prompt, game, cols) : null;

  return (
    <>
      {status && (
        <StatusPane
          status={status}
          hp={status.hp}
          width={uiW}
          onHero={() => push({ kind: 'hero' })}
          onMenu={() => push({ kind: 'menu' })}
          onDanger={() => {}}
        />
      )}
      <GameLog
        key={String(runKey === false ? 'dead' : 'run')}
        entries={log}
        width={state.action && TOUCH ? uiW - 74 : uiW}
        bottom={TOOLBAR_HEIGHT}
      />
      <Toolbar
        width={uiW}
        enabled={state.ready || state.examining}
        quickslot={state.quickslot}
        infoActive={state.examining}
        classicTools={!state.action}
        onWait={() => game.rest(false)}
        onRest={() => game.rest(true)}
        onSearch={() => game.search()}
        onInfo={() => game.examine()}
        onInventory={() => state.ready && push({ kind: 'bag', bag: null, mode: 'ALL', purpose: 'inventory' })}
        onQuickslot={() => game.quickslot()}
        onQuickslotLong={() => state.ready && push({ kind: 'bag', bag: null, mode: 'QUICKSLOT', purpose: 'quickslot' })}
      />
      {state.action && (
        <>
          <Minimap game={game} top={36} />
          {state.target && <TargetFrame target={state.target} />}
          {state.ready && !state.prompt && TOUCH && <ActionButtons game={game} state={state} />}
        </>
      )}
      {state.action && state.interaction && state.ready && !state.prompt && (
        <div class="interact-button" style={{ bottom: `${TOOLBAR_HEIGHT + 42}px` }}>
          <RedButton
            label={state.interaction.kind === 'descend' ? 'Descend' : 'Ascend'}
            width={64}
            height={20}
            onClick={() => game.interact()}
          />
        </div>
      )}
      {state.examining && <Toast text="Select a cell to examine" bottom={60} onClose={() => game.examine()} />}
      {windows}
      {promptView}
      {state.resurrect && (
        <WndOptions
          title="Ankh"
          portrait={<ItemIcon image={ItemSpriteSheet.ANKH} />}
          message="You died, but you were given another chance to win this dungeon. Will you take it?"
          options={['Yes, I will fight!', 'No, I give up']}
          onSelect={(i) => game.resurrect(i === 0)}
        />
      )}
      {state.dead !== null && !state.resurrect && (
        <GameOver description={state.dead} onNewGame={newGame} onRankings={nav.rankings} onMainMenu={nav.mainMenu} />
      )}
      {state.interlevel && <Interlevel text={state.interlevel} />}
      {state.flash && <Flash key={state.flash[1]} color={state.flash[0]} />}
    </>
  );
}

/** A request that must be answered before the world takes taps again (everything but cell selection). */
function modalPrompt(state: ViewState): boolean {
  return (
    (state.prompt !== null && state.prompt.kind !== 'cell') ||
    state.resurrect ||
    state.dead !== null ||
    state.interlevel !== null
  );
}

function promptCancellable(p: Prompt): boolean {
  return p.kind !== 'options' || p.cancellable !== false;
}

function renderPrompt(p: Prompt, game: GameController, cols: number) {
  switch (p.kind) {
    case 'cell':
      return <Toast text={p.prompt} bottom={60} onClose={() => game.answer(null)} />;
    case 'item':
      return <PromptBag key="prompt-bag" prompt={p} game={game} cols={cols} />;
    case 'options':
      return (
        <WndOptions
          title={p.title}
          message={p.message}
          options={p.options}
          portrait={portraitOf(p.sprite, p.itemImage)}
          onSelect={(i) => game.answer(i)}
          onClose={p.cancellable === false ? undefined : () => game.answer(null)}
        />
      );
    case 'message':
      if (p.story) return <WndStory text={p.text} onClose={() => game.answer(null)} />;
      return (
        <WndMessage
          title={p.title}
          portrait={portraitOf(p.sprite, p.itemImage)}
          text={p.text}
          onClose={() => game.answer(null)}
        />
      );
  }
}

function portraitOf(sprite?: string, itemImage?: number) {
  if (sprite) return <CharPortrait sprite={sprite} />;
  if (itemImage !== undefined) return <ItemIcon image={itemImage} />;
  return undefined;
}

/** WndBag opened by GameScene.selectItem: picking an item answers the request. */
function PromptBag({
  prompt,
  game,
  cols,
}: {
  prompt: Extract<Prompt, { kind: 'item' }>;
  game: GameController;
  cols: number;
}) {
  const [bagUid, setBagUid] = useState<number | null>(null);
  const bag = bagUid === null ? null : (Game.findItem(bagUid) as Bag | null);
  const view = useMemo(() => Inspect.bag(bag, prompt.mode, cols), [bag, prompt, cols]);
  return (
    <WndBag
      title={prompt.title}
      slots={view.slots}
      cols={cols}
      bags={view.bags}
      currentBag={bag?.uid ?? view.bags[0].uid}
      onBag={(uid) => setBagUid(uid === view.bags[0].uid ? null : uid)}
      onSlot={(slot) => slot.uid !== null && game.answer(slot.uid)}
      onClose={() => game.answer(null)}
    />
  );
}

/** ui/Toast: a TOAST_TR panel with size-8 text and a close icon. */
function Toast({ text, bottom, onClose }: { text: string; bottom: number; onClose: () => void }) {
  return (
    <div class="toast-wrap" style={{ bottom: `${bottom}px` }}>
      <NinePatch {...Chrome.TOAST_TR} margin={Chrome.TOAST_TR.margin} class="toast">
        <div class="toast-inner">
          <Text text={text} size={8} />
          <Img src="icons.png" x={0} y={45} w={13} h={13} class="toast-close" onClick={onClose} />
        </div>
      </NinePatch>
    </div>
  );
}

/** InterlevelScene: black screen with the transition text. */
function Interlevel({ text }: { text: string }) {
  return (
    <div class="interlevel">
      <Text text={text} size={9} color="#ffffff" />
    </div>
  );
}

/** GameScene.flash: the whole screen lights up and fades. */
function Flash({ color }: { color: number }) {
  return <div class="screen-flash" style={{ background: hex(color) }} />;
}
