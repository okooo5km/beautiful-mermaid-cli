// Fonts subcommand: enumerate system fonts. — okooo5km(十里)

import pc from 'picocolors';
import { enumerateFonts, type FontInfo } from '../core/font-discovery.js';

export type FontsFilter = 'latin' | 'cjk' | 'emoji' | 'mono';

export interface FontsCommandOptions {
  json?: boolean;
  filter?: FontsFilter;
}

interface FontJsonEntry {
  family: string;
  postscript_name?: string;
  path: string;
  index?: number;
  coverage: Array<'latin' | 'cjk' | 'emoji'>;
  is_monospace: boolean;
  style?: string;
}

interface FontsJsonOutput {
  schema_version: 1;
  fonts: FontJsonEntry[];
  count: number;
}

function applyFilter(fonts: FontInfo[], filter?: FontsFilter): FontInfo[] {
  if (!filter) return fonts;
  switch (filter) {
    case 'latin':
      return fonts.filter((f) => f.coverage.includes('latin'));
    case 'cjk':
      return fonts.filter((f) => f.coverage.includes('cjk'));
    case 'emoji':
      return fonts.filter((f) => f.coverage.includes('emoji'));
    case 'mono':
      return fonts.filter((f) => f.isMonospace);
  }
}

function toJsonEntry(f: FontInfo): FontJsonEntry {
  const e: FontJsonEntry = {
    family: f.family,
    path: f.path,
    coverage: f.coverage,
    is_monospace: f.isMonospace,
  };
  if (f.postscriptName) e.postscript_name = f.postscriptName;
  if (f.index !== undefined) e.index = f.index;
  if (f.style) e.style = f.style;
  return e;
}

export async function fontsCommand(opts: FontsCommandOptions = {}): Promise<void> {
  const all = await enumerateFonts();
  const filtered = applyFilter(all, opts.filter);

  if (opts.json) {
    const payload: FontsJsonOutput = {
      schema_version: 1,
      fonts: filtered.map(toJsonEntry),
      count: filtered.length,
    };
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }

  const useColor = !process.env.NO_COLOR && Boolean(process.stdout.isTTY);
  const dim = useColor ? pc.dim : (s: string) => s;
  const bold = useColor ? pc.bold : (s: string) => s;
  const tag = useColor
    ? {
        latin: pc.cyan('latin'),
        cjk: pc.magenta('cjk'),
        emoji: pc.green('emoji'),
        mono: pc.yellow('mono'),
      }
    : { latin: 'latin', cjk: 'cjk', emoji: 'emoji', mono: 'mono' };

  // Group by primary family (collapse face variants under one family line, with
  // a face count). This keeps the human output scannable while JSON keeps every
  // face addressable.
  const byFamily = new Map<string, FontInfo[]>();
  for (const f of filtered) {
    const arr = byFamily.get(f.family) ?? [];
    arr.push(f);
    byFamily.set(f.family, arr);
  }

  const lines: string[] = [];
  lines.push(
    bold(
      `bm fonts${opts.filter ? ` (filter: ${opts.filter})` : ''} — ${byFamily.size} families, ${filtered.length} faces`,
    ),
  );
  for (const [family, faces] of byFamily) {
    const head = faces[0]!;
    const tags: string[] = [];
    for (const c of head.coverage) {
      if (c === 'latin') tags.push(tag.latin);
      else if (c === 'cjk') tags.push(tag.cjk);
      else if (c === 'emoji') tags.push(tag.emoji);
    }
    if (head.isMonospace) tags.push(tag.mono);
    const facesNote = faces.length > 1 ? dim(` ×${faces.length}`) : '';
    lines.push(`  ${family}${facesNote}  ${dim('[')}${tags.join(' ')}${dim(']')}`);
  }
  process.stdout.write(lines.join('\n') + '\n');
}
