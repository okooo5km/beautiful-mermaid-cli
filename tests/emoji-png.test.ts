// Emoji PNG rendering — verifies that emoji input does NOT crash the
// renderer and that a one-shot stderr warning is emitted (because resvg-wasm
// cannot render COLR/sbix color emoji fonts; the emoji glyphs will be
// missing from the PNG, which is the documented behavior). — okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLI = path.resolve('dist', 'cli.js');
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

function run(args: string[], input?: string): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('Emoji PNG rendering', () => {
  it(
    'renders an emoji-bearing diagram to a valid PNG without crashing',
    async () => {
      const dir = await mkdtemp(path.join(tmpdir(), 'bm-emoji-'));
      const out = path.join(dir, 'e.png');
      const src = `graph LR\n    A[\u{1F680} Start] --> B[\u{1F389} Done]`;
      const r = run(['render', '-c', src, '-o', out]);
      expect(r.status).toBe(0);
      const png = await readFile(out);
      expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
      expect(png.byteLength).toBeGreaterThan(100);
    },
    30_000,
  );

  it(
    'emits a one-shot stderr warning when SVG contains emoji',
    () => {
      const src = `graph LR\n    A[\u{1F680} ship] --> B[\u{2705} ok]`;
      const out = path.join(tmpdir(), `bm-emoji-warn-${Date.now()}.png`);
      const r = run(['render', '-c', src, '-o', out]);
      expect(r.status).toBe(0);
      // The warning is suppressed in --json mode (we're not using --json here)
      // and is one-shot per process — a single render is enough to see it.
      expect(r.stderr).toMatch(/emoji characters are missing/i);
    },
    30_000,
  );

  it(
    'renders a non-emoji diagram silently',
    () => {
      const src = 'graph LR\n    A[hello]-->B[world]';
      const out = path.join(tmpdir(), `bm-no-emoji-${Date.now()}.png`);
      const r = run(['render', '-c', src, '-o', out]);
      expect(r.status).toBe(0);
      expect(r.stderr).not.toMatch(/emoji/i);
    },
    30_000,
  );
});
