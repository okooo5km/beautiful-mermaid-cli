// ASCII subcommand — okooo5km(十里)

import { THEMES } from 'beautiful-mermaid';
import { renderAscii, type AsciiCliFlags } from '../core/render-ascii.js';
import { listThemeNames } from '../core/options.js';
import { resolveInput } from '../io/input.js';
import { writeOutput } from '../io/output.js';
import { ParseError, ThemeNotFoundError, suggestThemeName } from '../utils/errors.js';

export interface AsciiCommandFlags extends AsciiCliFlags {
  output?: string;
  code?: string;
}

export async function asciiAction(
  input: string | undefined,
  flags: AsciiCommandFlags,
): Promise<void> {
  if (flags.theme !== undefined && !THEMES[flags.theme]) {
    throw new ThemeNotFoundError(
      flags.theme,
      suggestThemeName(flags.theme, listThemeNames()),
    );
  }

  const source = await resolveInput({ path: input, code: flags.code });

  // Auto-suppress color when piping to a non-TTY (avoid garbled escapes).
  const effective: AsciiCliFlags = { ...flags };
  if (effective.colorMode === undefined && !process.stdout.isTTY) {
    effective.colorMode = 'none';
  }

  let out: string;
  try {
    out = renderAscii(source, effective);
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : String(e), source);
  }

  await writeOutput(flags.output, out, 'ascii');
}
