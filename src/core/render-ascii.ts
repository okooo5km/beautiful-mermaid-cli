// ASCII renderer — okooo5km(十里)

import { renderMermaidASCII, type AsciiRenderOptions } from '../ascii/index.js';
import { getThemeColors } from './options.js';

export interface AsciiCliFlags {
  theme?: string;
  useAscii?: boolean;
  paddingX?: number;
  paddingY?: number;
  boxBorderPadding?: number;
  colorMode?: AsciiRenderOptions['colorMode'];
}

export function renderAscii(source: string, flags: AsciiCliFlags = {}): string {
  const opts: AsciiRenderOptions = {};
  if (flags.useAscii !== undefined) opts.useAscii = flags.useAscii;
  if (flags.paddingX !== undefined) opts.paddingX = flags.paddingX;
  if (flags.paddingY !== undefined) opts.paddingY = flags.paddingY;
  if (flags.boxBorderPadding !== undefined) opts.boxBorderPadding = flags.boxBorderPadding;
  if (flags.colorMode !== undefined) opts.colorMode = flags.colorMode;

  if (flags.theme !== undefined) {
    const theme = getThemeColors(flags.theme);
    if (!theme) throw new Error(`Unknown theme: ${flags.theme}`);
    opts.theme = {
      fg: theme.fg,
      border: theme.border ?? theme.fg,
      line: theme.line ?? theme.fg,
      arrow: theme.accent ?? theme.fg,
      ...(theme.accent ? { accent: theme.accent } : {}),
      ...(theme.bg ? { bg: theme.bg } : {}),
    };
  }

  return renderMermaidASCII(source, opts);
}
