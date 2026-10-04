// Ports of levels/traps/*: what each trap does when something steps on it.
import { Assets } from '../../../content/generated/Assets';
import { Dungeon, ResultDescriptions } from '../../Dungeon';
import { Actor } from '../../actors/Actor';
import { Blob } from '../../actors/blobs/Blob';
import { Fire, ParalyticGas, ToxicGas } from '../../actors/blobs/blobs';
import { Buff } from '../../actors/buffs/Buff';
import { Bleeding, Cripple, Poison } from '../../actors/buffs/buffs';
import type { Char } from '../../actors/Char';
import type { Hero } from '../../actors/hero/Hero';
import type { Mob } from '../../actors/mobs/Mob';
import { GLog } from '../../core/events';
import { Fx, Sample } from '../../core/fx';
import { lazy } from '../../core/lazy';
import { Random } from '../../core/Random';
import { NEIGHBOURS8, WIDTH } from '../constants';
import { LIGHTNING } from './Electricity';

export const AlarmTrap = {
  trigger(pos: number, ch: Char | null): void {
    for (const mob of Dungeon.level.mobs) if (mob !== ch) mob.beckon(pos);
    if (Dungeon.visible[pos]) {
      GLog.w('The trap emits a piercing sound that echoes throughout the dungeon!');
      Fx.start('Speck.SCREAM', pos, 0.3, 3);
    }
    Sample.play(Assets.SND_ALERT);
  },
};

export const FireTrap = {
  trigger(pos: number): void {
    Dungeon.level.addBlob(Blob.seed(pos, 2, Fire));
    Fx.burst('FlameParticle', { pos }, 5);
  },
};

export const GrippingTrap = {
  trigger(pos: number, c: Char | null): void {
    if (c !== null) {
      const damage = Math.max(0, Dungeon.depth + 3 - Random.IntRange(0, Math.trunc(c.dr() / 2)));
      Buff.affect(c, Bleeding).set(damage);
      Buff.prolong(c, Cripple, Cripple.DURATION);
      Fx.at('wound', c.pos);
    } else {
      Fx.at('wound', pos);
    }
  },
};

export const LightningTrap = {
  name: 'lightning trap',
  trigger(pos: number, ch: Char | null): void {
    if (ch !== null) {
      ch.damage(Math.max(1, Random.Int(Math.trunc(ch.HP / 3), Math.trunc((2 * ch.HP) / 3))), LIGHTNING);
      if (ch === Dungeon.hero) {
        Fx.shake(2, 0.3);
        if (!ch.isAlive()) {
          Dungeon.fail(ResultDescriptions.TRAP(LightningTrap.name, Dungeon.depth));
          GLog.n('You were killed by a discharge of a lightning trap...');
        } else {
          (ch as Hero).belongings.charge(false);
        }
      }
      Fx.bolt('Lightning', pos - WIDTH, pos + WIDTH);
      Fx.bolt('Lightning', pos - 1, pos + 1);
    }
    Fx.burst('SparkParticle', { pos }, Random.IntRange(3, 4));
  },
};

export const ParalyticTrap = {
  trigger(pos: number): void {
    Dungeon.level.addBlob(Blob.seed(pos, 80 + 5 * Dungeon.depth, ParalyticGas));
  },
};

export const PoisonTrap = {
  trigger(pos: number, ch: Char | null): void {
    if (ch !== null) Buff.affect(ch, Poison).set(Poison.durationFactor(ch) * (4 + Math.trunc(Dungeon.depth / 2)));
    Fx.burst('PoisonParticle.SPLASH', { pos }, 3);
  },
};

export const SummoningTrap = {
  DELAY: 2,
  trigger(pos: number, c: Char | null): void {
    if (Dungeon.bossLevel()) return;
    const level = Dungeon.level;
    const occupied = new Set<number>();
    if (c !== null) occupied.add(c.pos);

    let nMobs = 1;
    if (Random.Int(2) === 0) {
      nMobs++;
      if (Random.Int(2) === 0) nMobs++;
    }

    const candidates: number[] = [];
    for (const n of NEIGHBOURS8) {
      const p = pos + n;
      if (Actor.findChar(p) === null && !occupied.has(p) && (level.passable[p] || level.avoid[p])) candidates.push(p);
    }
    const respawnPoints: number[] = [];
    while (nMobs > 0 && candidates.length > 0) {
      const index = Random.index(candidates);
      respawnPoints.push(candidates.splice(index, 1)[0]);
      nMobs--;
    }

    const bestiary = lazy<{ mob(depth: number): Mob }>('Bestiary');
    const appear = lazy<{ appear(ch: Char, pos: number): void }>('WandOfBlink').appear;
    for (const point of respawnPoints) {
      const mob = bestiary.mob(Dungeon.depth);
      mob.state = 'WANDERING';
      mob.pos = point;
      level.addMob(mob, SummoningTrap.DELAY);
      appear(mob, point);
    }
  },
};

export const ToxicTrap = {
  trigger(pos: number): void {
    Dungeon.level.addBlob(Blob.seed(pos, 300 + 20 * Dungeon.depth, ToxicGas));
  },
};
