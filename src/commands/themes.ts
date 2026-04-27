// Themes subcommand — okooo5km(十里)

import { THEMES } from 'beautiful-mermaid';
import { listThemeNames } from '../core/options.js';

export interface ThemesCommandOptions {
  quiet?: boolean;
  noColor?: boolean;
}

function hexToAnsiBlock(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!m) return '  ';
  const n = parseInt(m[1]!, 16);
  const r = (n >> 16) & 0xff;
  const g = (n >> 8) & 0xff;
  const b = n & 0xff;
  return `\x1b[48;2;${r};${g};${b}m  \x1b[0m`;
}

export function themesCommand(opts: ThemesCommandOptions = {}): void {
  const useColor =
    !opts.noColor &&
    !opts.quiet &&
    !process.env.NO_COLOR &&
    Boolean(process.stdout.isTTY);

  for (const name of listThemeNames()) {
    if (opts.quiet) {
      process.stdout.write(`${name}\n`);
      continue;
    }
    const t = THEMES[name]!;
    if (useColor) {
      const bg = hexToAnsiBlock(t.bg);
      const fg = hexToAnsiBlock(t.fg);
      const ac = hexToAnsiBlock(t.accent ?? t.fg);
      process.stdout.write(`${bg}${fg}${ac}  ${name}\n`);
    } else {
      const accentPart = t.accent ? ` accent=${t.accent}` : '';
      process.stdout.write(`${name}  bg=${t.bg} fg=${t.fg}${accentPart}\n`);
    }
  }
}
