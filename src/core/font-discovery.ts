// System font enumeration and lookup via fontkit.
//
// This module is the slow path: it walks the OS standard font directories,
// parses every .ttf/.otf/.ttc/.otc with fontkit, and reports family names,
// coverage, and monospace flag. It is NOT loaded by the default PNG render
// path — `src/core/fonts.ts` keeps a hardcoded fast-path list for the no-flag
// case so cold-start stays in the millisecond range.
//
// Used by:
//   - `bm fonts` command (`src/commands/fonts.ts`) for full enumeration
//   - `loadSystemFontBuffers()` when the user passes `--font <family>` or
//     `--font-file <path>`, to resolve a family name to a font file or to
//     read a raw file buffer with its declared family name
//
// Failure modes: a corrupt or unsupported font file is logged to stderr (only
// when BM_DEBUG is set) and skipped; the enumeration as a whole never throws
// so that one bad font in the user's library cannot break `bm fonts` or PNG
// rendering for unrelated diagrams.
//
// okooo5km(十里)

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import * as fontkit from 'fontkit';
import type { Font, FontCollection } from 'fontkit';

export interface FontInfo {
  /** Primary English family name from the font's name table. */
  family: string;
  postscriptName?: string;
  /** Absolute path to the font file. */
  path: string;
  /** Face index within a .ttc collection. Omitted for single-face files. */
  index?: number;
  /** Script coverage detected by probing the cmap for representative
   *  code points (Latin "A", CJK "中", emoji "😀"). A font may cover several. */
  coverage: Array<'latin' | 'cjk' | 'emoji'>;
  isMonospace: boolean;
  /** Subfamily name (e.g. "Regular", "Bold", "Italic"). */
  style?: string;
}

const FONT_EXT_RE = /\.(?:ttf|otf|ttc|otc)$/i;

// Code points used to probe coverage. 'A' for Latin (universal), a CJK
// Unified Ideograph that virtually every CJK font carries ('中' U+4E2D),
// and 'GRINNING FACE' (U+1F600) which every modern emoji font covers.
const PROBE_LATIN = 0x41;
const PROBE_CJK = 0x4e2d;
const PROBE_EMOJI = 0x1f600;

const MONO_NAME_KEYWORDS =
  /\b(?:mono|code|mononoki|iosevka|fira\s*code|source\s*code|hack|cascadia|menlo|monaco|consolas|courier|jetbrains|sf\s*mono|inconsolata)\b/i;

function fontDirectories(): string[] {
  switch (platform()) {
    case 'darwin':
      return [
        '/System/Library/Fonts',
        '/Library/Fonts',
        path.join(homedir(), 'Library/Fonts'),
      ];
    case 'win32': {
      const dirs = ['C:\\Windows\\Fonts'];
      const local = process.env['LOCALAPPDATA'];
      if (local) dirs.push(path.join(local, 'Microsoft', 'Windows', 'Fonts'));
      return dirs;
    }
    default:
      return [
        '/usr/share/fonts',
        '/usr/local/share/fonts',
        path.join(homedir(), '.local/share/fonts'),
        path.join(homedir(), '.fonts'),
      ];
  }
}

let enumeratePromise: Promise<FontInfo[]> | undefined;

export function enumerateFonts(): Promise<FontInfo[]> {
  if (!enumeratePromise) enumeratePromise = enumerateOnce();
  return enumeratePromise;
}

/** Test-only: clear the in-memory cache. */
export function _resetEnumerationCache(): void {
  enumeratePromise = undefined;
}

async function enumerateOnce(): Promise<FontInfo[]> {
  const dirs = fontDirectories().filter(existsSync);
  const files: string[] = [];
  for (const dir of dirs) {
    await collectFontFiles(dir, files);
  }

  const out: FontInfo[] = [];
  for (const file of files) {
    const infos = parseFontFile(file);
    for (const info of infos) out.push(info);
  }

  out.sort((a, b) => a.family.localeCompare(b.family));
  return out;
}

async function collectFontFiles(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await collectFontFiles(full, out);
    } else if (e.isFile() && FONT_EXT_RE.test(e.name)) {
      out.push(full);
    }
  }
}

function parseFontFile(file: string): FontInfo[] {
  let parsed: Font | FontCollection;
  try {
    parsed = fontkit.openSync(file);
  } catch (e) {
    debug(`fontkit failed to open ${file}: ${stringifyError(e)}`);
    return [];
  }

  if (isFontCollection(parsed)) {
    const out: FontInfo[] = [];
    parsed.fonts.forEach((font, i) => {
      const info = describeFont(font, file, i);
      if (info) out.push(info);
    });
    return out;
  }
  const info = describeFont(parsed, file);
  return info ? [info] : [];
}

function describeFont(font: Font, filePath: string, index?: number): FontInfo | null {
  let family: string | undefined;
  let style: string | undefined;
  let postscriptName: string | undefined;
  let isMonospace = false;
  const coverage: Array<'latin' | 'cjk' | 'emoji'> = [];
  try {
    family = preferredFamilyName(font);
    style = preferredSubfamilyName(font);
    postscriptName = font.postscriptName;
    if (font.hasGlyphForCodePoint(PROBE_LATIN)) coverage.push('latin');
    if (font.hasGlyphForCodePoint(PROBE_CJK)) coverage.push('cjk');
    if (font.hasGlyphForCodePoint(PROBE_EMOJI)) coverage.push('emoji');
    isMonospace = detectMonospace(font);
  } catch (e) {
    debug(`fontkit failed to describe ${filePath}#${index ?? 0}: ${stringifyError(e)}`);
    return null;
  }
  if (!family) return null;
  return {
    family,
    ...(postscriptName ? { postscriptName } : {}),
    path: filePath,
    ...(index !== undefined ? { index } : {}),
    coverage,
    isMonospace,
    ...(style ? { style } : {}),
  };
}

// fontkit's `familyName` returns the OS/2 typographic family (name id 1),
// which on weighted faces is something like "Hiragino Sans GB W3". The
// user-facing family that appears in OS font menus is `preferredFamily`
// (name id 16 — only emitted when it differs from name id 1). We prefer
// that one so users can pass `--font 'Hiragino Sans GB'` instead of
// `--font 'Hiragino Sans GB W3'`.
function preferredFamilyName(font: Font): string {
  const preferred = font.getName('preferredFamily', 'en');
  if (preferred) return preferred;
  return font.familyName;
}

function preferredSubfamilyName(font: Font): string {
  const preferred = font.getName('preferredSubfamily', 'en');
  if (preferred) return preferred;
  return font.subfamilyName;
}

function detectMonospace(font: Font): boolean {
  const family = font.familyName ?? '';
  if (MONO_NAME_KEYWORDS.test(family)) return true;
  // Panose byte 3 is `bProportion`. Value 9 is "Monospaced".
  // See https://monotype.github.io/panose/pan2.htm
  // CJK fonts are typically panose=9 by design (every CJK glyph is the same
  // width), but the user-facing meaning of "monospace" is "code-style font
  // for inline code / class methods". Excluding fonts with CJK coverage keeps
  // FangSong / SimSun / 宋体 etc. out of `--filter mono` / `--font-mono`.
  const panose = font['OS/2']?.panose;
  if (Array.isArray(panose) && panose.length >= 4 && panose[3] === 9) {
    try {
      if (!font.hasGlyphForCodePoint(PROBE_CJK)) return true;
    } catch {
      // Probe failed — fall through to false rather than misclassify.
    }
  }
  return false;
}

function isFontCollection(x: Font | FontCollection): x is FontCollection {
  return (x as FontCollection).type === 'TTC' || (x as FontCollection).type === 'DFont';
}

function debug(msg: string): void {
  if (process.env['BM_DEBUG']) process.stderr.write(`[bm font-discovery] ${msg}\n`);
}

function stringifyError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Resolve a family name to a single FontInfo. Case-insensitive match against
 *  family or postscriptName. Returns null if not found. */
export async function findFontByFamily(family: string): Promise<FontInfo | null> {
  const target = family.trim().toLowerCase();
  if (!target) return null;
  const all = await enumerateFonts();
  // Prefer exact family match with style "Regular" first; then any face.
  let regular: FontInfo | undefined;
  let any: FontInfo | undefined;
  for (const f of all) {
    if (f.family.toLowerCase() === target || f.postscriptName?.toLowerCase() === target) {
      if (!any) any = f;
      if (f.style === 'Regular' && !regular) regular = f;
    }
  }
  return regular ?? any ?? null;
}

/** Read a font file from disk and report its family. Used for `--font-file`. */
export async function loadFontFile(
  filePath: string,
): Promise<{ buffer: Uint8Array; family: string }> {
  const abs = path.resolve(filePath);
  const buf = await readFile(abs);
  let family = '';
  try {
    const parsed = fontkit.openSync(abs);
    const head = isFontCollection(parsed) ? parsed.fonts[0] : parsed;
    if (head) family = preferredFamilyName(head);
  } catch (e) {
    debug(`failed to read family from ${abs}: ${stringifyError(e)}`);
  }
  return { buffer: new Uint8Array(buf), family };
}
