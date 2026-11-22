// The driver program the harness runs: node /bot/main.ts (node22). It reads
// every instance from /input/<id>/level.txt, answers each one alone with
// the push-optimal solver in solve.js, and writes /output/<id>/solution.txt
// (the player's moves in LURD, one letter a step, an upper letter a push).
// Outside a container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in
// for /input and /output. The output directory is only ever created
// (mkdir), never removed: the grader mounts /output as a volume.
//
// Revision: the run is budgeted by work, never by the clock — the solver
// caps each room's search at a fixed number of states, so two executions
// on one set write the same bytes. Non-directory entries under /input are
// skipped, so a stray file cannot break the run.
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** solve.js, imported by its URL (a .js module carries no types) and typed by its contract. */
const { solveLevel } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  solveLevel: (level: string) => string;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

for (const id of readdirSync(INPUT_DIR).sort()) {
  const dir = join(INPUT_DIR, id);
  if (!statSync(dir).isDirectory()) continue;
  const moves = solveLevel(readFileSync(join(dir, 'level.txt'), 'utf8'));
  mkdirSync(join(OUTPUT_DIR, id), { recursive: true });
  writeFileSync(join(OUTPUT_DIR, id, 'solution.txt'), `${moves}\n`);
}
