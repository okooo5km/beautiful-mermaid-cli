// Cross-platform system font loading for resvg-wasm.
//
// resvg-wasm's `loadSystemFonts` / `fontDirs` / `fontFiles` options silently
// fail in the wasm runtime (no filesystem enumeration). The only reliable way
// to ship fonts to the wasm renderer is via `fontBuffers: Uint8Array[]`, which
// requires us to read font files from disk in JavaScript first.
//
// This module probes a small list of well-known system font paths per OS and
// returns whatever we can load. We probe two coverage classes:
//   - 'latin' — Latin-script fonts (Helvetica, DejaVu Sans, Arial, ...)
//   - 'cjk'   — pan-CJK fonts (PingFang, Microsoft YaHei, Noto Sans CJK, ...)
// Both classes feed the same `fontBuffers` array; resvg/usvg performs per-glyph
// fallback when the SVG declares a multi-family stack (see svg-flatten.ts).
//
// If nothing exists, the returned buffers list is empty and text in the
// rendered PNG will not be shown — that path is acceptable graceful
// degradation; the user can still use SVG output or install a system font.
//
// okooo5km(十里)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { findFontByFamily, loadFontFile } from './font-discovery.js';

export interface UserFontOverrides {
  /** Family name passed via `--font`. Resolved through font-discovery. */
  font?: string;
  /** Family name passed via `--font-mono`. Resolved through font-discovery. */
  fontMono?: string;
  /** Absolute path passed via `--font-file`. Read directly; takes priority
   *  over `font` for the user-primary slot. */
  fontFile?: string;
}

export interface LoadedFonts {
  buffers: Uint8Array[];
  /** Family name to use as `defaultFontFamily` in resvg. Matches at least one
   *  of the loaded buffers when buffers.length > 0. Typically the first Latin
   *  family found (preserves prior behavior), unless the user supplied an
   *  override that resolved successfully — in which case it is the user's. */
  primaryFamily: string;
  /** First Latin-coverage family loaded, if any. */
  latinFamily?: string;
  /** First CJK-coverage family loaded, if any. Absence implies CJK glyphs in
   *  the input will render as tofu boxes. */
  cjkFamily?: string;
  /** Family resolved from `--font` / `--font-file`, if any. */
  userFamily?: string;
  /** Family resolved from `--font-mono`, if any. */
  userMonoFamily?: string;
}

interface FontCandidate {
  path: string;
  /** Family name reported by macOS / Linux / Windows for this file. resvg
   *  matches `font-family` against the OS/2 name table inside the font file,
   *  so this should be the name that appears in OS font menus. */
  family: string;
  /** Script coverage. Used to bucket the loaded font into latin/cjk slots so
   *  the SVG's font-family stack can request per-glyph fallback. Emoji is
   *  loaded as a *shaping shim* only (see comment on emoji candidates) and
   *  never appears in the font-family stack. */
  coverage: 'latin' | 'cjk' | 'emoji';
}

function candidatesForPlatform(): FontCandidate[] {
  switch (platform()) {
    case 'darwin':
      return [
        { path: '/System/Library/Fonts/Helvetica.ttc', family: 'Helvetica', coverage: 'latin' },
        {
          path: '/System/Library/Fonts/HelveticaNeue.ttc',
          family: 'Helvetica Neue',
          coverage: 'latin',
        },
        { path: '/System/Library/Fonts/Geneva.ttf', family: 'Geneva', coverage: 'latin' },
        {
          path: '/System/Library/Fonts/Supplemental/Arial.ttf',
          family: 'Arial',
          coverage: 'latin',
        },
        // CJK — pan-CJK first (covers SC/TC/HK on macOS 10.11+), then legacy / JP / KR fallbacks.
        { path: '/System/Library/Fonts/PingFang.ttc', family: 'PingFang SC', coverage: 'cjk' },
        {
          path: '/System/Library/Fonts/Hiragino Sans GB.ttc',
          family: 'Hiragino Sans GB',
          coverage: 'cjk',
        },
        {
          path: '/System/Library/Fonts/ヒラギノ角ゴシック W3.ttc',
          family: 'Hiragino Sans',
          coverage: 'cjk',
        },
        {
          path: '/System/Library/Fonts/AppleSDGothicNeo.ttc',
          family: 'Apple SD Gothic Neo',
          coverage: 'cjk',
        },
        // Emoji shaping shim — see the long comment at the top of `loadOnce`
        // for why we load this even though resvg-wasm cannot render the
        // glyphs. Apple Color Emoji ships with macOS so this is reliable.
        {
          path: '/System/Library/Fonts/Apple Color Emoji.ttc',
          family: 'Apple Color Emoji',
          coverage: 'emoji',
        },
      ];
    case 'win32':
      return [
        { path: 'C:\\Windows\\Fonts\\arial.ttf', family: 'Arial', coverage: 'latin' },
        { path: 'C:\\Windows\\Fonts\\segoeui.ttf', family: 'Segoe UI', coverage: 'latin' },
        { path: 'C:\\Windows\\Fonts\\tahoma.ttf', family: 'Tahoma', coverage: 'latin' },
        // CJK
        { path: 'C:\\Windows\\Fonts\\msyh.ttc', family: 'Microsoft YaHei', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\msjh.ttc', family: 'Microsoft JhengHei', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\simsun.ttc', family: 'SimSun', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\YuGothR.ttc', family: 'Yu Gothic', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\YuGothic.ttc', family: 'Yu Gothic', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\meiryo.ttc', family: 'Meiryo', coverage: 'cjk' },
        { path: 'C:\\Windows\\Fonts\\malgun.ttf', family: 'Malgun Gothic', coverage: 'cjk' },
        // Emoji shaping shim. Segoe UI Emoji ships with Windows Vista+.
        { path: 'C:\\Windows\\Fonts\\seguiemj.ttf', family: 'Segoe UI Emoji', coverage: 'emoji' },
      ];
    default:
      // Linux + others
      return [
        {
          path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
          family: 'DejaVu Sans',
          coverage: 'latin',
        },
        {
          path: '/usr/share/fonts/TTF/DejaVuSans.ttf',
          family: 'DejaVu Sans',
          coverage: 'latin',
        },
        {
          path: '/usr/share/fonts/dejavu/DejaVuSans.ttf',
          family: 'DejaVu Sans',
          coverage: 'latin',
        },
        {
          path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
          family: 'Liberation Sans',
          coverage: 'latin',
        },
        {
          path: '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf',
          family: 'Liberation Sans',
          coverage: 'latin',
        },
        {
          path: '/usr/share/fonts/truetype/freefont/FreeSans.ttf',
          family: 'FreeSans',
          coverage: 'latin',
        },
        // CJK — Debian/Ubuntu, Fedora, Arch, then WenQuanYi as legacy fallbacks.
        {
          path: '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',
          family: 'Noto Sans CJK SC',
          coverage: 'cjk',
        },
        {
          path: '/usr/share/fonts/google-noto-cjk/NotoSansCJK-Regular.ttc',
          family: 'Noto Sans CJK SC',
          coverage: 'cjk',
        },
        {
          path: '/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc',
          family: 'Noto Sans CJK SC',
          coverage: 'cjk',
        },
        {
          path: '/usr/share/fonts/wqy-microhei/wqy-microhei.ttc',
          family: 'WenQuanYi Micro Hei',
          coverage: 'cjk',
        },
        {
          path: '/usr/share/fonts/truetype/wqy/wqy-microhei.ttc',
          family: 'WenQuanYi Micro Hei',
          coverage: 'cjk',
        },
        {
          path: '/usr/share/fonts/wqy-zenhei/wqy-zenhei.ttc',
          family: 'WenQuanYi Zen Hei',
          coverage: 'cjk',
        },
        // Emoji shaping shim — Noto Color Emoji from `fonts-noto-color-emoji`
        // (Debian/Ubuntu), `google-noto-color-emoji-fonts` (Fedora), or
        // `noto-fonts-emoji` (Arch).
        {
          path: '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf',
          family: 'Noto Color Emoji',
          coverage: 'emoji',
        },
        {
          path: '/usr/share/fonts/google-noto-color-emoji/NotoColorEmoji.ttf',
          family: 'Noto Color Emoji',
          coverage: 'emoji',
        },
        {
          path: '/usr/share/fonts/noto-color-emoji/NotoColorEmoji.ttf',
          family: 'Noto Color Emoji',
          coverage: 'emoji',
        },
      ];
  }
}

// Cache keyed by stringified overrides so that `--font X` and `--font Y` get
// independent results, while repeated calls with the same overrides (or none
// at all) reuse the buffers.
const cache = new Map<string, Promise<LoadedFonts>>();
const fontNotFoundWarned = new Set<string>();

export function loadSystemFontBuffers(overrides?: UserFontOverrides): Promise<LoadedFonts> {
  const key = JSON.stringify(overrides ?? {});
  let p = cache.get(key);
  if (!p) {
    p = loadOnce(overrides);
    cache.set(key, p);
  }
  return p;
}

/** Test-only: clear caches so consecutive tests can re-probe. */
export function _resetFontCache(): void {
  cache.clear();
  fontNotFoundWarned.clear();
}

/** Lightweight probe: returns family names whose font files exist on disk,
 *  in candidate order, deduplicated. Does not read or cache the font bytes —
 *  used by `bm doctor` for environment reporting. */
export function probeAvailableFontFamilies(): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { path, family } of candidatesForPlatform()) {
    if (!existsSync(path)) continue;
    if (seen.has(family)) continue;
    seen.add(family);
    out.push(family);
  }
  return out;
}

async function loadOnce(overrides?: UserFontOverrides): Promise<LoadedFonts> {
  const buffers: Uint8Array[] = [];
  let userFamily: string | undefined;
  let userMonoFamily: string | undefined;

  // 1) User overrides go in first so resvg sees them as the highest-priority
  //    fontBuffers entry. `--font-file` wins over `--font` for the same slot.
  if (overrides?.fontFile) {
    try {
      const { buffer, family } = await loadFontFile(overrides.fontFile);
      buffers.push(buffer);
      if (family) userFamily = family;
    } catch (e) {
      warnOnce(
        `font-file:${overrides.fontFile}`,
        `failed to load --font-file ${overrides.fontFile}: ${stringifyError(e)}`,
      );
    }
  } else if (overrides?.font) {
    const resolved = await findFontByFamily(overrides.font);
    if (resolved) {
      try {
        const buf = await readFile(resolved.path);
        buffers.push(new Uint8Array(buf));
        userFamily = resolved.family;
      } catch (e) {
        warnOnce(
          `font:${overrides.font}`,
          `failed to read font for --font ${overrides.font}: ${stringifyError(e)}`,
        );
      }
    } else {
      warnOnce(
        `font-missing:${overrides.font}`,
        `font '${overrides.font}' not found on system; run \`bm fonts list\` to see available fonts.`,
      );
    }
  }

  if (overrides?.fontMono) {
    const resolved = await findFontByFamily(overrides.fontMono);
    if (resolved) {
      try {
        const buf = await readFile(resolved.path);
        buffers.push(new Uint8Array(buf));
        userMonoFamily = resolved.family;
      } catch (e) {
        warnOnce(
          `font-mono:${overrides.fontMono}`,
          `failed to read font for --font-mono ${overrides.fontMono}: ${stringifyError(e)}`,
        );
      }
    } else {
      warnOnce(
        `font-mono-missing:${overrides.fontMono}`,
        `monospace font '${overrides.fontMono}' not found on system; run \`bm fonts list --filter mono\`.`,
      );
    }
  }

  // 2) Hardcoded candidates (the fast-path Latin/CJK fallback). These ensure
  //    that when the user picks a Latin-only font, CJK glyphs still fall back
  //    to a system CJK family, and vice versa.
  // Hardcoded candidates split into three coverage classes:
  //
  //   - 'latin' / 'cjk' fonts are loaded into fontBuffers AND advertised in
  //     the SVG family stack so resvg performs per-glyph fallback.
  //
  //   - 'emoji' fonts are loaded into fontBuffers BUT NOT advertised in the
  //     stack. They serve as a *shaping shim*: their cmap claims emoji
  //     codepoints, which prevents emoji characters in mixed-script text
  //     from corrupting the per-glyph fallback shaping for surrounding CJK
  //     characters (without an emoji-cmap source, resvg drops both the
  //     emoji and the CJK glyphs to .notdef tofu in a single text run).
  //     The emoji glyphs themselves still fail to render — resvg-wasm does
  //     not implement COLRv1 or sbix — but they fail silently as missing
  //     glyphs instead of poisoning their neighbors.
  //
  // This is the lesser of two evils until resvg-wasm gains real color-emoji
  // support. SVG output is unaffected; viewers render emoji from system fonts.
  const candidates = candidatesForPlatform();
  let latinFamily: string | undefined;
  let cjkFamily: string | undefined;

  for (const { path, family, coverage } of candidates) {
    if (!existsSync(path)) continue;
    try {
      const buf = await readFile(path);
      buffers.push(new Uint8Array(buf));
      if (coverage === 'latin' && !latinFamily) latinFamily = family;
      if (coverage === 'cjk' && !cjkFamily) cjkFamily = family;
      // 'emoji' is intentionally not tracked in LoadedFonts — it never appears
      // in the family stack and exposing it as `emojiFamily` would mislead
      // users into thinking emoji glyphs render.
    } catch {
      // unreadable (permissions, etc.) — skip silently
    }
  }

  // primaryFamily preference: user override → first latin → first cjk → generic.
  // This becomes resvg's `defaultFontFamily`, used only when SVG-declared
  // family stack fully fails to match.
  const primaryFamily = userFamily ?? latinFamily ?? cjkFamily ?? 'sans-serif';

  return {
    buffers,
    primaryFamily,
    ...(latinFamily ? { latinFamily } : {}),
    ...(cjkFamily ? { cjkFamily } : {}),
    ...(userFamily ? { userFamily } : {}),
    ...(userMonoFamily ? { userMonoFamily } : {}),
  };
}

function warnOnce(key: string, msg: string): void {
  if (fontNotFoundWarned.has(key)) return;
  fontNotFoundWarned.add(key);
  process.stderr.write(`warning: ${msg}\n`);
}

function stringifyError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
