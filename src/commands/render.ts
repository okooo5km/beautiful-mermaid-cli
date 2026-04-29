// Render subcommand (svg / png) — okooo5km(十里)

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
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
  IoError,
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
  json?: boolean;
}

interface SvgDimensions {
  width: number;
  height: number;
}

interface RenderJsonOutput {
  schema_version: 1;
  success: true;
  format: 'svg' | 'png';
  output?: string;
  bytes: number;
  theme?: string;
  dimensions: SvgDimensions | null;
  svg?: string;
}

function extractSvgDimensions(svg: string): SvgDimensions | null {
  const m = /viewBox\s*=\s*"([^"]+)"/.exec(svg);
  if (m) {
    const parts = m[1]!.trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      return { width: parts[2]!, height: parts[3]! };
    }
  }
  const w = /\bwidth\s*=\s*"([\d.]+)"/.exec(svg);
  const h = /\bheight\s*=\s*"([\d.]+)"/.exec(svg);
  if (w && h) {
    return { width: parseFloat(w[1]!), height: parseFloat(h[1]!) };
  }
  return null;
}

async function writeFileSafe(target: string, data: string | Uint8Array): Promise<void> {
  try {
    await writeFile(target, data);
  } catch (e) {
    const err = e as Error & { code?: string };
    throw new IoError(`Failed to write ${target}: ${err.message}`);
  }
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

  // PNG cannot be inlined in JSON; require -o so the binary lands in a file.
  if (flags.json && format === 'png' && flags.output === undefined) {
    throw new UsageError('PNG cannot be inlined in JSON; provide -o <file>.');
  }

  const opts = buildRenderOptions(flags);
  let svg: string;
  try {
    svg = renderSvg(source, opts);
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : String(e), source);
  }

  if (format === 'svg') {
    if (flags.json) {
      const dims = extractSvgDimensions(svg);
      const payload: RenderJsonOutput = {
        schema_version: 1,
        success: true,
        format: 'svg',
        bytes: Buffer.byteLength(svg, 'utf8'),
        dimensions: dims,
      };
      if (flags.theme !== undefined) payload.theme = flags.theme;
      if (flags.output !== undefined) {
        await writeFileSafe(flags.output, svg);
        payload.output = path.resolve(flags.output);
      } else {
        // No -o: inline the SVG so agents can use it without a temp file.
        payload.svg = svg;
      }
      process.stdout.write(JSON.stringify(payload) + '\n');
      return;
    }
    await writeOutput(flags.output, svg, 'svg');
    return;
  }

  const png = await svgToPng(svg, {
    ...(flags.scale !== undefined ? { scale: flags.scale } : {}),
    ...(flags.width !== undefined ? { width: flags.width } : {}),
    ...(flags.font !== undefined ? { font: flags.font } : {}),
    ...(flags.fontMono !== undefined ? { fontMono: flags.fontMono } : {}),
    ...(flags.fontFile !== undefined ? { fontFile: flags.fontFile } : {}),
  });
  if (flags.json) {
    // PNG always has -o here (guarded above).
    await writeFileSafe(flags.output!, png);
    const dims = extractSvgDimensions(svg);
    const payload: RenderJsonOutput = {
      schema_version: 1,
      success: true,
      format: 'png',
      output: path.resolve(flags.output!),
      bytes: png.byteLength,
      dimensions: dims,
    };
    if (flags.theme !== undefined) payload.theme = flags.theme;
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }
  await writeOutput(flags.output, png, 'png');
}
