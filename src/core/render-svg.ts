// SVG renderer — okooo5km(十里)

import { renderMermaidSVG, type RenderOptions } from 'beautiful-mermaid';

export interface SvgRenderOptions extends RenderOptions {
  /** Optional: family name passed via `--font`. When set, the SVG is post-
   *  processed to remeasure each text node against the user's font (via
   *  fontkit) and expand the surrounding rect so CJK / wide glyphs fit. */
  userFont?: string;
  /** Optional: absolute path passed via `--font-file`. Same semantics as
   *  `userFont` but skips system font discovery. */
  userFontFile?: string;
}

export async function renderSvg(source: string, opts: SvgRenderOptions = {}): Promise<string> {
  const { userFont, userFontFile, ...renderOpts } = opts;
  const svg = renderMermaidSVG(source, renderOpts);
  if (!userFont && !userFontFile) return svg;
  // Lazy-load the fit pass + fontkit only when actually needed. Keeping
  // these out of the cold-start import graph saves ~150ms on slow runners
  // (Bun on Windows) for every invocation that doesn't pass --font.
  const [{ fitTextToBoxes }, { loadSystemFontBuffers }] = await Promise.all([
    import('./svg-text-fit.js'),
    import('./fonts.js'),
  ]);
  const fonts = await loadSystemFontBuffers({
    ...(userFont ? { font: userFont } : {}),
    ...(userFontFile ? { fontFile: userFontFile } : {}),
  });
  // No user font resolved -> nothing to compensate for; bail out.
  if (!fonts.userFamily && !userFontFile) return svg;
  return fitTextToBoxes(svg, {
    fontBuffers: fonts.buffers,
    primaryFamily: fonts.userFamily ?? fonts.primaryFamily,
  });
}
