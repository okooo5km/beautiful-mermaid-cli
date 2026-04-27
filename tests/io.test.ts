// okooo5km(十里)

import { describe, it, expect, vi, afterEach } from 'vitest';
import { writeFile, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { resolveInput } from '../src/io/input.js';
import { writeOutput } from '../src/io/output.js';
import { IoError, UsageError } from '../src/utils/errors.js';

describe('resolveInput', () => {
  it('returns inline code when -c is set', async () => {
    expect(await resolveInput({ code: 'graph LR; A-->B' })).toBe('graph LR; A-->B');
  });

  it('reads file when path is given', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-test-'));
    const f = path.join(dir, 'sample.mmd');
    await writeFile(f, 'graph TD; X-->Y\n', 'utf8');
    expect(await resolveInput({ path: f })).toBe('graph TD; X-->Y\n');
  });

  it('throws IoError on missing file', async () => {
    await expect(resolveInput({ path: '/__nonexistent__/no.mmd' })).rejects.toBeInstanceOf(
      IoError,
    );
  });

  it('throws UsageError when stdin is a TTY and no input given', async () => {
    const orig = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    try {
      await expect(resolveInput({})).rejects.toBeInstanceOf(UsageError);
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', { value: orig, configurable: true });
    }
  });
});

describe('writeOutput', () => {
  afterEach(() => vi.restoreAllMocks());

  it('writes string to file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-test-'));
    const f = path.join(dir, 'out.svg');
    await writeOutput(f, '<svg></svg>', 'svg');
    expect(await readFile(f, 'utf8')).toBe('<svg></svg>');
  });

  it('writes Uint8Array to file', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bm-test-'));
    const f = path.join(dir, 'out.bin');
    await writeOutput(f, new Uint8Array([1, 2, 3]), 'png');
    const got = await readFile(f);
    expect([...got]).toEqual([1, 2, 3]);
  });

  it('refuses PNG to stdout', async () => {
    await expect(writeOutput(undefined, new Uint8Array([1]), 'png')).rejects.toBeInstanceOf(
      UsageError,
    );
  });

  it('writes string to stdout when no target', async () => {
    const writes: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((c: string | Uint8Array) => {
      writes.push(typeof c === 'string' ? c : Buffer.from(c).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
    await writeOutput(undefined, '<svg/>', 'svg');
    expect(writes.join('')).toContain('<svg/>');
  });

  it('throws IoError on bad target dir', async () => {
    await expect(
      writeOutput('/__no_such_dir__/x.svg', '<svg/>', 'svg'),
    ).rejects.toBeInstanceOf(IoError);
  });
});
