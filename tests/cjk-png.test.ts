// CJK PNG rendering — verifies the per-glyph fallback pipeline end-to-end.
// — okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { renderSvg } from '../src/core/render-svg.js';
import { svgToPng } from '../src/core/render-png.js';
import { buildRenderOptions } from '../src/core/options.js';
import { loadSystemFontBuffers } from '../src/core/fonts.js';

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

const CJK_SOURCE = `graph LR
    A[中文测试] --> B[日本語]
    B --> C[한국어]
    C --> D[English]`;

describe('CJK PNG rendering', () => {
  it(
    'emits a valid PNG for a Mermaid diagram containing CJK text',
    async () => {
      const svg = await renderSvg(CJK_SOURCE, buildRenderOptions({ theme: 'zinc-light' }));
      // The SVG must carry the CJK characters before we hand it to resvg.
      expect(svg).toMatch(/中文测试/);

      const png = await svgToPng(svg);
      expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
      expect(png.byteLength).toBeGreaterThan(100);
    },
    30_000,
  );

  it('reports a CJK family in fonts metadata when one is available', async () => {
    const fonts = await loadSystemFontBuffers();
    if (!fonts.cjkFamily) {
      // CI runner without CJK fonts (e.g. minimal Linux without
      // fonts-noto-cjk) — soft-skip. The svgToPng test above already
      // covers the no-CJK-font code path.
      console.warn(
        'skipped: no CJK font on this host; install fonts-noto-cjk or equivalent to enable.',
      );
      return;
    }
    expect(typeof fonts.cjkFamily).toBe('string');
    expect(fonts.cjkFamily!.length).toBeGreaterThan(0);
  });

  it(
    'accepts --font override and threads it through to the PNG render',
    async () => {
      // Pick whatever Latin family we already loaded as a known-present
      // override. This test asserts that LoadedFonts.userFamily gets populated
      // when the user passes --font, and that PNG render still succeeds.
      const baseline = await loadSystemFontBuffers();
      if (!baseline.latinFamily) {
        console.warn('skipped: no Latin font on this host to use as override.');
        return;
      }
      const withOverride = await loadSystemFontBuffers({ font: baseline.latinFamily });
      expect(withOverride.userFamily).toBeTruthy();

      const svg = await renderSvg(CJK_SOURCE, buildRenderOptions({ theme: 'zinc-light' }));
      const png = await svgToPng(svg, { font: baseline.latinFamily });
      expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
      expect(png.byteLength).toBeGreaterThan(100);
    },
    30_000,
  );

  it(
    'warns and degrades gracefully when --font cannot be resolved',
    async () => {
      const svg = await renderSvg(
        'graph LR\n    A[hello]-->B[world]',
        buildRenderOptions({ theme: 'zinc-light' }),
      );
      // We do not assert the warning text here (it's gated by warnOnce per
      // process); we just want the render to succeed despite a bogus override.
      const png = await svgToPng(svg, { font: 'definitely-not-a-real-font-zzzzz' });
      expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
    },
    30_000,
  );
});
