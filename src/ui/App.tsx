// The app's scenes (PD's Game.switchScene): Title, Start (hero select), Rankings, About, and the game itself.
// Owns the pixel root (zoom, safe area) shared by all of them, and the windows the menus open.
import { useEffect, useState } from 'preact/hooks';
import { Assets } from '../content/generated/Assets';
import type { GameController } from '../app/GameController';
import { loadRankings } from '../app/rankings';
import { Audio } from '../audio/Audio';
import type { SavedGame } from '../engine/Game';
import type { RankingsTable } from '../engine/Rankings';
import { Settings, type Prefs } from '../platform/settings';
import { Storage } from '../platform/storage';
import { GameUI } from './GameUI';
import { computeZoom, PixelRoot } from './pixel/components';
import { AboutScene, RankingsScene, StartScene, TitleScene, type SaveInfo } from './scenes';
import { WndClass, WndMessage, WndOptions, WndRanking, WndSettings } from './windows';

type Scene = 'title' | 'start' | 'rankings' | 'about' | 'game';

type MenuWnd =
  | { kind: 'settings' }
  | { kind: 'message'; text: string }
  | { kind: 'class'; heroClass: string }
  | { kind: 'ranking'; index: number }
  | { kind: 'options'; title: string; message: string; options: string[]; onSelect: (i: number) => void };

function safeArea(): { width: number; height: number; left: number; top: number } {
  const probe = document.getElementById('safe-area');
  if (!probe) return { width: innerWidth, height: innerHeight, left: 0, top: 0 };
  const r = probe.getBoundingClientRect();
  return { width: r.width, height: r.height, left: r.left, top: r.top };
}

export function App({
  game,
  newSeed,
  startInGame,
}: {
  game: GameController;
  newSeed: () => number | string;
  startInGame: boolean;
}) {
  const [scene, setScene] = useState<Scene>(startInGame ? 'game' : 'title');
  const [area, setArea] = useState(safeArea);
  const [prefs, setPrefs] = useState<Prefs>(Settings.get());
  const [wnd, setWnd] = useState<MenuWnd | null>(null);
  const [save, setSave] = useState<SaveInfo | null>(null);
  const [table, setTable] = useState<RankingsTable | null>(null);

  const dpr = window.devicePixelRatio || 1;
  const zoom = computeZoom(area.width, area.height, dpr, prefs.scaleUp);
  const uiW = Math.floor((area.width * dpr) / zoom);
  const uiH = Math.floor((area.height * dpr) / zoom);

  useEffect(() => {
    const onResize = () => setArea(safeArea());
    addEventListener('resize', onResize);
    // iOS web views apply the safe-area insets after the first layout, without a resize event.
    const probe = document.getElementById('safe-area');
    const observer = probe && 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
    if (probe) observer?.observe(probe);
    const off = Settings.subscribe((p) => {
      setPrefs(p);
      Audio.applySettings();
    });
    return () => {
      removeEventListener('resize', onResize);
      observer?.disconnect();
      off();
    };
  }, []);

  // Each scene's music and whether the 3D view runs.
  useEffect(() => {
    game.setActive(scene === 'game');
    if (scene !== 'game') Audio.music(Assets.THEME);
    if (scene === 'start')
      void Storage.get<SavedGame>('game').then((s) =>
        setSave(s?.info ? { depth: s.info.depth, level: s.info.level, heroClass: s.info.heroClass } : null),
      );
    if (scene === 'rankings') void loadRankings().then(setTable);
    setWnd(null);
  }, [scene]);

  // Back/Escape on menu scenes: close the window, else go back towards the title.
  useEffect(() => {
    if (scene === 'game') return;
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape') return;
      if (wnd) setWnd(null);
      else if (scene !== 'title') setScene('title');
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [scene, wnd]);

  const newGame = () => {
    void Storage.remove('game').then(() => {
      game.start(newSeed());
      setScene('game');
    });
  };
  const loadGame = () => {
    void game.resume().then((ok) => {
      if (ok) setScene('game');
      else setWnd({ kind: 'message', text: 'Unable to load the saved game.' });
    });
  };
  const nav = {
    newGame: () => {
      game.start(newSeed());
    },
    rankings: () => {
      void game.leave().then(() => setScene('rankings'));
    },
    mainMenu: () => {
      void game.leave().then(() => setScene('title'));
    },
  };
  const onPrefs = (p: Partial<Prefs>) => Settings.set(p);

  let content;
  switch (scene) {
    case 'title':
      content = (
        <TitleScene
          w={uiW}
          h={uiH}
          onPlay={() => setScene('start')}
          onRankings={() => setScene('rankings')}
          onBadges={() => setWnd({ kind: 'message', text: 'Badges arrive in a later version of the port.' })}
          onAbout={() => setScene('about')}
          onPrefs={() => setWnd({ kind: 'settings' })}
        />
      );
      break;
    case 'start':
      content = (
        <StartScene
          w={uiW}
          h={uiH}
          save={save}
          onNewGame={newGame}
          onLoad={loadGame}
          onClassInfo={(heroClass) => setWnd({ kind: 'class', heroClass })}
          onBack={() => setScene('title')}
          confirm={(title, message, options, onSelect) =>
            setWnd({ kind: 'options', title, message, options, onSelect })
          }
        />
      );
      break;
    case 'rankings':
      content = table && (
        <RankingsScene
          w={uiW}
          h={uiH}
          table={table}
          onRecord={(index) => setWnd({ kind: 'ranking', index })}
          onBack={() => setScene('title')}
        />
      );
      break;
    case 'about':
      content = <AboutScene w={uiW} onBack={() => setScene('title')} />;
      break;
    case 'game':
      content = <GameUI game={game} zoom={zoom} uiW={uiW} uiH={uiH} nav={nav} prefs={prefs} onPrefs={onPrefs} />;
      break;
  }

  let menuWindow = null;
  if (wnd) {
    const close = () => setWnd(null);
    switch (wnd.kind) {
      case 'settings':
        menuWindow = <WndSettings prefs={prefs} onChange={onPrefs} onClose={close} />;
        break;
      case 'message':
        menuWindow = <WndMessage text={wnd.text} onClose={close} />;
        break;
      case 'class':
        menuWindow = <WndClass heroClass={wnd.heroClass} onClose={close} />;
        break;
      case 'ranking': {
        const rec = table?.records[wnd.index];
        menuWindow = rec ? <WndRanking record={rec} onClose={close} /> : null;
        break;
      }
      case 'options':
        menuWindow = (
          <WndOptions
            title={wnd.title}
            message={wnd.message}
            options={wnd.options}
            onSelect={(i) => {
              close();
              wnd.onSelect(i);
            }}
            onClose={close}
          />
        );
    }
  }

  return (
    <div class="safe-root" style={{ left: `${area.left}px`, top: `${area.top}px` }}>
      <PixelRoot zoom={zoom} width={area.width} height={area.height}>
        {content}
        {menuWindow}
      </PixelRoot>
    </div>
  );
}
