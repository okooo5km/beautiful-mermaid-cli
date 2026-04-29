// okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { renderSvg } from '../src/core/render-svg.js';
import { svgToPng } from '../src/core/render-png.js';
import { buildRenderOptions } from '../src/core/options.js';

const FIXTURES = ['flowchart', 'sequence', 'class', 'state', 'er'] as const;
const THEMES = ['zinc-light', 'zinc-dark', 'dracula'] as const;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

async function loadFixture(name: string): Promise<string> {
  return readFile(path.join('tests', 'fixtures', `${name}.mmd`), 'utf8');
}

describe('SVG render matrix', () => {
  for (const fixture of FIXTURES) {
    for (const theme of THEMES) {
      it(`${fixture} × ${theme} -> valid SVG`, async () => {
        const src = await loadFixture(fixture);
        const svg = await renderSvg(src, buildRenderOptions({ theme }));
        expect(svg).toMatch(/<svg[\s>]/);
        expect(svg).toMatch(/<\/svg>\s*$/);
      });
    }
  }
});

describe('PNG render matrix', () => {
  for (const fixture of FIXTURES) {
    for (const theme of THEMES) {
      it(
        `${fixture} × ${theme} -> valid PNG`,
        async () => {
          const src = await loadFixture(fixture);
          const svg = await renderSvg(src, buildRenderOptions({ theme }));
          const png = await svgToPng(svg);
          expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
          expect(png.byteLength).toBeGreaterThan(100);
        },
        30_000,
      );
    }
  }
});
