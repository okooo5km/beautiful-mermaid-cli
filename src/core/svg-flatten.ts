// Flatten CSS variables and color-mix() expressions in beautiful-mermaid SVG
// output so that resvg-wasm can render colors correctly.
//
// beautiful-mermaid emits CSS Color Module Level 5 features (color-mix,
// chained var() with fallback chains) which resvg does not support — without
// flattening, every var(...) resolves to black and the output is unreadable.
//
// okooo5km(十里)

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface FlattenOptions {
  /** Family stack to substitute for SVG font-family declarations on
   *  proportional (sans/serif) text. resvg/usvg walks the stack per glyph:
   *  put the Latin family first (so Latin glyphs render as Latin font), then
   *  the CJK family (so CJK glyphs fall through), then a generic at the end
   *  as last resort. Default: ['sans-serif']. */
  fontFamilyStack?: string[];
  /** Family stack for declarations that contain the `monospace` keyword.
   *  Used when beautiful-mermaid (or future Mermaid backends) emits a
   *  separate font-family for code-like elements. Default: same as
   *  `fontFamilyStack` with 'monospace' appended at the end. */
  fontMonoFamilyStack?: string[];
}

export function flattenSvgForRaster(svg: string, opts: FlattenOptions = {}): string {
  const sansStack = (opts.fontFamilyStack ?? ['sans-serif']).map(toCssFamilyToken);
  const monoStack = (opts.fontMonoFamilyStack ?? [...(opts.fontFamilyStack ?? []), 'monospace'])
    .map(toCssFamilyToken);
  const sansStyle = sansStack.join(', ');
  const monoStyle = monoStack.join(', ');
  // Inside an XML attribute, double quotes terminate the attribute, so any
  // quoted family name in the stack must use single quotes there.
  const sansAttr = sansStyle.replace(/"/g, "'");
  const monoAttr = monoStyle.replace(/"/g, "'");
  const isMono = (decls: string): boolean => /\bmonospace\b/i.test(decls);

  const rootVars = extractRootVars(svg);
  const cssVars = extractCssVars(svg);
  const allVars = { ...cssVars, ...rootVars };

  const cache = new Map<string, string>();
  for (const name of Object.keys(allVars)) {
    cache.set(name, resolveExpr(allVars[name]!, allVars, cache));
  }

  let out = svg;

  // Substitute fill="var(...)" / stroke="var(...)" with concrete hex
  out = out.replace(/(fill|stroke)="(var\(--[\w-]+(?:,[^"]+)?\))"/g, (_m, attr, expr) => {
    return `${attr}="${resolveExpr(expr, allVars, cache)}"`;
  });

  // Strip remote @import (resvg cannot fetch network resources)
  out = out.replace(/@import\s+url\([^)]+\);?\s*/g, '');

  // Inline style backgrounds: `background:var(--bg)` → `background:#FFFFFF`
  out = out.replace(/(background\s*:\s*)var\(--([\w-]+)(?:,[^)]+)?\)/g, (_m, prefix, name) => {
    return `${prefix}${cache.get(name) ?? '#FFFFFF'}`;
  });

  // Replace font-family declarations with the stack we know resvg has loaded.
  // resvg/usvg performs per-glyph fallback across the stack, which is the only
  // way to mix Latin + CJK glyphs in a single text run.
  // If the original declaration contains the `monospace` keyword, route it to
  // the mono stack so user-supplied --font-mono can take effect on code-like
  // elements without affecting the rest of the diagram.
  out = out.replace(/font-family\s*:\s*([^;}]+)/g, (_m, decls: string) =>
    `font-family: ${isMono(decls) ? monoStyle : sansStyle}`,
  );
  out = out.replace(/font-family="([^"]+)"/g, (_m, decls: string) =>
    `font-family="${isMono(decls) ? monoAttr : sansAttr}"`,
  );

  return out;
}

// Generic CSS family keywords pass through bare; any family name containing a
// space or non-ASCII character must be quoted. Pre-quoted names (e.g. coming
// from a previous round-trip) are passed through unchanged.
const CSS_GENERIC_FAMILY = new Set([
  'sans-serif',
  'serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-sans-serif',
  'ui-serif',
  'ui-monospace',
]);

function toCssFamilyToken(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return 'sans-serif';
  if (CSS_GENERIC_FAMILY.has(trimmed.toLowerCase())) return trimmed.toLowerCase();
  if (/^["'].*["']$/.test(trimmed)) return trimmed;
  if (/[\s]/.test(trimmed) || /[^\x20-\x7e]/.test(trimmed)) return `"${trimmed}"`;
  return trimmed;
}

// ---- internals ----

function extractRootVars(svg: string): Record<string, string> {
  const out: Record<string, string> = {};
  const styleAttr = /<svg\b[^>]*?\sstyle="([^"]+)"/.exec(svg);
  if (!styleAttr) return out;
  for (const decl of styleAttr[1]!.split(';')) {
    const m = /^\s*--([\w-]+)\s*:\s*(.+?)\s*$/.exec(decl);
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

function extractCssVars(svg: string): Record<string, string> {
  const out: Record<string, string> = {};
  const styleBlock = /<style[^>]*>([\s\S]*?)<\/style>/.exec(svg);
  if (!styleBlock) return out;
  // Strip CSS comments first — they may contain literal "--bg" text
  const cleaned = styleBlock[1]!.replace(/\/\*[\s\S]*?\*\//g, '');
  const ruleMatch = /\bsvg\s*\{([\s\S]*?)\}/.exec(cleaned);
  if (!ruleMatch) return out;
  // Split on `;` not inside parentheses (color-mix has commas inside)
  for (const decl of ruleMatch[1]!.split(/;(?![^()]*\))/)) {
    const m = /^\s*--([\w-]+)\s*:\s*(.+?)\s*$/.exec(decl.trim());
    if (m) out[m[1]!] = m[2]!;
  }
  return out;
}

function resolveExpr(
  expr: string,
  vars: Record<string, string>,
  cache: Map<string, string>,
  depth = 0,
): string {
  if (depth > 16) return '#000000';
  expr = expr.trim();

  // Hex literal (3/4/6/8 digits)
  if (/^#[0-9a-f]{3,8}$/i.test(expr)) return expr;

  // var(--name) or var(--name, fallback)
  const varMatch = /^var\(\s*--([\w-]+)\s*(?:,\s*([\s\S]+))?\)$/.exec(expr);
  if (varMatch) {
    const name = varMatch[1]!;
    if (cache.has(name)) return cache.get(name)!;
    if (vars[name] !== undefined) {
      const r = resolveExpr(vars[name]!, vars, cache, depth + 1);
      cache.set(name, r);
      return r;
    }
    return varMatch[2] ? resolveExpr(varMatch[2]!, vars, cache, depth + 1) : '#000000';
  }

  // color-mix(in srgb, A P%, B [Q%])
  const mixMatch = /^color-mix\(\s*in\s+srgb\s*,\s*([\s\S]+)\)$/.exec(expr);
  if (mixMatch) {
    const parts = splitTopLevel(mixMatch[1]!, ',');
    if (parts.length < 2) return expr;
    const A = parsePctPart(parts[0]!);
    const B = parsePctPart(parts[1]!);
    if (!A || !B) return expr;
    const pA = A.pct ?? (B.pct != null ? 100 - B.pct : 50);
    const pB = B.pct ?? (A.pct != null ? 100 - A.pct : 50);
    const aHex = resolveExpr(A.color, vars, cache, depth + 1);
    const bHex = resolveExpr(B.color, vars, cache, depth + 1);
    const aRgb = parseHex(aHex);
    const bRgb = parseHex(bHex);
    if (!aRgb || !bRgb) return '#000000';
    return toHex(srgbMix(aRgb, pA / 100, bRgb, pB / 100));
  }

  return expr;
}

function parsePctPart(p: string): { color: string; pct: number | null } | null {
  const m = /^([\s\S]+?)\s+(\d+(?:\.\d+)?)%\s*$/.exec(p.trim());
  if (m) return { color: m[1]!.trim(), pct: parseFloat(m[2]!) };
  return { color: p.trim(), pct: null };
}

function splitTopLevel(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
}

function parseHex(hex: string): RGBA | null {
  const m = /^#([0-9a-f]{3,8})$/i.exec(hex.trim());
  if (!m) return null;
  let h = m[1]!;
  if (h.length === 3 || h.length === 4) {
    h = h
      .split('')
      .map((c) => c + c)
      .join('');
  }
  if (h.length === 6) h += 'ff';
  if (h.length !== 8) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: parseInt(h.slice(6, 8), 16) / 255,
  };
}

function toHex({ r, g, b, a }: RGBA): string {
  const c = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  if (a >= 0.999) return `#${c(r)}${c(g)}${c(b)}`;
  return `#${c(r)}${c(g)}${c(b)}${c(a * 255)}`;
}

function srgbMix(A: RGBA, pA: number, B: RGBA, pB: number): RGBA {
  const total = pA + pB;
  if (total <= 0) return A;
  const wA = pA / total;
  const wB = pB / total;
  return {
    r: A.r * wA + B.r * wB,
    g: A.g * wA + B.g * wB,
    b: A.b * wA + B.b * wB,
    a: A.a * wA + B.a * wB,
  };
}
