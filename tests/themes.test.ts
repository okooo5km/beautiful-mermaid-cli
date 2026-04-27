// okooo5km(十里)

import { describe, it, expect, vi } from 'vitest';
import { themesCommand } from '../src/commands/themes.js';

function captureStdout(fn: () => void): string {
  const writes: string[] = [];
  const spy = vi
    .spyOn(process.stdout, 'write')
    .mockImplementation(((chunk: string | Uint8Array): boolean => {
      writes.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return true;
    }) as typeof process.stdout.write);
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return writes.join('');
}

describe('themesCommand', () => {
  it('prints all 15 theme names in quiet mode', () => {
    const out = captureStdout(() => themesCommand({ quiet: true }));
    const lines = out.trim().split('\n');
    expect(lines).toHaveLength(15);
    expect(lines).toContain('dracula');
    expect(lines).toContain('zinc-light');
    expect(lines).toContain('tokyo-night');
  });

  const ESC = String.fromCharCode(27);

  it('quiet mode emits no ANSI escape codes', () => {
    const out = captureStdout(() => themesCommand({ quiet: true }));
    expect(out.includes(ESC)).toBe(false);
  });

  it('noColor mode emits hex codes in plain text', () => {
    const out = captureStdout(() => themesCommand({ noColor: true }));
    expect(out.includes(ESC)).toBe(false);
    expect(out).toMatch(/bg=#/);
    expect(out).toMatch(/fg=#/);
  });
});
