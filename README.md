# Pixel Dungeon 3D

A faithful 3D remake of watabou's [Pixel Dungeon](https://github.com/watabou/pixel-dungeon) 1.9.x: same rules and
content, with the original sprites voxelized into 3D. TypeScript + Three.js + Preact, shipped to iOS/Android via
Capacitor and to the web. GPL-3.0. See [PLAN.md](PLAN.md) for the design and milestones, [CREDITS.md](CREDITS.md) for attribution.

## Setup

```bash
npm install
npm run refs     # clone the original PD sources (pinned) into reference/
npm run assets   # import art/audio into public/assets/, generate src/content/generated/
npm run dev      # http://localhost:5173 (?seed=<anything> skips the menus into a fixed dungeon); voxel gallery at /gallery.html
```

| Command                              | What it does                                 |
| ------------------------------------ | -------------------------------------------- |
| `npm test`                           | Vitest unit tests                            |
| `npm run lint` / `npm run typecheck` | ESLint (enforces engine purity) / TypeScript |
| `npm run build`                      | Production web build into `dist/`            |
| `npm run sim`                        | Headless bot runs (crash/invariant fuzzing)  |
| `npm run ios` / `npm run android`    | Build, sync to Capacitor, open Xcode/Studio  |

### Native builds (Capacitor 7)

- **iOS:** Xcode 16+. `npm run cap:sync`, then build the `App` scheme (Swift Package Manager, no CocoaPods), e.g.
  `xcodebuild -project ios/App/App.xcodeproj -scheme App -sdk iphonesimulator build`.
- **Android:** Android SDK 35+ and **JDK 21** (Capacitor 7 compiles with `--release 21`; JDK 17 fails with
  "invalid source release: 21"). With JDK 21 on `JAVA_HOME`: `cd android && ./gradlew assembleDebug`.

Controls: tap/click to move, attack, pick up or open; drag to rotate the camera, pinch/wheel to zoom.
Keys: arrows/WASD/vi-keys/numpad to step (relative to the camera), space or `.` to wait (shift: rest), `f` search,
`x` examine, `i` inventory, `z` quickslot, `q`/`e` rotate, Esc for windows and the menu.

## Layout

- `src/engine/` pure, deterministic game logic ported from the Java sources (no three/DOM imports; ESLint-enforced).
  It runs synchronously and emits events (`core/events.ts`); `Game.ts` is its API.
- `src/content/` data tables; `generated/` is derived from `reference/` by `npm run assets`
- `src/render/` Three.js: `voxel/` (sprite → voxel mesh), `actors/` (flipbook characters, Noosa MovieClip timing),
  `world/` (terrain from the region tile sheets, water, fog of war, wall cut-away), `camera/`
- `src/app/GameController.ts` input → engine → event playback with PD's animation timings
- `src/ui/` the pixel UI rebuilt from PD's atlases and bitmap fonts at PD's integer zoom: `pixel/` (fonts, nine-patches,
  widgets), `hudParts.tsx` (status pane, toolbar, log), `windows.tsx` (WndBag, WndItem, WndRanking, ...),
  `scenes.tsx` (Title, Start, Rankings, About), `GameUI.tsx` (in-game layer), `App.tsx` (scene switching)
- `src/render/fx/` particles (PD emitters), blob clouds, magic bolts, thrown items, flares, shake
- `src/audio/` original music and sound effects (Web Audio, panned by screen position)
- `src/platform/` IndexedDB saves and app lifecycle (save on pause)
- `src/gallery/` dev page showing every sprite and item voxelized and animated
- `tools/` reference fetcher, asset importer, sprite-definition extractor (parses `*Sprite.java`)
