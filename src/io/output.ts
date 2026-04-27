// Output layer: file / stdout (binary safe) — okooo5km(十里)

import { writeFile } from 'node:fs/promises';
import { IoError, UsageError } from '../utils/errors.js';
import type { RenderFormat } from '../utils/format.js';

export async function writeOutput(
  target: string | undefined,
  data: string | Uint8Array,
  format: RenderFormat,
): Promise<void> {
  if (target !== undefined) {
    try {
      await writeFile(target, data);
    } catch (e) {
      const err = e as Error & { code?: string };
      throw new IoError(`Failed to write ${target}: ${err.message}`);
    }
    return;
  }

  if (format === 'png') {
    throw new UsageError('PNG cannot be written to stdout. Use -o <file>.');
  }

  if (typeof data === 'string') {
    process.stdout.write(data);
    if (!data.endsWith('\n')) process.stdout.write('\n');
  } else {
    process.stdout.write(Buffer.from(data));
  }
}
