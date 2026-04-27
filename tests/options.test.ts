// okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { buildRenderOptions, getThemeColors, listThemeNames } from '../src/core/options.js';

describe('buildRenderOptions', () => {
  it('returns empty object when no flags given', () => {
    expect(buildRenderOptions({})).toEqual({});
  });

  it('applies a known theme', () => {
    const opts = buildRenderOptions({ theme: 'dracula' });
    expect(opts.bg).toBeDefined();
    expect(opts.fg).toBeDefined();
  });

  it('layers overrides on top of theme', () => {
    const opts = buildRenderOptions({ theme: 'dracula', bg: '#000000' });
    expect(opts.bg).toBe('#000000');
    expect(opts.fg).toBe(getThemeColors('dracula')!.fg);
  });

  it('passes through numeric and boolean flags', () => {
    const opts = buildRenderOptions({ padding: 50, nodeSpacing: 30, transparent: true });
    expect(opts.padding).toBe(50);
    expect(opts.nodeSpacing).toBe(30);
    expect(opts.transparent).toBe(true);
  });

  it('throws on unknown theme', () => {
    expect(() => buildRenderOptions({ theme: 'nonsense' })).toThrow(/Unknown theme/);
  });
});

describe('listThemeNames', () => {
  it('returns 15 sorted names including dracula', () => {
    const names = listThemeNames();
    expect(names).toHaveLength(15);
    expect([...names].sort()).toEqual(names);
    expect(names).toContain('dracula');
    expect(names).toContain('zinc-light');
    expect(names).toContain('tokyo-night');
  });
});
