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
  /** Family name passed via `--font`. Resolved on the system; if missing,
   *  falls back to the latin/cjk hardcoded candidates with a stderr warning. */
  font?: string;
  /** Family name passed via `--font-mono`. Used when the SVG declares a
   *  monospace family. Optional. */
  fontMono?: string;
  /** Absolute path passed via `--font-file`. Wins over `font` for the
   *  user-primary slot (avoids family-name disambiguation). */
  fontFile?: string;
}

// Match any character in the common CJK ranges: CJK Symbols & Punctuation
// (U+3000-303F), Hiragana / Katakana (U+3040-30FF), CJK Unified Ideographs
// Ext-A (U+3400-4DBF) + Main (U+4E00-9FFF), Hangul Syllables (U+AC00-D7AF),
// CJK Compatibility Ideographs (U+F900-FAFF), Halfwidth/Fullwidth Forms
// (U+FF00-FFEF). Built via RegExp() with \u escapes so the source file stays
// ASCII-only (no irregular whitespace from a literal U+3000 in a /.../).
const CJK_CHAR_RE = new RegExp(
  '[\\u3000-\\u303f\\u3040-\\u30ff\\u3400-\\u4dbf\\u4e00-\\u9fff' +
    '\\uac00-\\ud7af\\uf900-\\ufaff\\uff00-\\uffef]',
);

let cjkWarningShown = false;
let emojiWarningShown = false;

// Emoji ranges most commonly appearing in mermaid input. Built via RegExp()
// with surrogate pair escapes (most emoji live above U+FFFF and a JS regex
// literal must use the /u flag or paired escapes to match them). We scan
// the source string raw, so we look for the high surrogate that prefixes
// any code point in U+1F300–U+1FAFF (the bulk of pictographic emoji), plus
// a few BMP miscellany ranges that resvg also routes through emoji fonts.
const EMOJI_HIGH_SURROGATE_RE = /[\ud83c-\ud83e]/;
// Misc Symbols and Pictographs / Dingbats / Misc Symbols / Arrows in BMP
// commonly used as text emoji. The `️` variation selector is matched
// separately from the symbol class because eslint's
// `no-misleading-character-class` flags combining marks inside a class.
const EMOJI_BMP_RE = new RegExp('[\\u2600-\\u27bf\\u2300-\\u23ff]|\\ufe0f');

function svgContainsCjk(svg: string): boolean {
  return scanTextNodes(svg, CJK_CHAR_RE);
}

function svgContainsEmoji(svg: string): boolean {
  // High-surrogate scan does not need to be confined to text nodes — it is
  // already specific enough that false positives in attributes are negligible.
  if (EMOJI_HIGH_SURROGATE_RE.test(svg)) return true;
  return scanTextNodes(svg, EMOJI_BMP_RE);
}

function scanTextNodes(svg: string, re: RegExp): boolean {
  const nodeRe = /<(?:text|tspan)\b[^>]*>([\s\S]*?)<\/(?:text|tspan)>/g;
  let m: RegExpExecArray | null;
  while ((m = nodeRe.exec(svg)) !== null) {
    if (re.test(m[1] ?? '')) return true;
  }
  return false;
}

export async function svgToPng(svg: string, opts: PngRenderOptions = {}): Promise<Uint8Array> {
  const [{ Resvg }, fonts] = await Promise.all([
    ensureWasm(),
    loadSystemFontBuffers({
      ...(opts.font ? { font: opts.font } : {}),
      ...(opts.fontMono ? { fontMono: opts.fontMono } : {}),
      ...(opts.fontFile ? { fontFile: opts.fontFile } : {}),
    }),
  ]);

  if (!fonts.cjkFamily && !cjkWarningShown && svgContainsCjk(svg)) {
    cjkWarningShown = true;
    process.stderr.write(
      'warning: rendering CJK characters but no CJK font found.\n' +
        '  install one of: fonts-noto-cjk (Debian/Ubuntu), google-noto-sans-cjk-fonts (Fedora), noto-fonts-cjk (Arch).\n' +
        '  run `bm doctor` to verify.\n',
    );
  }

  if (!emojiWarningShown && svgContainsEmoji(svg)) {
    emojiWarningShown = true;
    process.stderr.write(
      'warning: emoji characters are missing from PNG output.\n' +
        '  resvg-wasm cannot render color-emoji glyphs (COLRv1 / sbix), so\n' +
        '  emoji codepoints will be blank. Surrounding text (Latin / CJK) is\n' +
        '  unaffected. Use SVG output (`bm render -o foo.svg`) to get emoji\n' +
        '  rendered by your viewer.\n',
    );
  }

  // Sans stack: user → latin → cjk → generic. Emoji is intentionally not
  // appended — see svgContainsEmoji warning above for the reason.
  const sansStack: string[] = [];
  if (fonts.userFamily) sansStack.push(fonts.userFamily);
  if (fonts.latinFamily) sansStack.push(fonts.latinFamily);
  if (fonts.cjkFamily) sansStack.push(fonts.cjkFamily);
  sansStack.push('sans-serif');

  // Mono stack: user mono (if any) → latin/cjk for missing mono glyphs → generic.
  const monoStack: string[] = [];
  if (fonts.userMonoFamily) monoStack.push(fonts.userMonoFamily);
  if (fonts.latinFamily) monoStack.push(fonts.latinFamily);
  if (fonts.cjkFamily) monoStack.push(fonts.cjkFamily);
  monoStack.push('monospace');

  // resvg-wasm does not understand CSS L4/L5 features (var(), color-mix) emitted
  // by beautiful-mermaid; flatten them to concrete hex first. Also rewrite the
  // SVG's font-family to a stack so resvg/usvg can do per-glyph fallback
  // (user → Latin → CJK → generic) when the input mixes scripts.
  const flat = flattenSvgForRaster(svg, {
    fontFamilyStack: sansStack,
    fontMonoFamilyStack: monoStack,
  });

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
