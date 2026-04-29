// Doctor subcommand: environment self-check for AI agents — okooo5km(十里)

import { readFileSync } from 'node:fs';
import pc from 'picocolors';
import { probeAvailableFontFamilies, loadSystemFontBuffers } from '../core/fonts.js';

export interface DoctorCommandOptions {
  json?: boolean;
}

interface DoctorReport {
  schema_version: 1;
  version: string;
  node_version: string;
  platform: string;
  arch: string;
  fonts: {
    available: string[];
    primary_family: string;
    /** First Latin-coverage family loaded (additive in v1). */
    latin_family?: string;
    /** First CJK-coverage family loaded (additive in v1). Absent ⇒ CJK text
     *  in PNG output will render as tofu boxes. */
    cjk_family?: string;
    buffers: number;
  };
  wasm_loaded: boolean;
  wasm_error?: string;
}

function readPkgVersion(): string {
  const pkg = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
  ) as { version: string };
  return pkg.version;
}

async function probeWasm(): Promise<{ loaded: boolean; error?: string }> {
  // We don't call ensureWasm() from render-png to avoid leaving global state
  // mutated; instead we just verify the optional dep + wasm file are loadable.
  try {
    const mod = await import('@resvg/resvg-wasm');
    const { createRequire } = await import('node:module');
    const { readFile } = await import('node:fs/promises');
    const req = createRequire(import.meta.url);
    const wasmPath = req.resolve('@resvg/resvg-wasm/index_bg.wasm');
    const wasmBytes = await readFile(wasmPath);
    await mod.initWasm(wasmBytes);
    return { loaded: true };
  } catch (e) {
    return { loaded: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function buildReport(): Promise<DoctorReport> {
  const families = probeAvailableFontFamilies();
  const loaded = await loadSystemFontBuffers();
  const wasm = await probeWasm();

  const report: DoctorReport = {
    schema_version: 1,
    version: readPkgVersion(),
    node_version: process.version,
    platform: process.platform,
    arch: process.arch,
    fonts: {
      available: families,
      primary_family: loaded.primaryFamily,
      ...(loaded.latinFamily ? { latin_family: loaded.latinFamily } : {}),
      ...(loaded.cjkFamily ? { cjk_family: loaded.cjkFamily } : {}),
      buffers: loaded.buffers.length,
    },
    wasm_loaded: wasm.loaded,
  };
  if (!wasm.loaded && wasm.error) report.wasm_error = wasm.error;
  return report;
}

function check(ok: boolean, color: boolean): string {
  if (!color) return ok ? 'ok ' : 'X  ';
  return ok ? pc.green('✓ ') : pc.red('✗ ');
}

function renderHuman(r: DoctorReport): string {
  const useColor = !process.env.NO_COLOR && Boolean(process.stdout.isTTY);
  const dim = useColor ? pc.dim : (s: string) => s;
  const bold = useColor ? pc.bold : (s: string) => s;
  const fontsOk = r.fonts.buffers > 0;

  const lines: string[] = [];
  lines.push(bold(`bm doctor`));
  lines.push(`  ${dim('version    ')} ${r.version}`);
  lines.push(`  ${dim('node       ')} ${r.node_version}`);
  lines.push(`  ${dim('platform   ')} ${r.platform} (${r.arch})`);
  lines.push('');
  lines.push(
    `  ${check(r.wasm_loaded, useColor)}${dim('PNG wasm   ')} ${
      r.wasm_loaded ? 'loaded' : 'unavailable'
    }`,
  );
  if (!r.wasm_loaded && r.wasm_error) {
    lines.push(`     ${dim(r.wasm_error)}`);
  }
  lines.push(
    `  ${check(fontsOk, useColor)}${dim('fonts      ')} ${
      fontsOk ? `${r.fonts.buffers} buffer(s), primary: ${r.fonts.primary_family}` : 'none found'
    }`,
  );
  if (r.fonts.available.length > 0) {
    lines.push(`     ${dim('available:')} ${r.fonts.available.join(', ')}`);
  }
  const cjkOk = Boolean(r.fonts.cjk_family);
  lines.push(
    `  ${check(cjkOk, useColor)}${dim('CJK font   ')} ${
      cjkOk
        ? r.fonts.cjk_family!
        : 'none — install fonts-noto-cjk (Debian/Ubuntu) or equivalent'
    }`,
  );
  return lines.join('\n');
}

export async function doctorCommand(opts: DoctorCommandOptions = {}): Promise<void> {
  const report = await buildReport();
  if (opts.json) {
    process.stdout.write(JSON.stringify(report) + '\n');
    return;
  }
  process.stdout.write(renderHuman(report) + '\n');
}
