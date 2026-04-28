// ASCII subcommand — okooo5km(十里)

import path from 'node:path';
import { writeFile } from 'node:fs/promises';
import { THEMES } from 'beautiful-mermaid';
import { renderAscii, type AsciiCliFlags } from '../core/render-ascii.js';
import { listThemeNames } from '../core/options.js';
import { resolveInput } from '../io/input.js';
import { writeOutput } from '../io/output.js';
import { IoError, ParseError, ThemeNotFoundError, suggestThemeName } from '../utils/errors.js';

export interface AsciiCommandFlags extends AsciiCliFlags {
  output?: string;
  code?: string;
  json?: boolean;
}

interface AsciiJsonOutput {
  schema_version: 1;
  success: true;
  text: string;
  lines: number;
  output?: string;
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
  // In --json mode, force colorMode=none so the inlined `text` is plain.
  const effective: AsciiCliFlags = { ...flags };
  if (flags.json) {
    effective.colorMode = 'none';
  } else if (effective.colorMode === undefined && !process.stdout.isTTY) {
    effective.colorMode = 'none';
  }

  let out: string;
  try {
    out = renderAscii(source, effective);
  } catch (e) {
    throw new ParseError(e instanceof Error ? e.message : String(e), source);
  }

  if (flags.json) {
    if (flags.output !== undefined) {
      try {
        await writeFile(flags.output, out);
      } catch (e) {
        const err = e as Error & { code?: string };
        throw new IoError(`Failed to write ${flags.output}: ${err.message}`);
      }
    }
    const payload: AsciiJsonOutput = {
      schema_version: 1,
      success: true,
      text: out,
      lines: out.split('\n').length,
    };
    if (flags.output !== undefined) payload.output = path.resolve(flags.output);
    process.stdout.write(JSON.stringify(payload) + '\n');
    return;
  }

  await writeOutput(flags.output, out, 'ascii');
}
