// okooo5km(十里)

import { describe, it, expect } from 'vitest';
import {
  CliError,
  UsageError,
  ParseError,
  IoError,
  WasmError,
  ThemeNotFoundError,
  levenshtein,
  suggestThemeName,
  formatError,
} from '../src/utils/errors.js';
import { listThemeNames } from '../src/core/options.js';

describe('CliError exit codes', () => {
  it.each([
    ['CliError', new CliError('x'), 1],
    ['UsageError', new UsageError('x'), 2],
    ['ThemeNotFoundError', new ThemeNotFoundError('x', []), 2],
    ['ParseError', new ParseError('x'), 3],
    ['IoError', new IoError('x'), 4],
    ['WasmError', new WasmError('x'), 1],
  ] as const)('%s carries code %i', (_name, err, code) => {
    expect(err.code).toBe(code);
  });
});

describe('ThemeNotFoundError message', () => {
  it('includes suggestions when present', () => {
    const e = new ThemeNotFoundError('drakula', ['dracula']);
    expect(e.message).toMatch(/Did you mean: dracula/);
  });
  it('omits suggestions when empty', () => {
    const e = new ThemeNotFoundError('xx', []);
    expect(e.message).not.toMatch(/Did you mean/);
  });
});

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0);
  });
  it('counts single-character edits', () => {
    expect(levenshtein('cat', 'cut')).toBe(1);
    expect(levenshtein('kitten', 'sitting')).toBe(3);
  });
  it('handles empty inputs', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
    expect(levenshtein('', '')).toBe(0);
  });
});

describe('suggestThemeName', () => {
  it('suggests dracula for a drakula typo', () => {
    expect(suggestThemeName('drakula', listThemeNames())).toContain('dracula');
  });
  it('returns at most topN entries', () => {
    expect(suggestThemeName('xyzqwerty', listThemeNames(), 3).length).toBeLessThanOrEqual(3);
  });
  it('is case insensitive', () => {
    expect(suggestThemeName('DRACULA', listThemeNames())).toContain('dracula');
  });
});

describe('formatError', () => {
  it('formats ParseError with header', () => {
    const out = formatError(new ParseError('boom'));
    expect(out).toMatch(/Parse error/);
    expect(out).toMatch(/boom/);
  });
  it('extracts source context when message has line N', () => {
    const src = 'graph LR\n  A-->B\n  bad line\n  C-->D\n';
    const out = formatError(new ParseError('Syntax error on line 3', src));
    expect(out).toMatch(/bad line/);
  });
  it('formats unknown errors', () => {
    expect(formatError(new Error('whatever'))).toMatch(/whatever/);
  });
});
