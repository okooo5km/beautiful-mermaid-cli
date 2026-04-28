// Cross-platform system font loading for resvg-wasm.
//
// resvg-wasm's `loadSystemFonts` / `fontDirs` / `fontFiles` options silently
// fail in the wasm runtime (no filesystem enumeration). The only reliable way
// to ship fonts to the wasm renderer is via `fontBuffers: Uint8Array[]`, which
// requires us to read font files from disk in JavaScript first.
//
// This module probes a small list of well-known system font paths per OS and
// returns whatever we can load. If nothing exists, the returned buffers list
// is empty and text in the rendered PNG will not be shown — that path is
// acceptable graceful degradation; the user can still use SVG output or
// install a system font.
//
// okooo5km(十里)

import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';

export interface LoadedFonts {
  buffers: Uint8Array[];
  /** Family name to use as `defaultFontFamily` in resvg + as the font-family
   *  override applied during SVG flattening. Matches at least one of the loaded
   *  buffers when buffers.length > 0. */
  primaryFamily: string;
}

interface FontCandidate {
  path: string;
  /** Family name reported by macOS / Linux / Windows for this file. resvg
   *  matches `font-family` against the OS/2 name table inside the font file,
   *  so this should be the name that appears in OS font menus. */
  family: string;
}

function candidatesForPlatform(): FontCandidate[] {
  switch (platform()) {
    case 'darwin':
      return [
        { path: '/System/Library/Fonts/Helvetica.ttc', family: 'Helvetica' },
        { path: '/System/Library/Fonts/HelveticaNeue.ttc', family: 'Helvetica Neue' },
        { path: '/System/Library/Fonts/Geneva.ttf', family: 'Geneva' },
        { path: '/System/Library/Fonts/Supplemental/Arial.ttf', family: 'Arial' },
      ];
    case 'win32':
      return [
        { path: 'C:\\Windows\\Fonts\\arial.ttf', family: 'Arial' },
        { path: 'C:\\Windows\\Fonts\\segoeui.ttf', family: 'Segoe UI' },
        { path: 'C:\\Windows\\Fonts\\tahoma.ttf', family: 'Tahoma' },
      ];
    default:
      // Linux + others
      return [
        { path: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', family: 'DejaVu Sans' },
        { path: '/usr/share/fonts/TTF/DejaVuSans.ttf', family: 'DejaVu Sans' },
        { path: '/usr/share/fonts/dejavu/DejaVuSans.ttf', family: 'DejaVu Sans' },
        {
          path: '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
          family: 'Liberation Sans',
        },
        {
          path: '/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf',
          family: 'Liberation Sans',
        },
        { path: '/usr/share/fonts/truetype/freefont/FreeSans.ttf', family: 'FreeSans' },
      ];
  }
}

let cached: Promise<LoadedFonts> | undefined;

export function loadSystemFontBuffers(): Promise<LoadedFonts> {
  if (!cached) cached = loadOnce();
  return cached;
}

async function loadOnce(): Promise<LoadedFonts> {
  const candidates = candidatesForPlatform();
  const buffers: Uint8Array[] = [];
  let primaryFamily: string | undefined;

  for (const { path, family } of candidates) {
    if (!existsSync(path)) continue;
    try {
      const buf = await readFile(path);
      buffers.push(new Uint8Array(buf));
      if (!primaryFamily) primaryFamily = family;
    } catch {
      // unreadable (permissions, etc.) — skip silently
    }
  }

  return { buffers, primaryFamily: primaryFamily ?? 'sans-serif' };
}
