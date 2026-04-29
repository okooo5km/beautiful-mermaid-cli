// CLI flags -> RenderOptions mapping — okooo5km(十里)

import { THEMES, type DiagramColors, type RenderOptions } from 'beautiful-mermaid';

export interface CliRenderFlags {
  theme?: string;
  bg?: string;
  fg?: string;
  line?: string;
  accent?: string;
  muted?: string;
  surface?: string;
  border?: string;
  /** SVG font family (also applied to PNG via fontBuffers + family stack). */
  font?: string;
  /** Monospace font family. PNG-only; beautiful-mermaid SVG output does not
   *  yet expose a separate mono slot, so this flag affects only PNG. */
  fontMono?: string;
  /** Absolute path to a font file. PNG-only; takes priority over `font`
   *  for the user-primary slot. */
  fontFile?: string;
  padding?: number;
  nodeSpacing?: number;
  layerSpacing?: number;
  componentSpacing?: number;
  transparent?: boolean;
}

const COLOR_KEYS = ['bg', 'fg', 'line', 'accent', 'muted', 'surface', 'border'] as const;
const NUMERIC_KEYS = ['padding', 'nodeSpacing', 'layerSpacing', 'componentSpacing'] as const;

export function buildRenderOptions(flags: CliRenderFlags): RenderOptions {
  let base: RenderOptions = {};
  if (flags.theme !== undefined) {
    const themeColors = THEMES[flags.theme];
    if (!themeColors) {
      // W2: plain Error. W3 replaces with ThemeNotFoundError + suggestThemeName().
      throw new Error(`Unknown theme: ${flags.theme}`);
    }
    base = { ...themeColors };
  }

  const overrides: Record<string, unknown> = {};
  for (const k of COLOR_KEYS) {
    const v = flags[k];
    if (v !== undefined) overrides[k] = v;
  }
  for (const k of NUMERIC_KEYS) {
    const v = flags[k];
    if (v !== undefined) overrides[k] = v;
  }
  // Font is its own knob (it's a family name, not a hex color).
  // fontMono and fontFile are PNG-only and are NOT forwarded to beautiful-mermaid.
  if (flags.font !== undefined) overrides.font = flags.font;
  if (flags.transparent !== undefined) overrides.transparent = flags.transparent;

  return { ...base, ...overrides } as RenderOptions;
}

export function listThemeNames(): string[] {
  return Object.keys(THEMES).sort();
}

export function getThemeColors(name: string): DiagramColors | undefined {
  return THEMES[name];
}
