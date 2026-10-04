// npm run sim -- [runs] [commands]: plays many seeded runs headlessly and reports crashes and outcomes.
import { playRun } from './bot';

const runs = Number(process.argv[2] ?? 50);
const commands = Number(process.argv[3] ?? 3000);
const results = [];
for (let i = 0; i < runs; i++) results.push(playRun(`sim-${i}`, commands));

const crashes = results.filter((r) => r.error);
const depths = new Map<number, number>();
for (const r of results) depths.set(r.depth, (depths.get(r.depth) ?? 0) + 1);
const causes = new Map<string, number>();
for (const r of results) if (!r.alive && !r.error) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);

console.log(`${runs} runs, ${crashes.length} crashes`);
console.log('depth reached:', Object.fromEntries([...depths].sort((a, b) => a[0] - b[0])));
console.log('deaths:', Object.fromEntries(causes));
for (const c of crashes.slice(0, 5)) console.log(`\n--- ${c.seed} (depth ${c.depth}, ${c.turns} cmds)\n${c.error}`);
process.exitCode = crashes.length ? 1 : 0;
