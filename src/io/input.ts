// Input layer: file / stdin / inline -c — okooo5km(十里)

import { readFile } from 'node:fs/promises';
import { IoError, UsageError } from '../utils/errors.js';

export interface InputOptions {
  path?: string;
  code?: string;
}

export async function resolveInput(opts: InputOptions): Promise<string> {
  if (opts.code !== undefined) return opts.code;

  if (opts.path !== undefined) {
    try {
      return await readFile(opts.path, 'utf8');
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === 'ENOENT') throw new IoError(`File not found: ${opts.path}`);
      throw new IoError(`Failed to read ${opts.path}: ${err.message}`);
    }
  }

  if (process.stdin.isTTY) {
    throw new UsageError('No input provided. Pass a file path, --code/-c, or pipe via stdin.');
  }
  return await readStdin();
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : (chunk as Buffer));
  }
  return Buffer.concat(chunks).toString('utf8');
}
