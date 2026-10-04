// Clones the original Pixel Dungeon sources (GPL-3.0) at pinned commits into reference/.
// These are the spec for every port and the source of all imported art and audio.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { REF } from './paths.ts';

const REPOS = [
  {
    dir: 'pixel-dungeon',
    url: 'https://github.com/watabou/pixel-dungeon.git',
    commit: 'ca458a28f053612973d5d6059dae5f6f2ca4fcb7',
  },
  {
    dir: 'PD-classes',
    url: 'https://github.com/watabou/PD-classes.git',
    commit: 'c0b690a4163020963e70a58a7d4f27965dc8f134',
  },
];

mkdirSync(REF, { recursive: true });
for (const repo of REPOS) {
  const dest = path.join(REF, repo.dir);
  if (!existsSync(dest)) execFileSync('git', ['clone', repo.url, dest], { stdio: 'inherit' });
  execFileSync('git', ['-C', dest, 'fetch', '--depth', '1', 'origin', repo.commit], { stdio: 'inherit' });
  execFileSync('git', ['-C', dest, 'checkout', '-q', repo.commit], { stdio: 'inherit' });
  console.log(`${repo.dir} @ ${repo.commit.slice(0, 8)}`);
}
