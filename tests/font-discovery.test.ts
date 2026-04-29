// Unit tests for font discovery via fontkit. — okooo5km(十里)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  enumerateFonts,
  findFontByFamily,
  loadFontFile,
  _resetEnumerationCache,
} from '../src/core/font-discovery.js';

beforeEach(() => {
  _resetEnumerationCache();
});

describe('font discovery', () => {
  it(
    'enumerateFonts returns at least one font on this host',
    async () => {
      const fonts = await enumerateFonts();
      expect(fonts.length).toBeGreaterThan(0);
      // Sanity: every entry has a family + path.
      for (const f of fonts) {
        expect(typeof f.family).toBe('string');
        expect(f.family.length).toBeGreaterThan(0);
        expect(typeof f.path).toBe('string');
        expect(f.path.length).toBeGreaterThan(0);
      }
    },
    20_000,
  );

  it(
    'findFontByFamily returns null for clearly absent name',
    async () => {
      const r = await findFontByFamily('zzzzzzzzz-not-a-font-name');
      expect(r).toBeNull();
    },
    20_000,
  );

  it(
    'findFontByFamily resolves a common family present on every supported OS',
    async () => {
      const candidates = ['Helvetica', 'Arial', 'DejaVu Sans', 'Liberation Sans', 'Segoe UI'];
      let hit = null;
      for (const name of candidates) {
        const r = await findFontByFamily(name);
        if (r) {
          hit = { name, info: r };
          break;
        }
      }
      // On a CI host that lacks all of these, this would be null — that
      // shouldn't happen on macOS / Windows / our Linux fixture, but soft-skip
      // rather than fail to keep the test resilient if a runner ever drops a
      // baseline Latin font.
      if (!hit) {
        console.warn('skipped: no baseline Latin family found among candidates');
        return;
      }
      expect(hit.info.family).toMatch(/.+/);
      expect(hit.info.path).toMatch(/\.(ttf|otf|ttc|otc)$/i);
    },
    20_000,
  );

  it(
    'loadFontFile reads a real font file by path',
    async () => {
      // Pick the first enumerated font and feed its path back in.
      const all = await enumerateFonts();
      const sample = all.find((f) => /\.(ttf|otf)$/i.test(f.path)) ?? all[0]!;
      const r = await loadFontFile(sample.path);
      expect(r.buffer.byteLength).toBeGreaterThan(100);
      expect(r.family.length).toBeGreaterThan(0);
    },
    20_000,
  );
});
