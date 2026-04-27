// Format inference: -f flag > extension > default — okooo5km(十里)

import path from 'node:path';
import { UsageError } from './errors.js';

export type RenderFormat = 'svg' | 'png' | 'ascii';

export interface FormatResolveInput {
  format?: string;
  output?: string;
  defaultFormat?: RenderFormat;
}

export function resolveFormat(opts: FormatResolveInput): RenderFormat {
  if (opts.format !== undefined) {
    const f = opts.format.toLowerCase();
    if (f === 'svg' || f === 'png' || f === 'ascii') return f;
    if (f === 'txt') return 'ascii';
    throw new UsageError(`Unsupported format: ${opts.format} (expected svg, png, or ascii)`);
  }
  if (opts.output !== undefined) {
    const ext = path.extname(opts.output).toLowerCase();
    if (ext === '.svg') return 'svg';
    if (ext === '.png') return 'png';
    if (ext === '.ascii' || ext === '.txt') return 'ascii';
  }
  return opts.defaultFormat ?? 'svg';
}
