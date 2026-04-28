// Vitest globalSetup: build dist/ once before any test file spawns it.
// Multiple test files spawn dist/cli.js in parallel; without this each file
// would need its own beforeAll, and a fresh CI checkout (no dist/) would race.
// — okooo5km(十里)

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export default function setup(): void {
  // Use the JS entry of tsc directly via Node so the call is portable across
  // Linux / macOS / Windows (avoids .cmd shim spawn issues on Windows).
  const tscJs = path.resolve('node_modules', 'typescript', 'bin', 'tsc');
  if (!existsSync(tscJs)) throw new Error(`tsc entry not found at ${tscJs}`);
  const r = spawnSync(process.execPath, [tscJs], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`tsc failed with status ${r.status}`);
}
