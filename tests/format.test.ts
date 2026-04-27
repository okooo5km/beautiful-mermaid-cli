// okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { resolveFormat } from '../src/utils/format.js';
import { UsageError } from '../src/utils/errors.js';

describe('resolveFormat', () => {
  it('honors -f flag', () => {
    expect(resolveFormat({ format: 'svg' })).toBe('svg');
    expect(resolveFormat({ format: 'png' })).toBe('png');
    expect(resolveFormat({ format: 'ascii' })).toBe('ascii');
    expect(resolveFormat({ format: 'txt' })).toBe('ascii');
    expect(resolveFormat({ format: 'PNG' })).toBe('png');
  });

  it('falls back to extension', () => {
    expect(resolveFormat({ output: 'a.svg' })).toBe('svg');
    expect(resolveFormat({ output: 'a.png' })).toBe('png');
    expect(resolveFormat({ output: 'a.txt' })).toBe('ascii');
    expect(resolveFormat({ output: 'a.ascii' })).toBe('ascii');
    expect(resolveFormat({ output: 'a.SVG' })).toBe('svg');
  });

  it('uses defaultFormat when nothing else hints', () => {
    expect(resolveFormat({})).toBe('svg');
    expect(resolveFormat({ defaultFormat: 'ascii' })).toBe('ascii');
  });

  it('flag wins over extension', () => {
    expect(resolveFormat({ format: 'png', output: 'a.svg' })).toBe('png');
  });

  it('unknown extension falls through to default', () => {
    expect(resolveFormat({ output: 'a.unknown' })).toBe('svg');
  });

  it('throws UsageError for unsupported -f value', () => {
    expect(() => resolveFormat({ format: 'pdf' })).toThrow(UsageError);
  });
});
