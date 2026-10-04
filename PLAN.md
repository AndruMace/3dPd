# 3D Pixel Dungeon: Implementation Plan

## Context

The goal is a faithful 3D remake of watabou's **Pixel Dungeon 1.9.x**, with a later path to Shattered PD content. `/Users/andrumace/SDev/3DPD` is empty and not a git repo. The project starts fresh: it does not depend on the Deepwake / PixelDungeonLike code.

Decisions made with the user:

- **Rules:** behaviorally faithful to original PD. It keeps the same content, formulas, drop tables, AI states and level-gen approach, but the code is restructured into clean TypeScript. Shattered PD gets layered on later.
- **Stack:** TypeScript, Three.js, Vite and Preact (DOM UI). Capacitor wraps it for **iOS and Android**, and it also runs on the **web** with touch, mouse and keyboard.
- **Art:** PD's own sprites and tiles are **voxelized** into 3D. Characters use a **flipbook of voxelized frames plus tween polish**. The **pixel UI** stays faithful, built from the original atlases.
- **Camera:** tilted top-down at about 55°. It rotates and zooms.
- **Atmosphere:** dynamic lighting, 3D particles and VFX, and geometry specific to each region.
- **Audio:** the original PD music and SFX, with positional panning.
- **License:** GPL-3.0. Porting code and reusing assets is allowed, and the source will be published.
- **Monetization and online:** none. The game is offline, with local saves, rankings and badges.
- **Milestone 1:** a Sewers vertical slice (depths 1–5 plus Goo, as the Warrior) running on all three platforms.

## Reference source and assets

- Clone `github.com/watabou/pixel-dungeon` (1.9.x) and `github.com/watabou/PD-classes` (the Noosa engine) into `reference/`, which is git-ignored and read-only. The `.java` files are the spec for every port.
- `tools/import-assets.ts` copies the needed PNGs, MP3s and fonts from `reference/pixel-dungeon/assets/` into `public/assets/`, and writes the GPL attribution into `CREDITS.md`.
  - **PNGs:** sprite sheets, `tiles0-4`, `water0-4`, `items`, `chrome`, `toolbar`, `status_pane`, `icons`, `buffs`, `banners`, `badges`, `avatars`, and the bitmap fonts.
- Each `XxxSprite.java` defines frame size, frame indices and fps for idle, run, attack, zap and die. These are transcribed into `src/content/spriteDefs.ts`.

## Architecture

```
src/
  engine/            Pure, deterministic TS. ESLint forbids importing three/preact/DOM.
    core/            Seeded RNG (serializable), Bundle-style save (de)serialization, registries by string id
    actors/          Actor scheduler (time/spend/act, as in Actor.java), Char, Hero, HeroClass/SubClass
    mobs/            Mob base with AI states (SLEEPING/HUNTING/WANDERING/FLEEING/PASSIVE), each mob, bosses, NPCs
    items/           Item base, weapons/armor (enchant/glyph), rings, wands, potions, scrolls, food, bags, keys, Ankh, Dew, Amulet
                     ItemStatusHandler (randomized potion colors/scroll runes/ring gems/wand woods), Generator (drop tables)
    buffs/           All buffs (Hunger, Burning, Poison, Paralysis, Invisibility, Levitation, ...)
    blobs/           Cellular gases/fields: ToxicGas, ParalyticGas, Fire, Web, Regrowth, Foliage, Alchemy, WellWater, ...
    levels/          Terrain flags (PASSABLE, LOS_BLOCKING, FLAMABLE, SECRET, AVOID, PIT...), Level (32x32),
                     RegularLevel + Room graph, painters/ (Standard + all special rooms), per-region levels, boss levels
    mechanics/       ShadowCaster FOV, PathFinder (BFS distance maps), Ballistica
    plants/ traps/ quests/ (Ghost, Wandmaker, Blacksmith, Imp)
    Dungeon.ts       Run state, depth transitions, chasm falls, save/load; Statistics, Badges, Rankings, Journal
    events.ts        Typed event stream the engine emits (moved, attacked, damaged, died, zap, thrown, blobChanged,
                     terrainChanged, itemDropped, flare, floatingText, sound, ...)
  content/           Data tables: mob stats, item stats, drop weights, spriteDefs, region kits, strings
  render/
    voxel/           voxelize(png frame) → greedy-meshed BufferGeometry with vertex colors + baked AO; cache per frame
    world/           LevelMesh (merged static terrain per level), RegionKit x5, Water shader, Chasm, HighGrass (instanced),
                     FogOfWar (32x32 DataTexture: visible / mapped / unknown), wall cut-away near hero
    actors/          CharView (flipbook mesh swap + tweens: hop, lunge, knockback, flash, squash), ItemHeapView
    fx/              GPU-instanced particle system with ports of PD emitters (Flame, Poison, Shadow, Speck, Leaf, Blood,
                     Energy...), MagicMissile bolts, thrown-item arcs, blob visualizers, screen shake, flare
    lighting/        Per-cell light grid (DataTexture) for many cheap colored lights + one hero point light; quality tiers
    camera/          Follow, 90° snap or free rotate, pinch/scroll zoom, raycast tap → cell
  app/               GameController: input → engine.step(command) → event playback queue → autosave
  ui/                Preact overlay using the original atlases (nine-slice chrome, image-rendering: pixelated, integer scale),
                     bitmap-font text component; scenes (Title, HeroSelect, Interlevel, Rankings, Badges, About)
                     and windows (Bag, Item, Hero, InfoMob, Journal, Catalogus, Settings, Quest dialogs, Shop, Ranking)
  audio/             Web Audio: music per region/scene, SFX with PannerNode relative to camera
  platform/          Storage (IndexedDB web / Capacitor Filesystem native), lifecycle (save on pause), haptics
tools/               import-assets, voxel gallery, headless sim bot
```

**Key design points**

- **Engine and view sync.** `engine.step(cmd)` runs actors until the hero needs input, then returns an ordered event list. The view plays those events in "beats". Events in the same beat play in parallel, such as several mobs moving, and attacks and zaps play in sequence. Input is ignored during playback, except to interrupt hero auto-paths, as in PD. This keeps the engine headless and testable.
- **Behaviorally faithful port.** Each Java class is ported against its source, and formulas, numbers and order of operations are kept. The structure is idiomatic TS: classes for anything with behavior (mobs, bosses, items with unique `execute`), and data tables for stats. Registries keyed by string id handle saves and future Shattered content.
- **Voxel characters.** Each opaque pixel becomes voxels. Depth is "inflated" by distance from the silhouette edge, up to about 4 voxels and symmetric front and back, so sprites read as volumetric. The model faces the camera's yaw (y-axis billboard), so the faithful silhouette survives camera rotation. Left and right facing mirrors the model, as PD does. Frames are voxelized lazily at load and cached. If mobile profiling demands it, this moves to a build step.
- **Terrain.**
  - Floors are textured quads that use the tile art with nearest filtering.
  - Walls are blocks. Their faces use wall tiles, and their tops are darker.
  - Decorations are voxel models from their tile art. These cover doors, statues, bookshelves, barricades, pedestals, wells, the alchemy pot, signs and exits.
  - Water has an animated shader built on `waterN.png`.
  - Chasms are real pits.
  - High grass is instanced voxel tufts.
- **Walls between the camera and the hero** shrink or fade (cut-away), so the view stays readable from any rotation.
- **Fog of war** is done in shaders from a per-cell texture, matching PD's three states.
- **Keyboard directions** map relative to the camera yaw.

## Milestones

**M0 – Skeleton and asset pipeline**

- `git init` and set up Vite, TS, ESLint (with the engine-purity rule), Vitest, Prettier and the GPL `LICENSE`.
- Clone the references, run `import-assets`, and write the voxelizer.
- Add a dev-only **voxel gallery** route that shows every sprite and frame voxelized and animated.

**M1 – Tech core**

- A Sewers floor generated with the ported RegularLevel, rooms and StandardPainter.
- 3D terrain, camera controls, tap-to-move with the ported PathFinder, and ShadowCaster FOV with fog.
- The hero's flipbook and one Rat with basic AI.
- Profile on an iOS simulator and a real device. Target 60 fps on a mid-range phone, then set the quality tiers.

**M2 – Sewers vertical slice (first playable)**

- **Hero:** the Warrior with full Hero mechanics: hunger, regen, search and secret doors, levelling, strength and stealth.
- **Combat:** accuracy and defense rolls and damage formulas.
- **Mobs:** Rat, Gnoll Scout, Sewer Crab, Albino Rat, Fetid Rat and Goo. Sheep are spawned by the Wand of Flock.
- **Items:** the full identification system (all potions, scrolls, rings, wands and their unknown appearances), plus the weapons and armor that can appear at depths 1–5.
- **World:** the sewer traps and plants, dew and the dew vial, and the special rooms that can appear at depths 1–4.
- **Content:** the Ghost quest, the Goo boss level, death, the Ankh, the rankings entry and the Interlevel scene.
- **UI and audio:** the core HUD, toolbar, quickslot, bag and item windows, plus audio.
- **Shipping:** save and resume, with Capacitor builds for iOS and Android.

_Status (2026-10-04):_ engine, pixel UI, VFX, audio, IndexedDB save/resume and the Capacitor projects are in; the iOS
simulator build succeeds. Still open for M2: the rankings entry (and a title scene to reach it), Android build
verification (needs JDK 21), on-device profiling and quality tiers, voxel props for doors, and the deferred items
noted in the code (Bones and Badges move to M6; shop/blacksmith painters arrive with their depths).

**M3 – Prison:** Thief, Skeleton, Swarm, Shaman and Tengu, plus Mage and Rogue, the Wandmaker quest, the Tome of Mastery and subclasses, and more blobs and VFX.

**M4 – Caves:** Bat, Brute, Spinner, Cave Shaman variants and DM-300, plus the Huntress, the Blacksmith quest and the Caves region kit.

**M5 – Dwarven City:** Monk, Warlock, Golem, Elemental and King of Dwarves with Undead, plus the Imp quest and the last shop (depth 21).

**M6 – Demon Halls:** Succubus, Evil Eye, Scorpio, Yog-Dzewa with fists and larvae, and Rot Hearts if present in 1.9. Also the Amulet (depth 26), the ending, all badges and the complete rankings.

**M7 – Polish and release:**

- **Settings:** quality tiers and accessibility (text scale, reduced motion).
- **Controls:** a full keybinding set for the web.
- **Release:** a PWA, store builds, and the published GPL source.

**Later – Shattered layer:** a ruleset and content-module switch for SPD classes, talents and items. The registry and ruleset seams are planned in M0–M2, but nothing Shattered-specific gets built before M7.

## Verification

- **Unit tests (Vitest)** cover:
  - FOV and PathFinder against small hand-made maps.
  - Combat, regen, hunger and XP formulas, checked against values worked out from the Java source.
  - The ID system's randomization, which must be stable per seed.
  - Save → load round-trips that compare the full state.
- **Level-gen properties over about 1000 seeds:** every room is connected, the entrance reaches the exit, there are no orphan doors, and special-room and secret counts fall in the ranges PD produces.
- **Headless sim bot (`npm run sim`):** it plays many seeded runs as the Warrior, and reports crashes, invariant violations, death causes and the depth reached.
- **Visual checks:**
  - Run the Vite dev server in the browser pane, at desktop and mobile viewports.
  - The voxel gallery confirms every sprite and frame.
  - Do a side-by-side screenshot review against the original game.
- **Device checks:** build with Capacitor, run in the iOS Simulator and an Android emulator, check touch controls, pinch and rotate, save on background and resume, and frame rate.
- **E2E (Playwright, mobile viewport):** start a run, walk, attack, pick up an item, descend, and save and reload.
