// PNG renderer (SVG -> PNG via @resvg/resvg-wasm) — okooo5km(十里)

import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { WasmError } from '../utils/errors.js';
import { flattenSvgForRaster } from './svg-flatten.js';
import { loadSystemFontBuffers } from './fonts.js';

type ResvgModule = typeof import('@resvg/resvg-wasm');

let resvg: ResvgModule | undefined;
let inited = false;
let initPromise: Promise<ResvgModule> | undefined;

async function ensureWasm(): Promise<ResvgModule> {
  if (inited && resvg) return resvg;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    let mod: ResvgModule;
    try {
      mod = await import('@resvg/resvg-wasm');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new WasmError(
        `PNG rendering requires @resvg/resvg-wasm but it is not installed. (${msg})`,
      );
    }
    try {
      const req = createRequire(import.meta.url);
      const wasmPath = req.resolve('@resvg/resvg-wasm/index_bg.wasm');
      const wasmBytes = await readFile(wasmPath);
      await mod.initWasm(wasmBytes);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new WasmError(`Failed to initialize wasm: ${msg}`);
    }
    resvg = mod;
    inited = true;
    return mod;
  })();

  return initPromise;
}

export interface PngRenderOptions {
  scale?: number;
  width?: number;
  background?: string;
}

export async function svgToPng(svg: string, opts: PngRenderOptions = {}): Promise<Uint8Array> {
  const [{ Resvg }, fonts] = await Promise.all([ensureWasm(), loadSystemFontBuffers()]);

  // resvg-wasm does not understand CSS L4/L5 features (var(), color-mix) emitted
  // by beautiful-mermaid; flatten them to concrete hex first. Also rewrite the
  // SVG's font-family to a name we have actually loaded into fontBuffers.
  const flat = flattenSvgForRaster(svg, { fontFamily: fonts.primaryFamily });

  const fitTo =
    opts.width !== undefined
      ? ({ mode: 'width', value: opts.width } as const)
      : opts.scale !== undefined
        ? ({ mode: 'zoom', value: opts.scale } as const)
        : ({ mode: 'original' } as const);
  const inst = new Resvg(flat, {
    fitTo,
    font: {
      fontBuffers: fonts.buffers,
      defaultFontFamily: fonts.primaryFamily,
    },
    ...(opts.background ? { background: opts.background } : {}),
  });
  try {
    const rendered = inst.render();
    const png = rendered.asPng();
    rendered.free();
    return png;
  } finally {
    inst.free();
  }
}
