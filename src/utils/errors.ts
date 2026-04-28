// Friendly error formatting + typed exit codes — okooo5km(十里)

import pc from 'picocolors';

export type ExitCode = 0 | 1 | 2 | 3 | 4;

export class CliError extends Error {
  readonly code: ExitCode;
  constructor(message: string, code: ExitCode = 1) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = 'UsageError';
  }
}

export class ThemeNotFoundError extends CliError {
  readonly suggestions: string[];
  constructor(name: string, suggestions: string[]) {
    const tail = suggestions.length ? ` Did you mean: ${suggestions.join(', ')}?` : '';
    super(`Unknown theme: ${name}.${tail}`, 2);
    this.name = 'ThemeNotFoundError';
    this.suggestions = suggestions;
  }
}

export class ParseError extends CliError {
  readonly source?: string;
  constructor(message: string, source?: string) {
    super(message, 3);
    this.name = 'ParseError';
    this.source = source;
  }
}

export class IoError extends CliError {
  constructor(message: string) {
    super(message, 4);
    this.name = 'IoError';
  }
}

export class WasmError extends CliError {
  constructor(message: string) {
    super(message, 1);
    this.name = 'WasmError';
  }
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Uint16Array(b.length + 1);
  let curr = new Uint16Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1]! + 1, prev[j]! + 1, prev[j - 1]! + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length]!;
}

export function suggestThemeName(name: string, themes: string[], topN = 3): string[] {
  const target = name.toLowerCase();
  const ranked = themes
    .map((t) => ({ name: t, dist: levenshtein(target, t.toLowerCase()) }))
    .sort((x, y) => x.dist - y.dist);
  const threshold = Math.max(3, Math.ceil(target.length / 2));
  return ranked
    .filter((r) => r.dist <= threshold)
    .slice(0, topN)
    .map((r) => r.name);
}

function extractContext(message: string, source: string): string | null {
  const m = /line\s+(\d+)/i.exec(message);
  if (!m) return null;
  const line = parseInt(m[1]!, 10);
  const lines = source.split(/\r?\n/);
  const start = Math.max(1, line - 2);
  const end = Math.min(lines.length, line + 2);
  const out: string[] = [];
  const width = String(end).length;
  for (let i = start; i <= end; i++) {
    const num = String(i).padStart(width, ' ');
    const marker = i === line ? pc.red('>') : ' ';
    out.push(`${marker} ${pc.dim(num)} | ${lines[i - 1] ?? ''}`);
  }
  return out.join('\n');
}

export interface ErrorJson {
  schema_version: 1;
  success: false;
  error: {
    code: ExitCode | 1;
    type: string;
    message: string;
    suggestions?: string[];
    source?: string;
  };
}

export function errorToJson(err: unknown): ErrorJson {
  if (err instanceof ThemeNotFoundError) {
    return {
      schema_version: 1,
      success: false,
      error: {
        code: err.code,
        type: err.name,
        message: err.message,
        suggestions: err.suggestions,
      },
    };
  }
  if (err instanceof ParseError) {
    return {
      schema_version: 1,
      success: false,
      error: {
        code: err.code,
        type: err.name,
        message: err.message,
        ...(err.source ? { source: err.source } : {}),
      },
    };
  }
  if (err instanceof CliError) {
    return {
      schema_version: 1,
      success: false,
      error: { code: err.code, type: err.name, message: err.message },
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  const type = err instanceof Error ? err.name || 'Error' : 'Error';
  return {
    schema_version: 1,
    success: false,
    error: { code: 1, type, message: msg },
  };
}

export function formatError(err: unknown): string {
  if (err instanceof ParseError) {
    const head = pc.red(pc.bold('Parse error: ')) + err.message;
    if (err.source) {
      const ctx = extractContext(err.message, err.source);
      return ctx ? `${head}\n${ctx}` : head;
    }
    return head;
  }
  if (err instanceof CliError) {
    return pc.red(pc.bold(`${err.name}: `)) + err.message;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return pc.red('Error: ') + msg;
}
