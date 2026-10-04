// Copies the original Pixel Dungeon art and audio (GPL-3.0, (c) Oleg Dolya / watabou) into public/assets/.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { OUT_ASSETS, PD_ASSETS } from './paths.ts';

if (!existsSync(PD_ASSETS)) {
  console.error('reference/pixel-dungeon is missing; run `npm run refs` first.');
  process.exit(1);
}

const dirs = { png: 'img', mp3: 'audio' } as const;
let count = 0;
for (const file of readdirSync(PD_ASSETS)) {
  const ext = path.extname(file).slice(1) as keyof typeof dirs;
  if (!(ext in dirs)) continue;
  const dest = path.join(OUT_ASSETS, dirs[ext]);
  mkdirSync(dest, { recursive: true });
  copyFileSync(path.join(PD_ASSETS, file), path.join(dest, file));
  count++;
}
console.log(`imported ${count} assets into ${path.relative(process.cwd(), OUT_ASSETS)}`);
