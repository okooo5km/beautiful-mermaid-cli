#!/usr/bin/env node
// CLI entry — okooo5km(十里)

import { Command, Option, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { themesCommand } from './commands/themes.js';
import { renderAction, type RenderCommandFlags } from './commands/render.js';
import { asciiAction } from './commands/ascii.js';
import { doctorCommand } from './commands/doctor.js';
import { fontsCommand, type FontsFilter } from './commands/fonts.js';
import { listThemeNames } from './core/options.js';
import {
  CliError,
  ThemeNotFoundError,
  UsageError,
  formatError,
  errorToJson,
  suggestThemeName,
} from './utils/errors.js';
import type { AsciiCliFlags } from './core/render-ascii.js';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const intParser = (v: string): number => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) throw new UsageError(`Invalid integer: ${v}`);
  return n;
};
const floatParser = (v: string): number => {
  const n = parseFloat(v);
  if (Number.isNaN(n)) throw new UsageError(`Invalid number: ${v}`);
  return n;
};

function addCommonRenderFlags(cmd: Command): Command {
  return cmd
    .option('-c, --code <text>', 'Inline Mermaid source')
    .option('-o, --output <file>', 'Output file')
    .addOption(
      new Option('-t, --theme <name>', 'Theme name (run `bm themes` to list)').choices(
        listThemeNames(),
      ),
    )
    .option('--bg <hex>', 'Background color')
    .option('--fg <hex>', 'Foreground / text color')
    .option('--line <hex>', 'Edge color')
    .option('--accent <hex>', 'Accent / arrowhead color')
    .option('--muted <hex>', 'Muted text color')
    .option('--surface <hex>', 'Node fill tint')
    .option('--border <hex>', 'Node/group border color')
    .option('--font <family>', 'Font family (also applied to PNG via system fonts)')
    .option('--font-mono <family>', 'Monospace font family (PNG only)')
    .option('--font-file <path>', 'Path to a font file; overrides --font for PNG')
    .option('--padding <n>', 'Canvas padding (px, default: 40)', intParser)
    .option('--node-spacing <n>', 'Sibling node spacing (default: 24)', intParser)
    .option('--layer-spacing <n>', 'Layer spacing (default: 40)', intParser)
    .option('--component-spacing <n>', 'Disconnected component spacing (default: 24)', intParser)
    .option('--transparent', 'Transparent background')
    .option('--json', 'Emit JSON output for AI agents (stdout=data, stderr=errors)');
}

const program = new Command();
program
  .name('bm')
  .description('Render Mermaid diagrams as beautiful SVG/PNG/ASCII')
  .version(pkg.version)
  .exitOverride()
  // Suppress commander's auto-written error line; the top-level catch handles
  // formatting (plain or JSON) so we don't double-emit on stderr.
  .configureOutput({ writeErr: () => {} })
  .addHelpText(
    'after',
    `
Exit codes:
  0  Success
  1  Unclassified error (e.g. WASM init failure)
  2  Usage error (bad flags, unknown theme, PNG to stdout, --json+PNG without -o)
  3  Parse error (invalid Mermaid source)
  4  I/O error (file read/write failure)

Environment:
  NO_COLOR     Disable ANSI color output (any non-empty value)
  FORCE_COLOR  Force ANSI color output even when stdout is not a TTY

For AI agents, use --json on any subcommand for stable, machine-readable output.
The JSON contract is documented in doc/agent-interface.md (schema_version=1).
`,
  );

const renderCmd = program
  .command('render [input]', { isDefault: true })
  .description('Render Mermaid to SVG/PNG (default subcommand)');
addCommonRenderFlags(renderCmd)
  .addOption(new Option('-f, --format <fmt>', 'Output format').choices(['svg', 'png']))
  .option('--scale <n>', 'PNG zoom factor (default: 1)', floatParser)
  .option('--width <n>', 'PNG output width (px)', intParser)
  .action((input: string | undefined, opts: RenderCommandFlags) => renderAction(input, opts));

const asciiCmd = program
  .command('ascii [input]')
  .description('Render Mermaid to ASCII/Unicode text');
addCommonRenderFlags(asciiCmd)
  .option('-a, --ascii', 'Use ASCII chars (default: Unicode box-drawing)')
  .option('--padding-x <n>', 'Horizontal padding', intParser)
  .option('--padding-y <n>', 'Vertical padding', intParser)
  .option('--box-padding <n>', 'Inside-box padding', intParser)
  .addOption(
    new Option('--color-mode <mode>', 'Color mode').choices([
      'none',
      'ansi16',
      'ansi256',
      'truecolor',
      'html',
      'auto',
    ]),
  )
  .action((input: string | undefined, opts: Record<string, unknown>) =>
    // ASCII renderer takes a Partial<AsciiTheme> derived from the theme name plus
    // ASCII-specific layout flags. Color overrides registered by the shared helper
    // (--bg/--fg/...) are accepted on the CLI for symmetry but ignored here.
    asciiAction(input, {
      theme: opts.theme as string | undefined,
      useAscii: opts.ascii as boolean | undefined,
      paddingX: opts.paddingX as number | undefined,
      paddingY: opts.paddingY as number | undefined,
      boxBorderPadding: opts.boxPadding as number | undefined,
      colorMode: opts.colorMode as AsciiCliFlags['colorMode'],
      output: opts.output as string | undefined,
      code: opts.code as string | undefined,
      json: opts.json as boolean | undefined,
    }),
  );

program
  .command('doctor')
  .description('Report environment (version, node, fonts, wasm) for self-checks')
  .option('--json', 'Emit JSON output for AI agents')
  .action((opts: { json?: boolean }) => doctorCommand({ json: opts.json ?? false }));

program
  .command('themes')
  .description('List available built-in themes')
  .option('-q, --quiet', 'Print only theme names, no color blocks')
  .option('--json', 'Emit JSON output for AI agents')
  .action((opts: { quiet?: boolean; json?: boolean }) =>
    themesCommand({ quiet: opts.quiet ?? false, json: opts.json ?? false }),
  );

program
  .command('fonts')
  .description('List system fonts available for rendering')
  .addOption(
    new Option('--filter <kind>', 'Filter by coverage / class').choices([
      'latin',
      'cjk',
      'emoji',
      'mono',
    ]),
  )
  .option('--json', 'Emit JSON output for AI agents')
  .action((opts: { filter?: FontsFilter; json?: boolean }) =>
    fontsCommand({
      ...(opts.filter ? { filter: opts.filter } : {}),
      json: opts.json ?? false,
    }),
  );

// Detect --json across the whole argv so the top-level catch can choose the
// right error format even when commander failed before parsing reached the
// subcommand action.
const wantsJson = process.argv.includes('--json');

function emitError(err: unknown, code: number): never {
  if (wantsJson) {
    process.stderr.write(JSON.stringify(errorToJson(err)) + '\n');
  } else {
    process.stderr.write(formatError(err) + '\n');
  }
  process.exit(code);
}

function translateCommanderError(err: CommanderError): CliError {
  // Surface a friendlier, suggestion-bearing error when the user passes an
  // unknown --theme value (commander rejects it via `.choices()` before our
  // action runs, so we re-route through ThemeNotFoundError here).
  if (err.code === 'commander.invalidArgument') {
    const m = /option '[^']*--theme[^']*' argument '([^']+)' is invalid/.exec(err.message);
    if (m) {
      const bad = m[1]!;
      return new ThemeNotFoundError(bad, suggestThemeName(bad, listThemeNames()));
    }
  }
  // Strip commander's leading "error: " prefix for a cleaner message.
  const cleaned = err.message.replace(/^error:\s*/, '');
  return new UsageError(cleaned);
}

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CommanderError) {
    if (err.exitCode === 0) process.exit(0); // help / version
    const translated = translateCommanderError(err);
    emitError(translated, translated.code);
  }
  if (err instanceof CliError) {
    emitError(err, err.code);
  }
  const msg = err instanceof Error ? err.message : String(err);
  emitError(new Error(msg), 1);
});
