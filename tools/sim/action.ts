// npm run sim:action -- [runs] [seconds]: headless action-mode runs. A simple bot fights whatever is near, heads for
// unexplored cells and the stairs, eats when hungry and sprints between fights. Reports crashes and outcomes.
import { Dungeon } from '../../src/engine/Dungeon';
import { Game } from '../../src/engine/Game';
import { findPath } from '../../src/engine/actors/pathing';
import { Hunger } from '../../src/engine/actors/buffs/buffs';
import { WIDTH } from '../../src/engine/levels/constants';
import { ActionGame } from '../../src/engine/realtime/ActionGame';
import { Tuning } from '../../src/engine/realtime/tuning';

const runs = Number(process.argv[2] ?? 30);
const seconds = Number(process.argv[3] ?? 600);

interface Result {
  seed: string;
  depth: number;
  alive: boolean;
  cause: string;
  error?: string;
  kills: number;
  time: number;
}

function frontier(): number {
  const level = Dungeon.level;
  const cells: number[] = [];
  for (let c = WIDTH; c < level.map.length - WIDTH; c++) {
    if (!level.visited[c] || !level.passable[c]) continue;
    if (!level.visited[c + 1] || !level.visited[c - 1] || !level.visited[c + WIDTH] || !level.visited[c - WIDTH])
      cells.push(c);
  }
  return cells.length ? cells[Math.floor(Math.random() * cells.length)] : -1;
}

function play(seed: string): Result {
  ActionGame.enable(true);
  Game.newGame({ seed, heroClass: 'WARRIOR' });
  let kills = 0;
  let goal = -1;
  let t = 0;
  try {
    for (; t < seconds && Dungeon.hero.isAlive(); t += Tuning.STEP) {
      const hero = Dungeon.hero;
      if (Game.prompt) {
        const p = Game.prompt;
        Game.answer(
          p.kind === 'options' ? 0 : p.kind === 'item' ? (hero.belongings.backpack.items[0]?.uid ?? null) : null,
        );
        continue;
      }
      if (hero.pendingTransition) {
        Game.transition();
        goal = -1;
        continue;
      }
      const hunger = hero.buff(Hunger);
      if (hunger && hunger.hungerLevel >= Hunger.HUNGRY) {
        const food = hero.belongings.backpack.items.find((i) => i.actions(hero).includes('EAT'));
        if (food) Game.itemAction(food.uid, 'EAT');
      }
      const bodies = ActionGame.bodies();
      const hb = bodies.get(hero)!;
      const enemyNear = [...Dungeon.level.mobs].some(
        (m) =>
          m.hostile && Dungeon.visible[m.pos] && Math.hypot(bodies.get(m)!.x - hb.x, bodies.get(m)!.z - hb.z) < 2.5,
      );
      let moveX = 0;
      let moveZ = 0;
      if (!enemyNear) {
        const level = Dungeon.level;
        if (level.visited[level.exit] || level.mapped[level.exit]) goal = level.exit;
        if (goal === -1 || goal === hero.pos) goal = frontier();
        if (hero.pos === level.exit) ActionGame.interact();
        const step = goal === -1 ? -1 : findPath(hero, hero.pos, goal, level.passable, Dungeon.visible);
        const target = step === -1 ? goal : step;
        if (target !== -1) {
          const dx = (target % WIDTH) + 0.5 - hb.x;
          const dz = Math.floor(target / WIDTH) + 0.5 - hb.z;
          const d = Math.hypot(dx, dz) || 1;
          moveX = dx / d;
          moveZ = dz / d;
        }
        if (step === -1 && goal !== level.exit) goal = -1;
      }
      const before = Dungeon.level.mobs.size;
      ActionGame.update(Tuning.STEP, { moveX, moveZ, attack: enemyNear, sprint: !enemyNear && t % 20 < 6 });
      if (Dungeon.level.mobs.size < before) kills += before - Dungeon.level.mobs.size;
      Game.drainEvents();
    }
  } catch (e) {
    return {
      seed,
      depth: Dungeon.depth,
      alive: Dungeon.hero.isAlive(),
      cause: '',
      error: (e as Error).stack,
      kills,
      time: t,
    };
  }
  return {
    seed,
    depth: Dungeon.depth,
    alive: Dungeon.hero.isAlive(),
    cause: Dungeon.resultDescription,
    kills,
    time: t,
  };
}

const results: Result[] = [];
for (let i = 0; i < runs; i++) results.push(play(`action-${i}`));
const crashes = results.filter((r) => r.error);
const depths = new Map<number, number>();
for (const r of results) depths.set(r.depth, (depths.get(r.depth) ?? 0) + 1);
const causes = new Map<string, number>();
for (const r of results) if (!r.alive && !r.error) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
console.log(`${runs} action runs (${seconds}s each), ${crashes.length} crashes`);
console.log('depth reached:', Object.fromEntries([...depths].sort((a, b) => a[0] - b[0])));
console.log('deaths:', Object.fromEntries(causes));
console.log('kills per run:', (results.reduce((n, r) => n + r.kills, 0) / runs).toFixed(1));
for (const c of crashes.slice(0, 5))
  console.log(`\n--- ${c.seed} (depth ${c.depth}, ${c.time.toFixed(1)}s)\n${c.error}`);
process.exitCode = crashes.length ? 1 : 0;
