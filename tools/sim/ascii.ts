// Prints a generated level as ASCII (debug aid): npx tsx tools/sim/ascii.ts [seed] [depth]
import { Dungeon } from '../../src/engine/Dungeon';
import { Game } from '../../src/engine/Game';
import { WIDTH, LENGTH } from '../../src/engine/levels/constants';
import { Terrain as T } from '../../src/engine/levels/Terrain';

const seed = process.argv[2] ?? 'ascii';
const depth = Number(process.argv[3] ?? 1);
Game.newGame({ seed, heroClass: 'WARRIOR' });
for (let d = 1; d < depth; d++) Game.descend();
const lvl = Dungeon.level;
const glyph = (t: number): string => {
  if (t >= T.WATER_TILES) return '~';
  switch (t) {
    case T.WALL:
      return '#';
    case T.WALL_DECO:
      return '%';
    case T.EMPTY:
      return '.';
    case T.EMPTY_SP:
      return ',';
    case T.EMPTY_DECO:
      return ':';
    case T.DOOR:
      return '+';
    case T.SECRET_DOOR:
      return 'S';
    case T.ENTRANCE:
      return '<';
    case T.EXIT:
      return '>';
    case T.GRASS:
      return '"';
    case T.HIGH_GRASS:
      return '&';
    case T.SIGN:
      return '?';
    case T.CHASM:
    case T.CHASM_FLOOR:
    case T.CHASM_WALL:
    case T.CHASM_WATER:
    case T.CHASM_FLOOR_SP:
      return ' ';
    case T.BOOKSHELF:
      return 'B';
    case T.PEDESTAL:
      return 'P';
    case T.EMBERS:
      return 'e';
    default:
      return lvl.secret[0] ? '' : '^';
  }
};
const mobs = new Set([...lvl.mobs].map((m) => m.pos));
let out = '';
for (let i = 0; i < LENGTH; i++) {
  out += i === Dungeon.hero.pos ? '@' : mobs.has(i) ? 'r' : lvl.heaps.has(i) ? '$' : glyph(lvl.map[i]);
  if (i % WIDTH === WIDTH - 1) out += '\n';
}
console.log(`seed=${seed} depth=${Dungeon.depth} feeling=${lvl.feeling}\n${out}`);
