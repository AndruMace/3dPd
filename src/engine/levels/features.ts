// Ports of levels/features/*: high grass, chasms, signs and the alchemy pot.
import { Assets } from '../../content/generated/Assets';
import { Badges } from '../Badges';
import { Dungeon, ResultDescriptions } from '../Dungeon';
import { Buff } from '../actors/buffs/Buff';
import { Barkskin, Cripple } from '../actors/buffs/buffs';
import type { Char } from '../actors/Char';
import type { Hero } from '../actors/hero/Hero';
import type { Mob } from '../actors/mobs/Mob';
import { Events, GLog } from '../core/events';
import { Fx, Sample } from '../core/fx';
import { Random } from '../core/Random';
import { UI } from '../core/ui';
import { Generator } from '../items/Generator';
import { Dewdrop } from '../items/misc';
import { RingOfHerbalism } from '../items/rings/rings';
import { observe } from '../observe';
import type { Level } from './Level';
import { Terrain } from './Terrain';

export const HighGrass = {
  trample(level: Level, pos: number, ch: Char | null): void {
    level.set(pos, Terrain.GRASS);
    let herbalismLevel = 0;
    if (ch !== null) {
      const herbalism = ch.buff(RingOfHerbalism.Effect);
      if (herbalism !== null) herbalismLevel = herbalism.level;
    }
    // Seed
    if (herbalismLevel >= 0 && Random.Int(18) <= Random.Int(herbalismLevel + 1)) {
      level.drop(Generator.random('SEED'), pos).dropFX(pos);
    }
    // Dew
    if (herbalismLevel >= 0 && Random.Int(6) <= Random.Int(herbalismLevel + 1)) {
      level.drop(new Dewdrop(), pos).dropFX(pos);
    }
    let leaves = 4;
    if (ch !== null && ch === Dungeon.hero && Dungeon.hero.subClass === 'WARDEN') {
      Buff.affect(ch, Barkskin).setLevel(Math.trunc(ch.HT / 3));
      leaves = 8;
    }
    Fx.burst('LeafParticle.LEVEL_SPECIFIC', { pos }, leaves);
    observe();
  },
};

export const Chasm = {
  jumpConfirmed: false,

  heroJump(hero: Hero): void {
    UI.options(
      'Chasm',
      'Do you really want to jump into the chasm? You can probably die.',
      ["Yes, I know what I'm doing", 'No, I changed my mind'],
      (index) => {
        if (index === 0) {
          Chasm.jumpConfirmed = true;
          hero.resumeAction();
        }
      },
    );
  },

  heroFall(pos: number): void {
    Chasm.jumpConfirmed = false;
    Sample.play(Assets.SND_FALLING);
    const hero = Dungeon.hero;
    if (hero.isAlive()) {
      hero.interrupt();
      const room = Dungeon.level.roomAt(pos);
      hero.pendingTransition = room !== null && room.type === 'WEAK_FLOOR' ? 'fallIntoPit' : 'fall';
    } else {
      Events.emit({ type: 'remove', id: hero.id() });
    }
  },

  heroLand(): void {
    const hero = Dungeon.hero;
    Fx.blood(hero.id(), 10);
    Fx.shake(4, 0.2);
    Buff.prolong(hero, Cripple, Cripple.DURATION);
    hero.damage(Random.IntRange(Math.trunc(hero.HT / 3), Math.trunc(hero.HT / 2)), {
      onDeath() {
        Badges.validateDeathFromFalling();
        Dungeon.fail(ResultDescriptions.FALL(Dungeon.depth));
        GLog.n('You fell to death...');
      },
    });
  },

  mobFall(mob: Mob): void {
    mob.destroy();
    Events.emit({ type: 'fx', fx: 'fall', id: mob.id() });
    Events.emit({ type: 'remove', id: mob.id() });
  },
};

const TIPS = [
  "Don't overestimate your strength, use weapons and armor you can handle.",
  'Not all doors in the dungeon are visible at first sight. If you are stuck, search for hidden doors.',
  'Remember, that raising your strength is not the only way to access better equipment. You can go the other way, lowering its strength requirement with Scrolls of Upgrade.',
  'You can spend your gold in shops on deeper levels of the dungeon. The first one is on the 6th level.',
  'Beware of Goo!',
  'Pixel-Mart - all you need for successful adventure!',
  "Identify your potions and scrolls as soon as possible. Don't put it off to the moment when you actually need them.",
  "Being hungry doesn't hurt, but starving does hurt.",
  'Surprise attack has a better chance to hit. For example, you can ambush your enemy behind a closed door when you know it is approaching.',
  "Don't let The Tengu out!",
  'Pixel-Mart. Spend money. Live longer.',
  "When you're attacked by several monsters at the same time, try to retreat behind a door.",
  "If you are burning, you can't put out the fire in the water while levitating.",
  'There is no sense in possessing more than one Ankh at the same time, because you will lose them upon resurrecting.',
  'DANGER! Heavy machinery can cause injury, loss of limbs or death!',
  'Pixel-Mart. A safer life in dungeon.',
  'When you upgrade an enchanted weapon, there is a chance to destroy that enchantment.',
  'Weapons and armors deteriorate faster than wands and rings, but there are more ways to fix them.',
  'The only way to obtain a Scroll of Wipe Out is to receive it as a gift from the dungeon spirits.',
  'No weapons allowed in the presence of His Majesty!',
  'Pixel-Mart. Special prices for demon hunters!',
];

export const Sign = {
  read(pos: number): void {
    if (Dungeon.level.isDeadEnd()) {
      UI.message('What are you doing here?!');
      return;
    }
    const index = Dungeon.depth - 1;
    if (index < TIPS.length) {
      UI.message(TIPS[index]);
    } else {
      Dungeon.level.destroy(pos);
      Fx.at('discoverTile', pos, Terrain.SIGN);
      Fx.burst('ElmoParticle', { pos }, 6);
      Sample.play(Assets.SND_BURNING);
      GLog.w('As you try to read the sign it bursts into greenish flames.');
    }
  },
};

export const AlchemyPot = {
  operate(hero: Hero, pos: number): void {
    UI.selectItem('SEED', 'Select a seed to throw', (item) => {
      if (item !== null) item.cast(hero, pos);
    });
  },
};
