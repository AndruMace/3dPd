# Pixel Dungeon 3D

A faithful 3D remake of watabou's [Pixel Dungeon](https://github.com/watabou/pixel-dungeon) 1.9.x: same rules and
content, with the original sprites voxelized into 3D. TypeScript + Three.js + Preact, shipped to iOS/Android via
Capacitor and to the web. GPL-3.0. See [PLAN.md](PLAN.md) for the design and milestones, [CREDITS.md](CREDITS.md) for attribution.

## Setup

```bash
npm install
npm run refs     # clone the original PD sources (pinned) into reference/
npm run assets   # import art/audio into public/assets/, generate src/content/generated/
npm run dev      # http://localhost:5173 (?seed=<anything> for a fixed dungeon); voxel gallery at /gallery.html
```

| Command                              | What it does                                 |
| ------------------------------------ | -------------------------------------------- |
| `npm test`                           | Vitest unit tests                            |
| `npm run lint` / `npm run typecheck` | ESLint (enforces engine purity) / TypeScript |
| `npm run build`                      | Production web build into `dist/`            |

## Layout

- `src/engine/` pure, deterministic game logic ported from the Java sources (no three/DOM imports; ESLint-enforced).
  It runs synchronously and emits events (`core/events.ts`); `Game.ts` is its API.
- `src/content/` data tables; `generated/` is derived from `reference/` by `npm run assets`
- `src/render/` Three.js: `voxel/` (sprite → voxel mesh), `actors/` (flipbook characters, Noosa MovieClip timing),
  `world/` (terrain from the region tile sheets, water, fog of war, wall cut-away), `camera/`
- `src/app/GameController.ts` input → engine → event playback with PD's animation timings
- `src/ui/` HUD (placeholder until the pixel UI in M2) and floating combat text
- `src/gallery/` dev page showing every sprite and item voxelized and animated
- `tools/` reference fetcher, asset importer, sprite-definition extractor (parses `*Sprite.java`)
