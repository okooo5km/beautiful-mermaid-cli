#!/usr/bin/env node
// CLI entry — okooo5km(十里)

import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { themesCommand } from './commands/themes.js';

// Read package.json at runtime to avoid `import ... with { type: 'json' }`
// portability concerns (Node 20.0–20.9 needs a flag; Bun support varies).
const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };

const program = new Command();
program
  .name('bm')
  .description('Render Mermaid diagrams as beautiful SVG/PNG/ASCII')
  .version(pkg.version);

program
  .command('themes')
  .description('List available built-in themes')
  .option('-q, --quiet', 'Print only theme names, no color blocks')
  .action((opts: { quiet?: boolean }) => {
    themesCommand({ quiet: opts.quiet ?? false });
  });

program
  .command('render [input]')
  .description('Render a Mermaid file to SVG/PNG (W3)')
  .action(() => {
    process.stderr.write('render: not implemented yet (W3)\n');
    process.exit(1);
  });

program
  .command('ascii [input]')
  .description('Render a Mermaid file to ASCII/Unicode text (W3)')
  .action(() => {
    process.stderr.write('ascii: not implemented yet (W3)\n');
    process.exit(1);
  });

program.parseAsync(process.argv).catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`${msg}\n`);
  process.exit(1);
});
