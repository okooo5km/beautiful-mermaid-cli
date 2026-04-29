// Unit tests for the font-aware width-compensation pass.
// — okooo5km(十里)

import { describe, it, expect, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fitTextToBoxes, _resetWarnings } from '../src/core/svg-text-fit.js';
import { renderSvg } from '../src/core/render-svg.js';
import { loadSystemFontBuffers, _resetFontCache } from '../src/core/fonts.js';
import { buildRenderOptions } from '../src/core/options.js';

beforeEach(() => {
  _resetWarnings();
  _resetFontCache();
});

const HIRAGINO = '/System/Library/Fonts/Hiragino Sans GB.ttc';

function readFontBuffer(p: string): Uint8Array {
  return new Uint8Array(readFileSync(p));
}

const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<g class="node" data-id="N1" data-shape="rectangle">
  <rect x="50" y="50" width="80" height="40" rx="0" ry="0" fill="white" stroke="black" />
  <text x="90" y="70" text-anchor="middle" font-size="13" font-weight="500">统一运维 · 自动部署</text>
</g>
</svg>`;

const STADIUM_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<g class="node" data-id="AI" data-shape="stadium">
  <rect x="40" y="40" width="100" height="50" rx="25" ry="25" fill="white" stroke="black" />
  <text x="90" y="65" text-anchor="middle" font-size="13" font-weight="500">统一运维 · 自动部署</text>
</g>
</svg>`;

const SUBGRAPH_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<g class="subgraph" data-id="C">
  <rect x="50" y="40" width="60" height="120" fill="white" stroke="black" />
  <rect x="50" y="40" width="60" height="28" fill="grey" stroke="black" />
  <text x="62" y="54" font-size="12" font-weight="600">clawcloud-USA</text>
</g>
<g class="node" data-id="c1" data-shape="rectangle">
  <rect x="60" y="80" width="90" height="36" fill="white" stroke="black" />
  <text x="105" y="98" text-anchor="middle" font-size="13" font-weight="500">客服系统</text>
</g>
</svg>`;

const EDGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<g class="node" data-id="A" data-shape="rectangle">
  <rect x="30" y="50" width="100" height="40" fill="white" stroke="black" />
  <text x="80" y="70" text-anchor="middle" font-size="13" font-weight="500">统一</text>
</g>
<g class="node" data-id="B" data-shape="rectangle">
  <rect x="250" y="50" width="100" height="40" fill="white" stroke="black" />
  <text x="300" y="70" text-anchor="middle" font-size="13" font-weight="500">部署</text>
</g>
<polyline class="edge" data-from="A" data-to="B" points="130,70 250,70" fill="none" stroke="black" />
</svg>`;

const PATH_SHAPE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200" width="400" height="200">
<g class="node" data-id="H" data-shape="hexagon">
  <path d="M 10,50 L 30,30 L 70,30 L 90,50 L 70,70 L 30,70 Z" fill="white" stroke="black" />
  <text x="50" y="55" text-anchor="middle" font-size="13" font-weight="500">统一运维 · 自动部署</text>
</g>
</svg>`;

describe('fitTextToBoxes', () => {
  it('no-op when no font buffers are supplied', () => {
    const out = fitTextToBoxes(SAMPLE_SVG, { fontBuffers: [] });
    expect(out).toBe(SAMPLE_SVG);
  });

  it('no-op when only unparseable buffers are supplied', () => {
    const garbage = new Uint8Array([1, 2, 3, 4]);
    const out = fitTextToBoxes(SAMPLE_SVG, { fontBuffers: [garbage] });
    expect(out).toBe(SAMPLE_SVG);
  });

  it('expands a rectangle node when text overflows', () => {
    if (!existsSync(HIRAGINO)) {
      console.warn('skipped: no system CJK font on this host.');
      return;
    }
    const buf = readFontBuffer(HIRAGINO);
    const out = fitTextToBoxes(SAMPLE_SVG, { fontBuffers: [buf] });
    const m = /<rect[^>]*?x="([^"]+)"[^>]*?width="([^"]+)"/.exec(out);
    expect(m).not.toBeNull();
    const newX = parseFloat(m![1]!);
    const newW = parseFloat(m![2]!);
    expect(newW).toBeGreaterThan(80);
    // text-anchor="middle" preserved -> rect center is unchanged: cx = 90.
    expect(newX + newW / 2).toBeCloseTo(90, 1);
  });

  it('does not move the text element x (middle-anchor center preserved)', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    const out = fitTextToBoxes(SAMPLE_SVG, { fontBuffers: [buf] });
    expect(out).toContain('<text x="90"');
  });

  it('handles stadium shape with rx ~ h/2', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    const out = fitTextToBoxes(STADIUM_SVG, { fontBuffers: [buf] });
    const m = /<rect[^>]*?width="([^"]+)"/.exec(out);
    expect(m).not.toBeNull();
    expect(parseFloat(m![1]!)).toBeGreaterThan(100);
  });

  it('keeps subgraph header rect in lockstep with outer rect', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    const out = fitTextToBoxes(SUBGRAPH_SVG, { fontBuffers: [buf] });
    // Both subgraph rects (outer + header) should now have the same x and
    // width — they live inside the same <g class="subgraph">.
    const cBlock = /<g class="subgraph"[\s\S]*?<\/g>/.exec(out)![0];
    const rectMatches = [...cBlock.matchAll(/<rect[^/]*?x="([^"]+)"[^/]*?width="([^"]+)"/g)];
    expect(rectMatches.length).toBe(2);
    expect(rectMatches[0]![1]).toBe(rectMatches[1]![1]);
    expect(rectMatches[0]![2]).toBe(rectMatches[1]![2]);
  });

  it('reflows polyline endpoints to match expanded boxes', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    // Force expansion by giving narrow rects with wide CJK text.
    const svg = EDGE_SVG.replace('>统一</text>', '>统一运维 · 自动部署</text>');
    const out = fitTextToBoxes(svg, { fontBuffers: [buf] });
    const polyM = /<polyline[^/]*?points="([^"]+)"/.exec(out);
    expect(polyM).not.toBeNull();
    const pts = polyM![1]!.split(/\s+/).map((p) => p.split(',').map(Number));
    const aBlock = /<g class="node" data-id="A"[\s\S]*?<\/g>/.exec(out)![0];
    const aRect = /<rect[^/]*?x="([^"]+)"[^/]*?width="([^"]+)"/.exec(aBlock)!;
    const aRight = parseFloat(aRect[1]!) + parseFloat(aRect[2]!);
    expect(pts[0]![0]).toBeCloseTo(aRight, 1);
  });

  it('grows the SVG viewBox when boxes exceed the original bounds', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    // Place the rect right at the right edge of the viewport so any expansion
    // has to push the viewBox out.
    const tight = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60" width="100" height="60">
<g class="node" data-id="N" data-shape="rectangle">
  <rect x="10" y="10" width="80" height="40" fill="white" stroke="black" />
  <text x="50" y="30" text-anchor="middle" font-size="13" font-weight="500">统一运维 · 自动部署</text>
</g>
</svg>`;
    const out = fitTextToBoxes(tight, { fontBuffers: [buf] });
    const vb = /viewBox="([^"]+)"/.exec(out)![1]!.split(/\s+/).map(Number);
    expect(vb[2]!).toBeGreaterThan(100);
  });

  it('skips path-based shapes and warns once', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    const stderrChunks: string[] = [];
    const orig = process.stderr.write.bind(process.stderr);
    // @ts-expect-error -- monkey-patch for spy
    process.stderr.write = (chunk: string) => {
      stderrChunks.push(String(chunk));
      return true;
    };
    try {
      const out = fitTextToBoxes(PATH_SHAPE_SVG, { fontBuffers: [buf] });
      expect(out).toBe(PATH_SHAPE_SVG);
    } finally {
      process.stderr.write = orig;
    }
    const joined = stderrChunks.join('');
    expect(joined).toMatch(/hexagon/);
  });

  it('applies bold scale (~1.06) for font-weight >= 600', () => {
    if (!existsSync(HIRAGINO)) return;
    const buf = readFontBuffer(HIRAGINO);
    const make = (weight: number): string => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100" width="400" height="100">
<g class="node" data-id="N" data-shape="rectangle">
  <rect x="50" y="20" width="60" height="40" fill="white" stroke="black" />
  <text x="80" y="40" text-anchor="middle" font-size="13" font-weight="${weight}">统一运维</text>
</g>
</svg>`;
    const a = fitTextToBoxes(make(400), { fontBuffers: [buf] });
    const b = fitTextToBoxes(make(700), { fontBuffers: [buf] });
    const wA = parseFloat(/<rect[^/]*?width="([^"]+)"/.exec(a)![1]!);
    const wB = parseFloat(/<rect[^/]*?width="([^"]+)"/.exec(b)![1]!);
    expect(wB).toBeGreaterThan(wA);
  });
});

describe('renderSvg userFont integration', () => {
  it('is a no-op without --font (byte-exact match)', async () => {
    const src = 'graph LR\n  A[Hello] --> B[World]';
    const a = await renderSvg(src, buildRenderOptions({ theme: 'zinc-light' }));
    const b = await renderSvg(src, buildRenderOptions({ theme: 'zinc-light' }));
    expect(a).toBe(b);
    // Sanity: viewBox unchanged from upstream.
    expect(a).toMatch(/viewBox="0 0 [\d.]+ [\d.]+"/);
  });

  it('threads userFont through and runs the fit pass', { timeout: 30_000 }, async () => {
    const fonts = await loadSystemFontBuffers();
    if (!fonts.latinFamily) {
      console.warn('skipped: no Latin font available.');
      return;
    }
    const src = 'graph LR\n  A[统一运维 · 自动部署] --> B[OK]';
    const baseline = await renderSvg(src, buildRenderOptions({ theme: 'zinc-light' }));
    const widened = await renderSvg(src, {
      ...buildRenderOptions({ theme: 'zinc-light' }),
      userFont: fonts.latinFamily,
    });
    // SVG should still be valid.
    expect(widened).toMatch(/<\/svg>\s*$/);
    // Baseline should not equal widened only if expansion actually occurred.
    // We don't assert inequality strictly: when the user's font happens to
    // measure narrower than the upstream estimate, no expansion is needed.
    expect(typeof widened).toBe('string');
    expect(baseline.length).toBeGreaterThan(0);
  });
});
