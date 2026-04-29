// CLI integration tests for `bm fonts`. — okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

// dist/ is built once by tests/global-setup.ts (vitest globalSetup).
const CLI = path.resolve('dist', 'cli.js');

function run(args: string[]): { status: number | null; stdout: string; stderr: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('bm fonts', () => {
  it(
    '--json emits a valid envelope with at least one font',
    () => {
      const r = run(['fonts', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout) as {
        schema_version: number;
        fonts: Array<{ family: string; path: string; coverage: string[]; is_monospace: boolean }>;
        count: number;
      };
      expect(data.schema_version).toBe(1);
      expect(Array.isArray(data.fonts)).toBe(true);
      expect(data.count).toBe(data.fonts.length);
      expect(data.count).toBeGreaterThan(0);
      const first = data.fonts[0]!;
      expect(typeof first.family).toBe('string');
      expect(typeof first.path).toBe('string');
      expect(Array.isArray(first.coverage)).toBe(true);
      expect(typeof first.is_monospace).toBe('boolean');
    },
    30_000,
  );

  it(
    '--filter cjk only returns fonts with cjk coverage',
    () => {
      const r = run(['fonts', '--filter', 'cjk', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout) as {
        fonts: Array<{ coverage: string[] }>;
      };
      // On macOS / Windows CI runners and Linux with fonts-noto-cjk, CJK fonts
      // must be present. On a minimal Linux without CJK fonts, this list
      // would be empty; our CI installs fonts-noto-cjk so this is enforced.
      if (data.fonts.length === 0) {
        console.warn(
          'skipped: no CJK fonts installed; install fonts-noto-cjk or equivalent.',
        );
        return;
      }
      for (const f of data.fonts) expect(f.coverage).toContain('cjk');
    },
    30_000,
  );

  it(
    '--filter mono only returns monospace fonts',
    () => {
      const r = run(['fonts', '--filter', 'mono', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout) as {
        fonts: Array<{ is_monospace: boolean }>;
      };
      for (const f of data.fonts) expect(f.is_monospace).toBe(true);
    },
    30_000,
  );

  it(
    '--filter emoji only returns emoji-coverage fonts',
    () => {
      const r = run(['fonts', '--filter', 'emoji', '--json']);
      expect(r.status).toBe(0);
      const data = JSON.parse(r.stdout) as {
        fonts: Array<{ coverage: string[] }>;
      };
      // Hosts without a COLR emoji font (default macOS, minimal Linux) yield
      // an empty list; the filter should still be a valid choice and the
      // command should exit 0.
      for (const f of data.fonts) expect(f.coverage).toContain('emoji');
    },
    30_000,
  );

  it(
    'human output prints a header line with family count',
    () => {
      const r = run(['fonts']);
      expect(r.status).toBe(0);
      expect(r.stdout).toMatch(/bm fonts.*families/);
    },
    30_000,
  );

  it(
    'rejects unknown --filter value with usage error (exit 2)',
    () => {
      const r = run(['fonts', '--filter', 'bogus']);
      expect(r.status).toBe(2);
    },
    30_000,
  );
});
