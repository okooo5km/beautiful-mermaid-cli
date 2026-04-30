// JSON output schema tests for --json mode (P1) — okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const CLI = path.resolve('dist', 'cli.js');

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], input?: string): RunResult {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    input,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('--json output (success)', () => {
  it('themes --json emits schema v1 with all themes', () => {
    const r = run(['themes', '--json']);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.schema_version).toBe(1);
    expect(data.count).toBeGreaterThanOrEqual(15);
    expect(Array.isArray(data.themes)).toBe(true);
    expect(data.themes).toHaveLength(data.count);
    const names = data.themes.map((t: { name: string }) => t.name);
    expect(names).toContain('dracula');
    expect(names).toContain('zinc-light');
    expect(names).toContain('tokyo-night');
    for (const t of data.themes) {
      expect(typeof t.name).toBe('string');
      expect(t.bg).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(t.fg).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('render --json with -o writes file and emits metadata', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-json-'));
    const out = path.join(dir, 'a.svg');
    const r = run(['render', '--json', '-c', 'graph LR\n  A-->B', '-o', out]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.schema_version).toBe(1);
    expect(data.success).toBe(true);
    expect(data.format).toBe('svg');
    expect(data.output).toBe(path.resolve(out));
    expect(data.bytes).toBeGreaterThan(0);
    expect(data.dimensions).toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    expect(data.svg).toBeUndefined();
    const onDisk = await readFile(out, 'utf8');
    expect(onDisk).toMatch(/<\/svg>/);
    expect(Buffer.byteLength(onDisk, 'utf8')).toBe(data.bytes);
  });

  it('render --json without -o inlines svg field (no file written)', () => {
    const r = run(['render', '--json', '-c', 'graph LR\n  A-->B']);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.success).toBe(true);
    expect(data.format).toBe('svg');
    expect(typeof data.svg).toBe('string');
    expect(data.svg).toMatch(/<\/svg>/);
    expect(data.output).toBeUndefined();
  });

  it('render --json -f png -o file writes PNG and reports byte length', { timeout: 15_000 }, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-json-'));
    const out = path.join(dir, 'a.png');
    const r = run(['render', '--json', '-f', 'png', '-c', 'graph LR\n  A-->B', '-o', out]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.success).toBe(true);
    expect(data.format).toBe('png');
    expect(data.output).toBe(path.resolve(out));
    const buf = await readFile(out);
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(data.bytes).toBe(buf.byteLength);
  });

  it('ascii --json inlines text and reports lines', () => {
    const r = run(['ascii', '--json', '-c', 'graph LR\n  A-->B']);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.schema_version).toBe(1);
    expect(data.success).toBe(true);
    expect(typeof data.text).toBe('string');
    expect(data.text.length).toBeGreaterThan(0);
    expect(data.lines).toBe(data.text.split('\n').length);
    // No ANSI escapes in --json mode.
    expect(data.text).not.toMatch(/\x1b\[/ /* eslint-disable-line no-control-regex */);
  });

  it('doctor --json reports environment with schema v1', () => {
    const r = run(['doctor', '--json']);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.schema_version).toBe(1);
    expect(data.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(data.node_version).toMatch(/^v\d+\./);
    expect(typeof data.platform).toBe('string');
    expect(typeof data.arch).toBe('string');
    expect(Array.isArray(data.fonts.available)).toBe(true);
    expect(typeof data.fonts.primary_family).toBe('string');
    expect(typeof data.fonts.buffers).toBe('number');
    expect(typeof data.wasm_loaded).toBe('boolean');
  });

  it('doctor (human) prints version and check marks', () => {
    const r = run(['doctor']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/bm doctor/);
    expect(r.stdout).toMatch(/version/);
    expect(r.stdout).toMatch(/PNG wasm/);
    expect(r.stdout).toMatch(/fonts/);
  });

  it('ascii --json -o writes file AND inlines text', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-json-'));
    const out = path.join(dir, 'a.txt');
    const r = run(['ascii', '--json', '-c', 'graph LR\n  A-->B', '-o', out]);
    expect(r.status).toBe(0);
    const data = JSON.parse(r.stdout);
    expect(data.output).toBe(path.resolve(out));
    expect(data.text).toBe(await readFile(out, 'utf8'));
  });
});

describe('--json output (errors)', () => {
  it('PNG with --json and no -o returns exit 2 with JSON error', () => {
    const r = run(['render', '--json', '-f', 'png', '-c', 'graph LR\n  A-->B']);
    expect(r.status).toBe(2);
    expect(r.stdout).toBe('');
    const data = JSON.parse(r.stderr);
    expect(data.schema_version).toBe(1);
    expect(data.success).toBe(false);
    expect(data.error.code).toBe(2);
    expect(data.error.message).toMatch(/PNG cannot be inlined/);
  });

  it('unknown theme returns ThemeNotFoundError JSON with suggestions', () => {
    const r = run(['render', '--json', '--theme', 'drakula', '-c', 'graph LR\n  A-->B']);
    expect(r.status).toBe(2);
    const data = JSON.parse(r.stderr);
    expect(data.error.type).toBe('ThemeNotFoundError');
    expect(data.error.suggestions).toContain('dracula');
  });

  it('invalid mermaid returns ParseError JSON with code 3', () => {
    const r = run(['render', '--json', '-c', 'this is not valid']);
    expect(r.status).toBe(3);
    const data = JSON.parse(r.stderr);
    expect(data.error.type).toBe('ParseError');
    expect(data.error.code).toBe(3);
    expect(typeof data.error.source).toBe('string');
  });

  it('missing file returns IoError JSON with code 4', () => {
    const r = run(['render', '--json', 'no-such-file.mmd']);
    expect(r.status).toBe(4);
    const data = JSON.parse(r.stderr);
    expect(data.error.type).toBe('IoError');
    expect(data.error.code).toBe(4);
  });

  it('JSON error output contains no ANSI escape sequences', () => {
    const r = run(['render', '--json', '-c', 'invalid']);
    expect(r.stderr).not.toMatch(/\x1b\[/ /* eslint-disable-line no-control-regex */);
  });
});

describe('--help machine-readability', () => {
  it('render --help lists theme choices including dracula', () => {
    const r = run(['render', '--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/choices:.*dracula/s);
  });

  it('render --help shows numeric defaults', () => {
    const r = run(['render', '--help']);
    expect(r.stdout).toMatch(/--padding\b.*default: 40/);
    expect(r.stdout).toMatch(/--node-spacing\b.*default: 24/);
  });

  it('top-level --help includes Exit codes section', () => {
    const r = run(['--help']);
    expect(r.stdout).toMatch(/Exit codes:/);
    expect(r.stdout).toMatch(/NO_COLOR/);
  });
});
