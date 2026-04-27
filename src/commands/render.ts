// Render subcommand (svg / png) — okooo5km(十里)

import { THEMES } from 'beautiful-mermaid';
import { renderSvg } from '../core/render-svg.js';
import { svgToPng } from '../core/render-png.js';
import {
  buildRenderOptions,
  listThemeNames,
  type CliRenderFlags,
} from '../core/options.js';
import { resolveInput } from '../io/input.js';
import { writeOutput } from '../io/output.js';
import { resolveFormat } from '../utils/format.js';
import {
  ParseError,
  ThemeNotFoundError,
  UsageError,
  suggestThemeName,
} from '../utils/errors.js';

export interface RenderCommandFlags extends CliRenderFlags {
  format?: string;
  scale?: number;
  width?: number;
  output?: string;
  code?: string;
}

export async function renderAction(
  input: string | undefined,
  flags: RenderCommandFlags,
): Promise<void> {
  if (flags.theme !== undefined && !THEMES[flags.theme]) {
    throw new ThemeNotFoundError(
      flags.theme,
      suggestThemeName(flags.theme, listThemeNames()),
    );
  }

  const source = await resolveInput({ path: input, code: flags.code });
  const format = resolveFormat({
    format: flags.format,
    output: flags.output,
    defaultFormat: 'svg',
  });
  if (format === 'ascii') {
    throw new UsageError('Use `bm ascii` for ASCII output.');
  }

  const opts = buildRenderOptions(flags);
  let svg: string;
  try {
    svg = renderSvg(source, opts);
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : String(e), source);
  }

  if (format === 'svg') {
    await writeOutput(flags.output, svg, 'svg');
    return;
  }

  const png = await svgToPng(svg, { scale: flags.scale, width: flags.width });
  await writeOutput(flags.output, png, 'png');
}
