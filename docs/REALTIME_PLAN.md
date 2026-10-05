# Experiment: real-time action RPG mode

Branch: `realtime-arpg` (from `main` at `43317de`). If the experiment isn't fun, delete the branch and nothing on
`main` changes. If it is, it merges back as a selectable **game mode**, so both versions can ship.

## What changes

PD's turn-based, tile-by-tile play becomes a real-time action RPG:

- **Movement:** free, continuous movement through the dungeon, steered with a joystick or WASD.
- **Combat:** Diablo-style. You attack the targeted enemy, aim is assisted, weapon speed sets the cooldown, and
  enemies telegraph their attacks.
- **Camera:** a close third-person chase cam behind and above the hero.
- **Controls:** touch, and keyboard plus mouse, are both first-class.
- **Rules:** PD is the base and can be rebalanced freely. Content, items, the ID system, generation, drop tables,
  buffs and blobs stay. Formulas change wherever that makes the action feel better.
- **Layouts:** bigger and roomier, so fights have space to kite and to be surrounded.
- **Pausing:** windows (inventory, item info, menus, NPC dialogs) pause the action. Quickslots work live.
- **Aiming:** thrown items and wands auto-aim at the target. You can drag (touch) or use the cursor (mouse) to aim
  by hand.
- **First slice to judge the fun:** the full Sewers, depths 1–5 plus Goo, as the Warrior.

## Approach: a second mode beside the turn-based one

The engine splits into three layers. One is shared, one is turn-based and one is new:

| Layer                | Turn-based (today)                                                                                     | Real-time (new)                                                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Content** (shared) | Items, ID system, Generator, Bestiary, mob stats, buffs, blobs, plants, traps, level generation, saves | Same code, reused                                                                                                           |
| **Time**             | `Actor` scheduler, one PD turn at a time                                                               | A **world clock** at a fixed 30 Hz step: `dt` advances PD time by `dt / TURN`                                               |
| **Space**            | `Char.pos` is a cell index; moves happen one cell at a time                                            | A `Body` with a continuous `x, z`, radius and velocity. The cell is derived from position, so cell-based rules keep working |
| **Actions**          | `act()` per turn, `spend(time)`                                                                        | Per-tick controllers: hero input, mob AI state machines, attack timers                                                      |
| **View**             | Replays an event stream with tween beats                                                               | Interpolates the sim state each frame. Events remain for effects, sounds and the log                                        |

The two modes share one codebase, and the real-time sim lives under `src/engine/realtime/`. That has two benefits:

- Content added on `main` in M3–M6 can be merged into this branch, and works in both modes.
- On the title screen, Settings gets **Game mode: Classic / Action**, so you can A/B the two on the same build.

The sim stays deterministic: a fixed step, PD's seeded `Random`, and inputs recorded per tick. The headless bot,
replay tests and saves keep working.

### Time mapping

`TURN = 0.5 s` is the starting value, and all tuning lives in `src/engine/realtime/tuning.ts`.

- **Scheduled actors:** the world clock still drives PD's `Actor` scheduler for the non-spatial ones: buffs, blobs,
  hunger, regeneration and respawns. That's why poison, burning, gas spread, hunger and regen keep PD's logic for
  free, just measured in seconds.
- **Characters:** they no longer `act()` per turn. Their speed (cells per turn), attack delay and other timings
  become per-second rates and cooldowns.

### Space and scale

- **Bigger layouts.** PD's generator still makes the 32×32 logical map. In the world, **one cell is 3 m wide**, and
  characters are circles of about 0.35 m. A one-cell corridor is now a 3 m hall that fits two or three fighters.
  Rooms get proportionally larger, so kiting and being surrounded become possible. Room sizes may also be nudged in
  the painters if fights feel cramped.
- **Collision.**
  - Circles slide against the solid-cell grid (walls, closed locked doors, statues, bookshelves).
  - Characters push each other apart softly.
  - Water slows you, and deep chasms are fall zones at their edges.
- **Cell-based rules** (traps, plants, doors, high grass, heaps, stairs, blobs, FOV) use the cell under a body's
  centre:
  - Traps and plants trigger when the centre enters the inner 1.5 m of their cell, so you can skirt the edges.
  - Doors open while someone stands in the doorway.
  - Grass is trampled when a body crosses it.
- **Fog of war and FOV:** still PD's ShadowCaster on the grid, recomputed when the hero changes cell (or at 10 Hz).
  The FOV origin is the hero's cell. Visibility is smoothed in the shader so the edges don't pop.

### Combat (Diablo-like, PD numbers as the base)

**Targeting.**

- Tap or click an enemy to target it and attack, or hold the attack button.
- Auto-target picks the nearest visible enemy in a cone ahead of you, and it's sticky until that enemy dies or
  leaves range.
- On KB/M, left-click attacks the enemy under the cursor and the hero turns to face it.

**Attacks.**

- Each weapon gets a reach: about 1.6 m for melee and longer for spears.
- The cooldown is PD's `attackDelay × TURN`, so quarterstaffs stay fast and war hammers stay slow.
- A hit lands at the attack animation's impact frame.

**Rebalance, starting values:**

- **Accuracy vs defense:** PD's roll becomes _hit or graze_ rather than _hit or miss_. A graze does 25 % damage and
  shows "graze", so whiffing doesn't feel broken in real time. This is tunable.
- **Mob attacks are telegraphed.** There's a short wind-up (0.25–0.6 s per mob) before damage lands, and stepping
  out of reach dodges it. This is where the action skill comes from.
- **Hit feedback:** a ~60 ms hitstop on solid hits, a small knockback, the existing flash, and damage numbers.
- **Armor:** keeps PD's damage reduction. Encumbrance (heavy armor without enough STR) becomes slower movement.
- **Mob HP and damage:** they start at PD values and are tuned once they're played in real time.

**Mob AI.** PD's states (sleeping, wandering, hunting, fleeing, passive) map onto per-tick controllers:

- **Noticing you:** a PD-style stealth roll each second while the hero is in their FOV.
- **Hunting:** a BFS distance field from the hero on the grid (`PathFinder`, recomputed when the hero changes
  cell), followed with steering.
- **Fighting:** wind-up, strike, recover. They space out so not everyone stacks on one spot.

### Mechanics that were turn-based

| PD mechanic                                                                                 | Real-time version                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wait / rest                                                                                 | Removed as buttons. Regeneration runs all the time. **Rest** becomes a channel: standing still for 2 s with no enemies in view sits the hero down for faster regen.                          |
| Search                                                                                      | Hold the search button for 1.5 s to reveal secrets within about 2 cells. There's also a passive chance per second for secrets near the hero.                                                 |
| Hunger, poison, burning, paralysis, etc.                                                    | The same buffs, ticking in seconds. Paralysis and frost lock movement and attacks.                                                                                                           |
| Gas, fire, web                                                                              | Blobs evolve every 1 turn (0.5 s), as now. Standing in a cell applies the effect.                                                                                                            |
| Throwing, wands                                                                             | Projectiles with travel time (PD's missile and bolt speeds). They auto-aim at the target or nearest enemy ahead, can be aimed by drag or cursor, and can be dodged. Lightning stays instant. |
| Potions, scrolls, food                                                                      | Instant on use (with the existing animations). Item pickers like Identify open a window, which pauses.                                                                                       |
| Doors, keys, chests, stairs                                                                 | Walking in opens doors. A context **interact** button, or a click, handles chests, stairs, signs, wells and NPCs. Walking over an item picks it up.                                          |
| Stealth, sleeping mobs                                                                      | Sneak-attacks on sleeping or unaware mobs, as in PD (surprise = guaranteed hit).                                                                                                             |
| Swarm splitting, thief steal, mimic, statue, piranha, wraith, skeleton bones, fetid rat gas | Same behaviours, re-timed. Piranhas only move in water, and swarm splits spawn beside the hit.                                                                                               |
| Goo                                                                                         | Pump-up becomes a 1.5 s telegraphed area attack (ground marker) that you step out of. The jump is a leap with a landing shockwave.                                                           |
| Ghost quest, NPC dialog                                                                     | Talking pauses. The quest logic is unchanged.                                                                                                                                                |

## Camera

- **Chase cam:** about 4.5 m behind and 3 m above the hero, pitched about 30° down, with a slight 3/4 offset so the
  flat-ish voxel figures aren't seen edge-on.
- **Turning:**
  - On touch it turns with the hero's movement after a short delay, and dragging on the right half of the screen
    looks around.
  - On KB/M the mouse moves the view: hold right-drag, or pointer-lock as an option.
- **Walls in the way:** walls between the camera and the hero fade, reusing the cut-away shader with a camera-ray
  test instead of a fixed view direction. The camera also pulls in when a wall is behind it.
- **Zoom:** a zoom slider can pull back toward a higher view if the close cam turns out to be too claustrophobic.

### Character facing: decide early

PD's sprites are side views. Today they billboard toward the camera and flip left and right. Behind a chase cam
there are two options:

1. **Billboard + flip** (paper-cutout look): always readable, but you never see the hero's back.
2. **Face the movement direction** (voxel figurines): turns with the hero and reads as 3D, but you see the back of
   the inflated sprite from behind.

Prototype both in phase 1 behind a debug toggle, then pick one by eye.

## Controls

**Touch.**

- A floating left joystick for movement.
- On the right:
  - the **Attack** button;
  - the **Interact** context button, which shows only near stairs, chests, NPCs or signs;
  - **2–3 quickslots** — tap to use with auto-aim, or drag to aim;
  - **Search** — hold.
- Dragging on empty screen space looks around.
- Tapping an enemy targets it.
- The status pane, bag and menu buttons stay.

**KB/M.**

- WASD to move, mouse to look and aim.
- LMB attacks the hovered or targeted enemy. RMB-drag turns the camera.
- E interacts, Q searches, 1–3 use the quickslots, I opens the inventory and Esc opens the menu.

**Gamepad:** comes for free later on the same input abstraction. It's not in this experiment's scope.

## UI changes

- **HUD:**
  - A target frame shows the enemy's name and health.
  - Health bars appear over damaged enemies in view.
  - Ability cooldowns show on the quickslots.
  - The danger indicator and the log stay.
- **Pausing:** opening the bag, item windows, menus or dialogs freezes the sim.
- **Settings:**
  - Game mode (Classic or Action)
  - Camera sensitivity
  - Auto-target on or off
  - Joystick size and side

## Saves

- The world clock and bodies (position, velocity, cooldowns) go into the bundle, and saves stay versioned.
- Saves from Action mode and Classic mode are not interchangeable (a mode flag in `SavedGame.info`). Starting the
  other mode offers a new game.

## Status

- **Phase 1 (walk the sewers): done.**
  - Engine (`src/engine/realtime/`):
    - `ActionGame` runs a fixed 30 Hz world clock that drives buffs, blobs and hunger in seconds.
    - Bodies collide with the grid, door jambs included.
    - Crossing into a cell runs PD's cell logic: traps, grass, FOV, passive search and auto-pickup.
    - Doors open on approach.
    - Interact takes the stairs.
  - View:
    - `ChaseCamera` with shoulder offset, auto-follow on touch, and drag or Z/C to turn.
    - A tighter wall cut-away.
    - Characters, items and props scaled so a cell reads as 3 m.
    - `ActionControls`: WASD, mouse drag and wheel, and a floating touch joystick with right-side look.
    - Interact button.
    - Settings: **Action mode** and **Figures turn**, the facing prototype.
  - Classic mode is unchanged and still selectable.

- **Phase 2 (fight): done.**
  - Mobs keep PD's states and noticing rolls. `brain.ts` drives their bodies: they walk PD paths, close in
    directly, and wind up (glowing red) before PD's attack roll lands. Step out of reach to dodge. Piranhas stay
    in water.
  - Hero:
    - Tap or click an enemy to engage it; hold Attack (F) to auto-target.
    - Swings land at the impact frame, with PD's attack delay as the cooldown.
    - A short hitstop and knockback on hits.
  - Rules: misses graze for 25 % (no special effects).
- **Extras:**
  - Sprint: Shift, or the touch Run toggle. Running is 1.6× faster, and hunger drains 1 extra point per second
    (about 50 % faster).
  - A minimap fills in from PD's visited and mapped cells. It shows doors, stairs, items, visible enemies and
    the camera's view cone; tap it for a big map.
- **Camera:** pitched to 40° and looking half a cell ahead, so enemies in front aren't hidden behind the hero.
- **`npm run sim:action`:** a headless action-mode bot for crash fuzzing.
- **Phase 3 (real-time systems): done.**
  - Already running on the world clock: buffs, hunger, regeneration, gas, fire and webs (blobs), and plant
    effects.
  - Traps and plants go off only when you step near the middle of their cell (within about 1.2 m), so you can
    skirt them. Known traps can be stepped on deliberately, as in PD.
  - Water slows everyone to 70 %, except piranhas.
  - Pushing into a chasm's edge asks PD's "jump in?" question.
  - Search (Q or the Search tool) is a 1.5 s channel that moving cancels. Standing still also searches
    passively once a second.
  - After 2 s standing still with no enemy in sight, the hero sits down to rest for +0.35 HP/s.
  - Throws and zaps never ask for a cell:
    - From the quickslot or the bag, they go at the target or the best enemy ahead.
    - Drag from the quickslot to aim by hand (with an aim line), or press 1 to aim at the mouse cursor.
    - PD then resolves them as usual: Ballistica, hits, misses, dropping on the floor.
  - Allies: bees and mirror images fight hostile mobs and otherwise follow the hero. Sheep time out on the world
    clock. Piranhas still drown on land.
  - The action bot now also uses items at random.

## Phases

Each phase ends playable and committed on `realtime-arpg`.

1. **Walk the sewers** — the world clock, `Body` and collision, the 3 m cell scale (geometry, props and doors
   scaled), the hero controller on touch and KB/M, the chase cam with wall fading, fog updates, doors opening,
   stairs, item pickup, level transitions, and the facing prototype (both options).
2. **Fight** — targeting, melee with reach and cooldowns, hit or graze, telegraphed mob attacks, hitstop,
   knockback and numbers, death and resurrection, AI for rats, albino rats, gnolls, crabs and fetid rats.
3. **Real-time systems** — buffs, hunger and regen in seconds; blobs; traps; plants; grass; water; chasms; the
   search channel and the rest/sit behaviour; potions, scrolls, food and pickers that pause; projectiles for darts,
   javelins and boomerangs; wand bolts; bombs; honeypot bees; sheep.
4. **The rest of the Sewers** — swarm, thief and bandit, mimic, statue, wraith, skeleton, piranha, the Ghost
   quest with fetid rat and curse personification, the rat king, and Goo with its telegraphed pump and leap.
5. **UI and feel** — the touch layout, target frame, enemy health bars, quickslot cooldowns, the mode toggle,
   camera settings, saves, audio cues for wind-ups, and screen shake tuning.
6. **Tune and judge** — balance passes on mob damage, HP, speeds, graze %, cooldowns and spawn rates, using the
   tuning table and real play on phone and desktop. Then decide: merge as a mode, keep iterating, or drop the
   branch.

## Testing

- **Unit tests:**
  - collision (slide against walls and corners, no tunnelling at max speed);
  - world-clock to buff/blob timing;
  - the hit/graze formula;
  - determinism (same seed and same input log give the same state);
  - save/load round trip mid-fight.
- **Headless bot:** gets an action-mode driver (move to targets, attack, use potions when low) for crash fuzzing
  across the Sewers.
- **Browser checks:** desktop and phone viewports, with a fixed-dt frame stepper like the existing `dev` helpers.
- **Devices:** the iOS simulator, the Android emulator and a real phone for touch feel and frame rate. Target is
  60 fps with about 15 active mobs.

## Risks

- **Close camera vs PD art:** small 16 px sprites up close may look coarse. Mitigation: a 3/4 offset, a zoom
  range, and the facing prototype in phase 1.
- **Balance drift:** PD's numbers assume turns. Mitigation: hit/graze, telegraphs and a central tuning table. Expect
  real tuning time in phase 6.
- **Grid rules on free movement:** traps, doors, gas and FOV are per-cell. Mitigation: inner trigger zones, smoothed
  fog, and doors that stay open while occupied.
- **Divergence from `main`:** keeping content shared and the mode separate keeps merges from M3+ cheap.

## Undo

The experiment lives only on `realtime-arpg`. To abandon it:

```bash
git checkout main
git branch -D realtime-arpg
```
