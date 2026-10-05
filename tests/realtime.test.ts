import { describe, expect, it } from 'vitest';
import { Dungeon } from '../src/engine/Dungeon';
import { Game } from '../src/engine/Game';
import { Hunger } from '../src/engine/actors/buffs/buffs';
import { Terrain } from '../src/engine/levels/Terrain';
import { LENGTH, WIDTH } from '../src/engine/levels/constants';
import { ActionGame } from '../src/engine/realtime/ActionGame';
import { moveCircle, resolveCircle } from '../src/engine/realtime/collision';
import { Tuning } from '../src/engine/realtime/tuning';

/** A 32x32 map that is all floor except a wall column at x = 5. */
function corridorMap() {
  const map = new Int32Array(LENGTH).fill(Terrain.EMPTY);
  const passable = new Uint8Array(LENGTH).fill(1);
  for (let y = 0; y < 32; y++) {
    map[5 + y * WIDTH] = Terrain.WALL;
    passable[5 + y * WIDTH] = 0;
  }
  return { map, passable };
}

describe('Action mode collision', () => {
  it('pushes circles out of boxes', () => {
    const [x, z] = resolveCircle(0.95, 0.5, 0.12, [{ x0: 1, z0: 0, x1: 2, z1: 1 }]);
    expect(x).toBeCloseTo(0.88);
    expect(z).toBeCloseTo(0.5);
  });

  it('slides along a wall instead of stopping or passing through', () => {
    const { map, passable } = corridorMap();
    // Moving diagonally into the wall at x = 5: x is blocked at 5 - r, z keeps going.
    const [x, z] = moveCircle(map, passable, 4.5, 10.5, 0.12, 1, 1);
    expect(x).toBeCloseTo(5 - 0.12, 5);
    expect(z).toBeCloseTo(11.5, 5);
  });

  it('does not tunnel through a wall at high speed', () => {
    const { map, passable } = corridorMap();
    const [x] = moveCircle(map, passable, 4.5, 10.5, 0.12, 3, 0);
    expect(x).toBeLessThan(5);
  });
});

describe('Action mode world', () => {
  const start = (seed: number) => {
    ActionGame.enable(true);
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    if (Game.prompt) Game.answer(null);
    Game.drainEvents();
  };

  it('walks the hero and updates its cell, field of view and turn clock', () => {
    start(3);
    const hero = Dungeon.hero;
    const body = ActionGame.bodies().get(hero)!;
    const level = Dungeon.level;
    // Pick a passable neighbour direction and push the stick that way for a second.
    const dirs: [number, number][] = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    const dir = dirs.find(([dx, dz]) => level.passable[hero.pos + dx + dz * WIDTH])!;
    const startCell = hero.pos;
    for (let i = 0; i < 30; i++) ActionGame.update(Tuning.STEP, { moveX: dir[0], moveZ: dir[1] });
    expect(hero.pos).not.toBe(startCell);
    expect(Math.floor(body.x) + Math.floor(body.z) * WIDTH).toBe(hero.pos);
    expect(Dungeon.visible[hero.pos]).toBe(1);
    ActionGame.enable(false);
  });

  it('runs hunger on the world clock: one PD turn per Tuning.TURN seconds', () => {
    start(4);
    const hunger = Dungeon.hero.buff(Hunger)!;
    const before = (hunger as unknown as { level: number }).level;
    // 50 turns of standing still.
    for (let i = 0; i < Math.round((50 * Tuning.TURN) / Tuning.STEP); i++)
      ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    const after = (hunger as unknown as { level: number }).level;
    expect(after - before).toBeGreaterThanOrEqual(40);
    expect(after - before).toBeLessThanOrEqual(60);
    ActionGame.enable(false);
  });

  it('takes the stairs with Interact', () => {
    start(5);
    const hero = Dungeon.hero;
    hero.pos = Dungeon.level.exit;
    ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    expect(ActionGame.interaction()?.kind).toBe('descend');
    ActionGame.interact();
    expect(hero.pendingTransition).toBe('descend');
    Game.transition();
    expect(Dungeon.depth).toBe(2);
    ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
    const body = ActionGame.bodies().get(hero)!;
    expect(Math.floor(body.x) + Math.floor(body.z) * WIDTH).toBe(Dungeon.level.entrance);
    ActionGame.enable(false);
  });
});

describe('Action mode combat', () => {
  /** A fresh run with one awake rat placed a couple of cells from the hero, in plain sight. */
  async function arena(seed: number) {
    ActionGame.enable(true);
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    if (Game.prompt) Game.answer(null);
    Game.drainEvents();
    const { Rat } = await import('../src/engine/actors/mobs/mobs');
    const level = Dungeon.level;
    for (const m of [...level.mobs]) {
      level.mobs.delete(m);
    }
    const hero = Dungeon.hero;
    // A free cell two steps away (in the hero's room).
    const cell = [2, -2, 2 * WIDTH, -2 * WIDTH, 2 + 2 * WIDTH]
      .map((d) => hero.pos + d)
      .find((c) => level.passable[c] && Dungeon.visible[c])!;
    const rat = new Rat();
    rat.pos = cell;
    rat.state = 'HUNTING';
    level.mobs.add(rat);
    const { Actor } = await import('../src/engine/actors/Actor');
    Actor.add(rat);
    return { hero, rat };
  }

  it('a hunting rat closes in and bites, and holding attack kills it', async () => {
    const { hero, rat } = await arena(11);
    const hp0 = hero.HP;
    // Stand still: the rat comes over and attacks (armor soaks some bites, so give it ten seconds).
    let bites = 0;
    for (let i = 0; i < 300 && hero.HP === hp0; i++) {
      ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
      bites += Game.drainEvents().filter((e) => e.type === 'attack' && e.id === rat.id()).length;
    }
    expect(bites).toBeGreaterThan(0);
    expect(hero.HP).toBeLessThan(hp0);
    // Fight back.
    for (let i = 0; i < 600 && rat.isAlive(); i++) ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0, attack: true });
    expect(rat.isAlive()).toBe(false);
    expect(hero.exp + (hero.lvl - 1)).toBeGreaterThan(0);
    ActionGame.enable(false);
  });

  it('stepping out of reach during the wind-up dodges the blow', async () => {
    const { hero, rat } = await arena(12);
    const hb = ActionGame.bodies().get(hero)!;
    const rb = ActionGame.bodies().get(rat)!;
    let dodged = 0;
    // Wait until the rat starts a wind-up, then run directly away from it for a while.
    const { isWindingUp } = await import('../src/engine/realtime/brain');
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 200 && !isWindingUp(rat); i++) ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
      expect(isWindingUp(rat)).toBe(true);
      const hp = hero.HP;
      const dx = hb.x - rb.x;
      const dz = hb.z - rb.z;
      const d = Math.hypot(dx, dz);
      for (let i = 0; i < 15; i++) ActionGame.update(Tuning.STEP, { moveX: dx / d, moveZ: dz / d });
      if (hero.HP === hp) dodged++;
    }
    // Walls can corner the hero now and then, but running away should usually work.
    expect(dodged).toBeGreaterThanOrEqual(2);
    ActionGame.enable(false);
  });

  it('sprinting is faster and drains hunger faster', async () => {
    const { hero } = await arena(13);
    const level = Dungeon.level;
    level.mobs.clear();
    const hunger = hero.buff(Hunger)!;
    const run = (sprint: boolean) => {
      const hb = ActionGame.bodies().get(hero)!;
      const h0 = hunger.hungerLevel;
      let dist = 0;
      // Run around in a small circle for 2 seconds (walls permitting).
      for (let i = 0; i < 60; i++) {
        const a = i * 0.2;
        const x0 = hb.x;
        const z0 = hb.z;
        ActionGame.update(Tuning.STEP, { moveX: Math.cos(a), moveZ: Math.sin(a), sprint });
        dist += Math.hypot(hb.x - x0, hb.z - z0);
      }
      return { dist, hunger: hunger.hungerLevel - h0 };
    };
    const walk = run(false);
    const sprint = run(true);
    expect(sprint.dist).toBeGreaterThan(walk.dist * 1.3);
    // PD's own hunger rises in steps of 10 every 10 turns; sprinting adds a steady trickle on top.
    expect(walk.hunger % 10).toBeLessThan(0.01);
    expect(sprint.hunger % 10).toBeCloseTo(2 * Tuning.SPRINT_HUNGER, 1);
    ActionGame.enable(false);
  });
});

describe('Action mode systems', () => {
  async function fresh(seed: number) {
    ActionGame.enable(true);
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    if (Game.prompt) Game.answer(null);
    Game.drainEvents();
    for (const m of [...Dungeon.level.mobs]) Dungeon.level.mobs.delete(m);
    return Dungeon.hero;
  }
  const idle = (n: number, extra: object = {}) => {
    for (let i = 0; i < n; i++) ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0, ...extra });
  };

  it('throws darts from the quickslot at the nearest enemy without asking for a cell', async () => {
    const hero = await fresh(21);
    const { Rat } = await import('../src/engine/actors/mobs/mobs');
    const { Actor } = await import('../src/engine/actors/Actor');
    const level = Dungeon.level;
    const { distance } = await import('../src/engine/levels/constants');
    let cell = -1;
    for (let c = 0; c < level.map.length && cell === -1; c++) {
      if (level.passable[c] && Dungeon.visible[c] && distance(c, hero.pos) >= 2 && distance(c, hero.pos) <= 4) cell = c;
    }
    expect(cell).not.toBe(-1);
    const rat = new Rat();
    rat.pos = cell;
    rat.state = 'SLEEPING';
    level.mobs.add(rat);
    Actor.add(rat);
    idle(1);
    const darts = () => Game.quickslotItem()?.quantity ?? 0;
    const before = darts();
    ActionGame.useQuickslot();
    expect(Game.prompt).toBeNull();
    expect(darts()).toBe(before - 1);
    const thrown = Game.drainEvents().find((e) => e.type === 'missile');
    expect(thrown && thrown.type === 'missile' && thrown.to).toBe(cell);
    ActionGame.enable(false);
  });

  it('sets traps off only near the middle of their cell', async () => {
    const hero = await fresh(22);
    const level = Dungeon.level;
    // Put a visible paralytic trap next to the hero, then walk along its edge, then through its middle.
    const W = WIDTH;
    const dir = [1, -1, W, -W].find((d) => level.passable[hero.pos + d] && level.passable[hero.pos + 2 * d])!;
    const trapCell = hero.pos + dir;
    level.set(trapCell, Terrain.PARALYTIC_TRAP);
    const hb = ActionGame.bodies().get(hero)!;
    const tx = (trapCell % W) + 0.5;
    const tz = Math.floor(trapCell / W) + 0.5;
    const ux = dir === 1 ? 1 : dir === -1 ? -1 : 0;
    const uz = dir === W ? 1 : dir === -W ? -1 : 0;
    // Walk in until just across the trap cell's edge (0.45 from its middle): inside the cell, not triggered.
    for (let i = 0; i < 200 && Math.hypot(hb.x - tx, hb.z - tz) > 0.45; i++) {
      ActionGame.update(Tuning.STEP, { moveX: ux * 0.15, moveZ: uz * 0.15 });
    }
    idle(10);
    expect(hero.pos).toBe(trapCell);
    expect(level.map[trapCell]).toBe(Terrain.PARALYTIC_TRAP);
    // Step on to the middle: it goes off (and becomes an inactive trap).
    for (let i = 0; i < 100 && Math.hypot(hb.x - tx, hb.z - tz) > 0.1; i++) {
      ActionGame.update(Tuning.STEP, { moveX: ux * 0.3, moveZ: uz * 0.3 });
    }
    expect(level.map[trapCell]).not.toBe(Terrain.PARALYTIC_TRAP);
    ActionGame.enable(false);
  });

  it('searches carefully when asked, and rests when standing still', async () => {
    const hero = await fresh(23);
    hero.HP = 5;
    const events: string[] = [];
    ActionGame.search();
    for (let i = 0; i < Math.ceil(Tuning.SEARCH_TIME / Tuning.STEP) + 2; i++) {
      ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0 });
      for (const e of Game.drainEvents()) if (e.type === 'fx') events.push(e.fx);
    }
    expect(events).toContain('checkedCell');
    idle(Math.round((Tuning.SIT_AFTER + 6) / Tuning.STEP));
    expect(ActionGame.sitting).toBe(true);
    expect(hero.HP).toBeGreaterThan(5);
    // Moving stands the hero up.
    ActionGame.update(Tuning.STEP * 3, { moveX: 1, moveZ: 0 });
    ActionGame.update(Tuning.STEP * 3, { moveX: 0, moveZ: 1 });
    expect(ActionGame.sitting).toBe(false);
    ActionGame.enable(false);
  });

  it('wading through water is slower', async () => {
    const hero = await fresh(24);
    const level = Dungeon.level;
    const hb = ActionGame.bodies().get(hero)!;
    const run = () => {
      const x0 = hb.x;
      const z0 = hb.z;
      // Back and forth so walls don't get in the way.
      let d = 0;
      for (let i = 0; i < 20; i++) {
        const px = hb.x;
        const pz = hb.z;
        ActionGame.update(Tuning.STEP, { moveX: i < 10 ? 1 : -1, moveZ: 0 });
        d += Math.hypot(hb.x - px, hb.z - pz);
      }
      hb.x = x0;
      hb.z = z0;
      return d;
    };
    const dry = run();
    for (let c = 0; c < level.map.length; c++) level.water[c] = 1;
    const wet = run();
    expect(wet).toBeLessThan(dry * 0.85);
    ActionGame.enable(false);
  });

  it("lets the flock's sheep time out on the world clock", async () => {
    const hero = await fresh(25);
    const { Sheep } = await import('../src/engine/actors/mobs/npcs');
    const { Actor } = await import('../src/engine/actors/Actor');
    const sheep = new Sheep();
    sheep.lifespan = 4;
    sheep.pos = [1, -1, WIDTH, -WIDTH].map((d) => hero.pos + d).find((c) => Dungeon.level.passable[c])!;
    Dungeon.level.mobs.add(sheep);
    Actor.add(sheep);
    idle(Math.round((10 * Tuning.TURN) / Tuning.STEP));
    expect(Dungeon.level.mobs.has(sheep)).toBe(false);
    ActionGame.enable(false);
  });
});

describe('Action mode: sewer specials', () => {
  async function setup(seed: number) {
    ActionGame.enable(true);
    Game.newGame({ seed, heroClass: 'WARRIOR' });
    if (Game.prompt) Game.answer(null);
    Game.drainEvents();
    for (const m of [...Dungeon.level.mobs]) Dungeon.level.mobs.delete(m);
    const { Actor } = await import('../src/engine/actors/Actor');
    const mobs = await import('../src/engine/actors/mobs/mobs');
    const hero = Dungeon.hero;
    /** A free, visible cell `d` steps from the hero (Chebyshev). */
    const { distance } = await import('../src/engine/levels/constants');
    const freeCell = (d: number) => {
      for (let c = 0; c < Dungeon.level.map.length; c++)
        if (
          Dungeon.level.passable[c] &&
          Dungeon.visible[c] &&
          distance(c, hero.pos) === d &&
          !Dungeon.level.heaps.has(c)
        )
          return c;
      throw new Error('no free cell');
    };
    const place = <T extends { pos: number; state: string }>(m: T, cell: number, state = 'HUNTING') => {
      m.pos = cell;
      m.state = state;
      Dungeon.level.mobs.add(m as never);
      Actor.add(m as never);
      return m;
    };
    const step = (n: number, input: object = {}) => {
      for (let i = 0; i < n; i++) ActionGame.update(Tuning.STEP, { moveX: 0, moveZ: 0, ...input });
    };
    return { hero, mobs, freeCell, place, step };
  }

  it('a swarm splits right beside itself', async () => {
    const { hero, mobs, freeCell, place, step } = await setup(31);
    const swarm = place(new mobs.Swarm(), freeCell(1));
    step(1);
    swarm.damage(5, hero);
    swarm.defenseProc(hero, 5);
    step(2);
    const clones = [...Dungeon.level.mobs].filter((m) => m !== swarm && m instanceof mobs.Swarm);
    expect(clones.length).toBe(1);
    const a = ActionGame.bodies().get(swarm)!;
    const b = ActionGame.bodies().get(clones[0])!;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(0.6);
    ActionGame.enable(false);
  });

  it('a thief steals, runs, and turns on you when cornered', async () => {
    const { hero, mobs, freeCell, place, step } = await setup(32);
    const thief = place(new mobs.Thief(), freeCell(1));
    const items0 = hero.belongings.backpack.items.length;
    for (let i = 0; i < 400 && thief.item === null; i++) step(1);
    expect(thief.item).not.toBeNull();
    expect(hero.belongings.backpack.items.length).toBeLessThan(items0);
    expect(thief.state).toBe('FLEEING');
    // Paralyse the hero so the thief gets away, then make sure it doesn't freeze when it runs out of room.
    let sawHunting = false;
    for (let i = 0; i < 1800 && !sawHunting; i++) {
      step(1);
      if (thief.state === 'HUNTING') sawHunting = true;
    }
    // Either it was cornered (PD: "#$%^" and back to the attack) or it's still running: never stuck at 0 speed.
    const tb = ActionGame.bodies().get(thief);
    expect(sawHunting || (tb && Math.hypot(tb.vx, tb.vz) > 0)).toBe(true);
    ActionGame.enable(false);
  });

  it("a skeleton's bones hit those within a metre or so", async () => {
    const { hero, mobs, freeCell, place, step } = await setup(33);
    const near = place(new mobs.Skeleton(), freeCell(1));
    step(1);
    const hb = ActionGame.bodies().get(hero)!;
    const sb = ActionGame.bodies().get(near)!;
    // Put the skeleton right next to the hero and make sure the blast lands.
    sb.x = hb.x + 0.4;
    sb.z = hb.z;
    sb.px = sb.x;
    sb.pz = sb.z;
    near.pos = Math.floor(sb.x) + Math.floor(sb.z) * WIDTH;
    hero.HP = hero.HT = 100;
    let hit = false;
    for (let attempt = 0; attempt < 10 && !hit; attempt++) {
      const hp = hero.HP;
      near.HP = 1;
      const fresh = attempt === 0 ? near : place(new mobs.Skeleton(), near.pos);
      if (attempt > 0) {
        step(1);
        const b = ActionGame.bodies().get(fresh)!;
        b.x = hb.x + 0.4;
        b.z = hb.z;
      }
      fresh.die(hero);
      hit = hero.HP < hp;
    }
    expect(hit).toBe(true);
    // Far away (two cells): no damage.
    const far = place(new mobs.Skeleton(), freeCell(2));
    step(1);
    Game.drainEvents();
    far.die(hero);
    // (Killing it may level the hero up, so look for damage rather than comparing HP.)
    expect(Game.drainEvents().some((e) => e.type === 'damage' && e.id === hero.id())).toBe(false);
    ActionGame.enable(false);
  });

  it("Goo's slam is telegraphed and can be dodged", async () => {
    const outcome = async (dodge: boolean) => {
      const { hero, mobs, freeCell, place, step } = await setup(34);
      const goo = place(new mobs.Goo(), freeCell(1));
      hero.HP = hero.HT = 1000;
      // Wait for a slam (the red ring centred on Goo).
      let ring: { x: number; z: number } | null = null;
      for (let i = 0; i < 3000 && !ring; i++) {
        step(1);
        for (const e of Game.drainEvents())
          if (e.type === 'fx' && e.fx === 'area' && e.r === Tuning.GOO_SLAM_RADIUS) ring = { x: e.x!, z: e.z! };
      }
      expect(ring).not.toBeNull();
      const hp = hero.HP;
      const hb = ActionGame.bodies().get(hero)!;
      const frames = Math.ceil(Tuning.GOO_PUMP / Tuning.STEP) + 2;
      for (let i = 0; i < frames; i++) {
        const dx = hb.x - ring!.x;
        const dz = hb.z - ring!.z;
        const d = Math.hypot(dx, dz) || 1;
        step(1, dodge ? { moveX: dx / d, moveZ: dz / d, sprint: true } : {});
      }
      const slammed = Game.drainEvents().some((e) => e.type === 'damage' && e.id === hero.id() && e.amount > 0);
      ActionGame.enable(false);
      void goo;
      return { slammed, lost: hp - hero.HP };
    };
    const stood = await outcome(false);
    const ran = await outcome(true);
    expect(ran.lost).toBeLessThanOrEqual(stood.lost);
    expect(ran.slammed).toBe(false);
  });

  it('Interact opens chests and talks to the Ghost', async () => {
    const { hero, freeCell, place, step } = await setup(35);
    const { Heap } = await import('../src/engine/items/Heap');
    const { Gold } = await import('../src/engine/items/misc');
    // A chest next to the hero.
    const cell = freeCell(1);
    const heap = Dungeon.level.drop(new Gold(10), cell);
    heap.type = 'CHEST';
    void Heap;
    step(1);
    const hb = ActionGame.bodies().get(hero)!;
    // Walk next to it.
    const cx = (cell % WIDTH) + 0.5;
    const cz = Math.floor(cell / WIDTH) + 0.5;
    for (let i = 0; i < 100 && Math.hypot(cx - hb.x, cz - hb.z) > 0.7; i++) {
      const d = Math.hypot(cx - hb.x, cz - hb.z);
      step(1, { moveX: (cx - hb.x) / d, moveZ: (cz - hb.z) / d });
    }
    expect(ActionGame.interaction()?.kind).toBe('open');
    ActionGame.interact();
    expect(Dungeon.level.heaps.get(cell)?.type ?? 'HEAP').toBe('HEAP');
    // The Ghost: talking opens its quest dialog.
    const { Ghost } = await import('../src/engine/actors/mobs/npcs');
    const ghost = place(new Ghost(), freeCell(1), 'PASSIVE');
    step(1);
    const gb = ActionGame.bodies().get(ghost)!;
    for (let i = 0; i < 100 && Math.hypot(gb.x - hb.x, gb.z - hb.z) > 0.6; i++) {
      const d = Math.hypot(gb.x - hb.x, gb.z - hb.z);
      step(1, { moveX: (gb.x - hb.x) / d, moveZ: (gb.z - hb.z) / d });
    }
    expect(ActionGame.interaction()?.kind).toBe('talk');
    ActionGame.interact();
    expect(Game.prompt).not.toBeNull();
    ActionGame.enable(false);
  });
});
