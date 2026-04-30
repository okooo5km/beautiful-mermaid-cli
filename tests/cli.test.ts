// okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

// dist/ is built once by tests/global-setup.ts (vitest globalSetup).
const CLI = path.resolve('dist', 'cli.js');

interface RunOptions {
  input?: string;
  cwd?: string;
}
interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function run(args: string[], opts: RunOptions = {}): RunResult {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    input: opts.input,
    cwd: opts.cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

describe('CLI integration', () => {
  it('themes -q lists 15 names', () => {
    const r = run(['themes', '-q']);
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split(/\r?\n/);
    expect(lines).toHaveLength(15);
    expect(lines).toContain('dracula');
  });

  it('--version exits 0 with semver string', () => {
    const r = run(['--version']);
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('renders SVG to file via -c', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-cli-'));
    const out = path.join(dir, 'a.svg');
    const r = run(['render', '-c', 'graph LR\n  A-->B', '-o', out]);
    expect(r.status).toBe(0);
    expect(await readFile(out, 'utf8')).toMatch(/<\/svg>/);
  });

  it('renders PNG to file', { timeout: 15_000 }, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-cli-'));
    const out = path.join(dir, 'a.png');
    const r = run(['render', '-c', 'graph LR\n  A-->B', '-o', out]);
    expect(r.status).toBe(0);
    const buf = await readFile(out);
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  });

  it('renders SVG to stdout when no -o', () => {
    const r = run(['render', '-c', 'graph LR\n  A-->B']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/<\/svg>/);
  });

  it('reads from stdin', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-cli-'));
    const out = path.join(dir, 'a.svg');
    const r = run(['render', '-o', out], { input: 'graph LR\n  A-->B' });
    expect(r.status).toBe(0);
    expect(await readFile(out, 'utf8')).toMatch(/<\/svg>/);
  });

  it('default subcommand: bm <file> -o <out> falls into render', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-cli-'));
    const out = path.join(dir, 'a.svg');
    const r = run(['tests/fixtures/flowchart.mmd', '-o', out]);
    expect(r.status).toBe(0);
    expect(await readFile(out, 'utf8')).toMatch(/<\/svg>/);
  });

  it('exit 2: PNG to stdout', () => {
    const r = run(['render', '-c', 'graph LR\n  A-->B', '-f', 'png']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/PNG cannot be written to stdout/);
  });

  it('exit 2: unknown theme with suggestion', () => {
    const r = run(['render', '-c', 'graph LR\n  A-->B', '--theme', 'drakula']);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Did you mean: dracula/);
  });

  it('exit 3: invalid mermaid', () => {
    const r = run(['render', '-c', 'this is not valid']);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/Parse error/);
  });

  it('exit 4: file not found', () => {
    const r = run(['render', 'no-such-file.mmd']);
    expect(r.status).toBe(4);
    expect(r.stderr).toMatch(/File not found/);
  });

  it('ascii produces non-empty output with box-drawing characters', () => {
    const r = run(['ascii', 'tests/fixtures/flowchart.mmd', '--color-mode', 'none']);
    expect(r.status).toBe(0);
    expect(r.stdout.length).toBeGreaterThan(20);
    expect(r.stdout).toMatch(/[│┌─└|+-]/);
  });
});
