import { describe, it, expect } from 'vitest';
import { flattenSvgForRaster } from '../src/core/svg-flatten';

const wrap = (style: string, body: string, rootStyle = '--bg:#FFFFFF;--fg:#000000'): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" style="${rootStyle}">
<style>
  ${style}
</style>
${body}
</svg>`;

describe('flattenSvgForRaster · CSS variable resolution', () => {
  it('resolves var(--fg) directly', () => {
    const svg = wrap('svg { --_text: var(--fg); }', '<text fill="var(--_text)">hi</text>');
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('fill="#000000"');
  });

  it('resolves var(--missing, fallback)', () => {
    const svg = wrap(
      'svg { --_x: var(--no-such, #ff0000); }',
      '<rect fill="var(--_x)" />',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('fill="#ff0000"');
  });

  it('resolves nested var → var → hex', () => {
    const svg = wrap(
      'svg { --_a: var(--_b); --_b: var(--fg); }',
      '<rect fill="var(--_a)" />',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('fill="#000000"');
  });

  it('falls back to #000000 for unresolved chain', () => {
    const svg = wrap('', '<rect fill="var(--unknown)" />');
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('fill="#000000"');
  });
});

describe('flattenSvgForRaster · color-mix()', () => {
  it('mixes two hex colors with both percentages', () => {
    // 50% of #000 + 50% of #FFF = #808080 (rounded)
    const svg = wrap(
      'svg { --_x: color-mix(in srgb, #000000 50%, #FFFFFF 50%); }',
      '<rect fill="var(--_x)" />',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toMatch(/fill="#80808[01]"/i); // tolerate rounding
  });

  it('infers second percentage when only first given', () => {
    // 60% of #000000 + (40%) #FFFFFF = #666666
    const svg = wrap(
      'svg { --_x: color-mix(in srgb, #000000 60%, #FFFFFF); }',
      '<rect fill="var(--_x)" />',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toMatch(/fill="#66666[56]"/i);
  });

  it('resolves color-mix referencing var(--fg) and var(--bg)', () => {
    // mix #27272A 60%, #FFFFFF 40% — typical beautiful-mermaid muted text
    const svg = wrap(
      'svg { --_text-sec: color-mix(in srgb, var(--fg) 60%, var(--bg) 40%); }',
      '<text fill="var(--_text-sec)">x</text>',
      '--bg:#FFFFFF;--fg:#27272A',
    );
    const out = flattenSvgForRaster(svg);
    // expected ≈ #7d7d7f (60% of 0x27=39 + 40% of 0xFF=255 ≈ 125 → 0x7d)
    expect(out).toMatch(/fill="#7d7d7[ef]"/i);
  });

  it('uses var fallback when surface is undefined and computes color-mix fallback', () => {
    // --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg)))
    // --surface absent → color-mix(in srgb, #000 3%, #FFF) = ~ #f7f7f7
    const svg = wrap(
      'svg { --_node-fill: var(--surface, color-mix(in srgb, var(--fg) 3%, var(--bg))); }',
      '<rect fill="var(--_node-fill)" />',
      '--bg:#FFFFFF;--fg:#000000',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toMatch(/fill="#f[7-8]f[7-8]f[7-8]"/i);
  });
});

describe('flattenSvgForRaster · structural rewrites', () => {
  it('strips @import url(...) lines from <style>', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="--bg:#FFF;--fg:#000">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter');
  text { font-family: 'Inter', sans-serif; }
</style>
</svg>`;
    const out = flattenSvgForRaster(svg);
    expect(out).not.toContain('@import');
    expect(out).not.toContain('googleapis.com');
  });

  it('replaces font-family in <style> rules', () => {
    const svg = wrap(
      "text { font-family: 'Inter', system-ui, sans-serif; }",
      '<text>x</text>',
    );
    const out = flattenSvgForRaster(svg, { fontFamily: 'Helvetica' });
    expect(out).toContain('font-family: Helvetica');
    expect(out).not.toContain("'Inter'");
    expect(out).not.toContain('system-ui');
  });

  it('replaces font-family attribute on text elements', () => {
    const svg = wrap('', '<text font-family="Inter">x</text>');
    const out = flattenSvgForRaster(svg, { fontFamily: 'Arial' });
    expect(out).toContain('font-family="Arial"');
  });

  it('substitutes var(--bg) inside background style', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" style="--bg:#abcdef;background:var(--bg)">
<style>svg { --_x: var(--fg); }</style>
</svg>`;
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('background:#abcdef');
    expect(out).not.toContain('background:var(');
  });
});

describe('flattenSvgForRaster · degenerate inputs', () => {
  it('returns input mostly unchanged when there is no <style> block', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="#abc" /></svg>';
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('<rect fill="#abc"');
  });

  it('handles empty style block without throwing', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><style></style></svg>';
    expect(() => flattenSvgForRaster(svg)).not.toThrow();
  });

  it('ignores CSS comments in <style> when extracting vars', () => {
    const svg = wrap(
      `/* --bg should not be picked up */
       svg { --_x: var(--fg); }`,
      '<rect fill="var(--_x)" />',
    );
    const out = flattenSvgForRaster(svg);
    expect(out).toContain('fill="#000000"');
  });
});
