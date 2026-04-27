#!/usr/bin/env node
// CLI entry — okooo5km(十里)

import { Command, Option, CommanderError } from 'commander';
import { readFileSync } from 'node:fs';
import { themesCommand } from './commands/themes.js';
import { renderAction, type RenderCommandFlags } from './commands/render.js';
import { asciiAction } from './commands/ascii.js';
import { CliError, UsageError, formatError } from './utils/errors.js';
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
    .option('-t, --theme <name>', 'Theme name (run `bm themes` to list)')
    .option('--bg <hex>', 'Background color')
    .option('--fg <hex>', 'Foreground / text color')
    .option('--line <hex>', 'Edge color')
    .option('--accent <hex>', 'Accent / arrowhead color')
    .option('--muted <hex>', 'Muted text color')
    .option('--surface <hex>', 'Node fill tint')
    .option('--border <hex>', 'Node/group border color')
    .option('--font <family>', 'Font family')
    .option('--padding <n>', 'Canvas padding (px)', intParser)
    .option('--node-spacing <n>', 'Sibling node spacing', intParser)
    .option('--layer-spacing <n>', 'Layer spacing', intParser)
    .option('--component-spacing <n>', 'Disconnected component spacing', intParser)
    .option('--transparent', 'Transparent background');
}

const program = new Command();
program
  .name('bm')
  .description('Render Mermaid diagrams as beautiful SVG/PNG/ASCII')
  .version(pkg.version)
  .exitOverride();

const renderCmd = program
  .command('render [input]', { isDefault: true })
  .description('Render Mermaid to SVG/PNG (default subcommand)');
addCommonRenderFlags(renderCmd)
  .addOption(new Option('-f, --format <fmt>', 'Output format').choices(['svg', 'png']))
  .option('--scale <n>', 'PNG zoom factor (default 1)', floatParser)
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
    }),
  );

program
  .command('themes')
  .description('List available built-in themes')
  .option('-q, --quiet', 'Print only theme names, no color blocks')
  .action((opts: { quiet?: boolean }) => themesCommand({ quiet: opts.quiet ?? false }));

program.parseAsync(process.argv).catch((err: unknown) => {
  if (err instanceof CommanderError) {
    if (err.exitCode === 0) process.exit(0); // help / version
    process.stderr.write(formatError(new UsageError(err.message)) + '\n');
    process.exit(2);
  }
  if (err instanceof CliError) {
    process.stderr.write(formatError(err) + '\n');
    process.exit(err.code);
  }
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(formatError(new Error(msg)) + '\n');
  process.exit(1);
});
