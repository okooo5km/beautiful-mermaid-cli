// Font-aware width compensation for beautiful-mermaid SVG output.
//
// beautiful-mermaid measures text width with a hardcoded char-class heuristic
// (see node_modules/beautiful-mermaid/src/text-metrics.ts) tuned for Inter.
// When the user supplies `--font` (e.g. HarmonyOS Sans) the actual rendered
// glyphs can be wider than the measured box, causing CJK / mixed-script text
// to overflow the rect. This module reads the user's font with fontkit, remea-
// sures every text node, and symmetrically expands the surrounding rect so
// the text fits — keeping `text-anchor="middle"` valid (text x stays put).
//
// It also reflows polyline/path edge endpoints whose anchor box was widened,
// and grows the SVG viewBox if any rect crossed the original bounds.
//
// Scope: only rect-based shapes (rectangle, stadium, subgraph header / outer,
// edge-label). Path-based shapes (hexagon, diamond, cylinder) are skipped in
// v1 with a one-shot stderr warning.
//
// okooo5km(十里)

import * as fontkit from 'fontkit';
import type { Font } from 'fontkit';

export interface FitOptions {
  fontBuffers: Uint8Array[];
  primaryFamily?: string;
  paddingX?: number;
  maxExpandPx?: number;
  reflowEdges?: boolean;
}

interface RectAttrs {
  x: number;
  y: number;
  width: number;
  height: number;
  rx: number;
  ry: number;
}

interface TextLine {
  text: string;
  fontSize: number;
  fontWeight: number;
}

interface BoxAdjustment {
  /** Old left edge. */
  oldX: number;
  /** Old right edge (oldX + oldW). */
  oldRight: number;
  /** New left edge after expansion. */
  newX: number;
  /** New right edge. */
  newRight: number;
}

interface ParsedBox {
  /** Outer match span in the source SVG (start..end of the <g>...</g>). */
  gStart: number;
  gEnd: number;
  kind: 'node' | 'edge-label' | 'subgraph';
  /** For nodes: data-shape value (e.g. 'rectangle' / 'stadium'). */
  shape?: string;
  /** Outer rect (always the first rect in the g block). */
  rect: RectAttrs;
  rectStart: number;
  rectEnd: number;
  /** Subgraph header rect, if present (second rect). */
  headerRect?: RectAttrs;
  headerStart?: number;
  headerEnd?: number;
  /** Lines of text (single text element with one or more tspans, or a single
   *  text node with a single line). */
  lines: TextLine[];
  /** node id from data-id (used to match polyline data-from / data-to). */
  dataId?: string;
}

const G_RE = /<g\b([^>]*)>([\s\S]*?)<\/g>/g;
const RECT_RE = /<rect\b([^>]*?)(?:\/>|>[\s\S]*?<\/rect>)/g;
const TEXT_RE = /<text\b([^>]*?)>([\s\S]*?)<\/text>/g;
const TSPAN_RE = /<tspan\b([^>]*?)(?:\/>|>([\s\S]*?)<\/tspan>)/g;

function attrNum(attrs: string, name: string): number | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  return Number.isFinite(n) ? n : undefined;
}

function attrStr(attrs: string, name: string): string | undefined {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
  return m ? m[1] : undefined;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

let pathShapeWarned = false;
function warnPathShape(shape: string, family: string): void {
  if (pathShapeWarned) return;
  pathShapeWarned = true;
  process.stderr.write(
    `warning: shape '${shape}' may overflow with custom font '${family}'; ` +
      `v1 fit-text-to-boxes only handles rect / stadium / subgraph / edge-label.\n`,
  );
}

/** Test-only: clear one-shot warning latches so consecutive tests fire afresh. */
export function _resetWarnings(): void {
  pathShapeWarned = false;
}

function loadFontkitFonts(buffers: Uint8Array[]): Font[] {
  const out: Font[] = [];
  for (const buf of buffers) {
    let parsed;
    try {
      parsed = fontkit.create(buf as Buffer);
    } catch {
      continue;
    }
    if ('fonts' in parsed && Array.isArray(parsed.fonts)) {
      // TTC / OTC: keep the regular face by default. fontkit doesn't expose a
      // canonical "regular" picker, so we take fonts[0] which the on-disk
      // ordering of every system collection we've seen places the regular at.
      const f = parsed.fonts[0];
      if (f) out.push(f);
    } else {
      out.push(parsed as Font);
    }
  }
  return out;
}

function pickFontForCodePoint(fonts: Font[], cp: number): Font | undefined {
  for (const f of fonts) {
    try {
      if (f.hasGlyphForCodePoint(cp)) return f;
    } catch {
      // older fontkit / unusual cmap — try next
    }
  }
  return fonts[0];
}

/** Measure a single line at the requested fontSize/weight using the supplied
 *  fontkit fonts (per-codepoint fallback). Returns advance width in px,
 *  including the same minimum padding the upstream library adds (0.15em). */
function measureLine(text: string, fonts: Font[], line: TextLine): number {
  if (!fonts.length || !text) return 0;
  let total = 0;
  // Iterate by code point to handle surrogate pairs correctly.
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp == null) continue;
    const f = pickFontForCodePoint(fonts, cp);
    if (!f) continue;
    let advance = 0;
    try {
      const run = f.layout(ch);
      advance = run.advanceWidth;
    } catch {
      advance = f.unitsPerEm;
    }
    total += (advance / f.unitsPerEm) * line.fontSize;
  }
  // Bold variant fallback when we couldn't load a true bold face.
  if (line.fontWeight >= 600) total *= 1.06;
  return total + line.fontSize * 0.15;
}

function parseRectAt(svg: string, idx: number): {
  attrs: RectAttrs;
  start: number;
  end: number;
} | null {
  RECT_RE.lastIndex = idx;
  const m = RECT_RE.exec(svg);
  if (!m) return null;
  const attrs = m[1] ?? '';
  const x = attrNum(attrs, 'x');
  const y = attrNum(attrs, 'y');
  const width = attrNum(attrs, 'width');
  const height = attrNum(attrs, 'height');
  if (x == null || y == null || width == null || height == null) return null;
  const rx = attrNum(attrs, 'rx') ?? 0;
  const ry = attrNum(attrs, 'ry') ?? 0;
  return {
    attrs: { x, y, width, height, rx, ry },
    start: m.index,
    end: m.index + m[0].length,
  };
}

function parseTextLines(gContent: string): TextLine[] {
  TEXT_RE.lastIndex = 0;
  const tm = TEXT_RE.exec(gContent);
  if (!tm) return [];
  const textAttrs = tm[1] ?? '';
  const inner = tm[2] ?? '';
  const fontSize = attrNum(textAttrs, 'font-size') ?? 13;
  const fontWeight = attrNum(textAttrs, 'font-weight') ?? 400;

  // Multi-line case: tspans inside text.
  const tspans: TextLine[] = [];
  TSPAN_RE.lastIndex = 0;
  let sm: RegExpExecArray | null;
  while ((sm = TSPAN_RE.exec(inner)) !== null) {
    const spanAttrs = sm[1] ?? '';
    const spanText = decodeEntities(sm[2] ?? '');
    const spanFontSize = attrNum(spanAttrs, 'font-size') ?? fontSize;
    const spanFontWeight = attrNum(spanAttrs, 'font-weight') ?? fontWeight;
    if (spanText) {
      tspans.push({ text: spanText, fontSize: spanFontSize, fontWeight: spanFontWeight });
    }
  }
  if (tspans.length) return tspans;

  // Single line.
  const txt = decodeEntities(inner.replace(/<[^>]+>/g, '').trim());
  if (!txt) return [];
  return [{ text: txt, fontSize, fontWeight }];
}

function parseBoxes(svg: string): ParsedBox[] {
  const boxes: ParsedBox[] = [];
  G_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = G_RE.exec(svg)) !== null) {
    const gAttrs = m[1] ?? '';
    const inner = m[2] ?? '';
    const gStart = m.index;
    const gEnd = m.index + m[0].length;
    const cls = attrStr(gAttrs, 'class') ?? '';

    let kind: ParsedBox['kind'];
    if (/\bnode\b/.test(cls)) kind = 'node';
    else if (/\bedge-?label\b/.test(cls)) kind = 'edge-label';
    else if (/\b(?:subgraph|cluster)\b/.test(cls)) kind = 'subgraph';
    else continue;

    // Locate the inner span within the full svg so rect offsets are absolute.
    const innerOffset = m.index + m[0].indexOf(inner);

    // First rect.
    const r1 = parseRectAt(svg, innerOffset);
    if (!r1 || r1.end > gEnd) continue;

    let r2: ReturnType<typeof parseRectAt> = null;
    if (kind === 'subgraph') {
      r2 = parseRectAt(svg, r1.end);
      if (r2 && r2.end > gEnd) r2 = null;
    }

    const lines = parseTextLines(inner);
    if (lines.length === 0) continue;

    const shape = attrStr(gAttrs, 'data-shape');
    const dataId = attrStr(gAttrs, 'data-id');

    const box: ParsedBox = {
      gStart,
      gEnd,
      kind,
      ...(shape ? { shape } : {}),
      rect: r1.attrs,
      rectStart: r1.start,
      rectEnd: r1.end,
      lines,
      ...(dataId ? { dataId } : {}),
    };
    if (r2) {
      box.headerRect = r2.attrs;
      box.headerStart = r2.start;
      box.headerEnd = r2.end;
    }
    boxes.push(box);
  }
  return boxes;
}

function availableWidthFor(box: ParsedBox, paddingX: number): number {
  const w = box.rect.width;
  const h = box.rect.height;
  if (box.kind === 'edge-label') return Math.max(0, w - 2 * 4);
  if (box.kind === 'subgraph') return Math.max(0, w - 2 * paddingX);
  // node:
  if (box.shape === 'stadium' || box.rect.rx >= h * 0.45) {
    // ellipse end caps eat ~h * 0.85 horizontally
    return Math.max(0, w - h * 0.85);
  }
  // rectangle / rect-rounded (and any other rect-shaped node)
  return Math.max(0, w - 2 * paddingX);
}

function paddingForKind(box: ParsedBox, nodePadding: number): number {
  if (box.kind === 'edge-label') return 4;
  if (box.kind === 'subgraph') return 8;
  return nodePadding;
}

function buildRectReplacement(orig: string, attrs: RectAttrs): string {
  // Replace x and width attributes (y/height untouched). We keep all other
  // attributes (fill, stroke, rx, ry…) verbatim so the visual style is intact.
  let out = orig;
  out = out.replace(/\bx="[^"]*"/, `x="${formatNum(attrs.x)}"`);
  out = out.replace(/\bwidth="[^"]*"/, `width="${formatNum(attrs.width)}"`);
  return out;
}

function formatNum(n: number): string {
  // Match upstream precision: avoid printing 1e-13 noise but keep enough digits
  // for sub-pixel layout. 4 fraction digits is plenty.
  if (Number.isInteger(n)) return String(n);
  return Number(n.toFixed(4)).toString();
}

interface NonPathShape {
  shape: string;
}

function isPathShape(box: ParsedBox): NonPathShape | null {
  if (box.kind !== 'node') return null;
  if (!box.shape) return null;
  // Known rect-based: rectangle / rect / rect-rounded / stadium. Anything else
  // is rendered with a <path> in beautiful-mermaid and we don't reshape paths.
  const rectShapes = new Set([
    'rectangle',
    'rect',
    'rect-rounded',
    'stadium',
    'rounded',
  ]);
  if (rectShapes.has(box.shape)) return null;
  return { shape: box.shape };
}

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function parseViewBox(svg: string): { vb: ViewBox; widthAttr: number; heightAttr: number } | null {
  const vbm = /<svg\b[^>]*\bviewBox="([^"]+)"/.exec(svg);
  if (!vbm) return null;
  const parts = vbm[1]!.trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const widthAttr = attrNum(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? '', 'width') ?? parts[2]!;
  const heightAttr = attrNum(/<svg\b([^>]*)>/.exec(svg)?.[1] ?? '', 'height') ?? parts[3]!;
  return {
    vb: { x: parts[0]!, y: parts[1]!, w: parts[2]!, h: parts[3]! },
    widthAttr,
    heightAttr,
  };
}

export function fitTextToBoxes(svg: string, opts: FitOptions): string {
  if (!opts.fontBuffers || opts.fontBuffers.length === 0) return svg;
  const fonts = loadFontkitFonts(opts.fontBuffers);
  if (!fonts.length) return svg;

  const paddingX = opts.paddingX ?? 12;
  const maxExpand = opts.maxExpandPx ?? 200;
  const reflowEdges = opts.reflowEdges ?? true;
  const family = opts.primaryFamily ?? fonts[0]!.familyName ?? 'custom';

  // Scan for path-based node shapes (hexagon / diamond / cylinder etc.) that
  // we don't reshape in v1. We warn once per process so the user knows the
  // diagram may still overflow even after the fit pass.
  const RECT_SHAPES = new Set(['rectangle', 'rect', 'rect-rounded', 'stadium', 'rounded']);
  const SHAPE_SCAN = /<g\b[^>]*\bclass="[^"]*\bnode\b[^"]*"[^>]*\bdata-shape="([^"]+)"/g;
  let sm: RegExpExecArray | null;
  while ((sm = SHAPE_SCAN.exec(svg)) !== null) {
    const shape = sm[1] ?? '';
    if (shape && !RECT_SHAPES.has(shape)) warnPathShape(shape, family);
  }

  const boxes = parseBoxes(svg);
  if (boxes.length === 0) return svg;

  // 1) Initial measurement + symmetric expansion per box.
  const adjustments = new Map<ParsedBox, BoxAdjustment>();
  for (const box of boxes) {
    const pathShape = isPathShape(box);
    if (pathShape) {
      warnPathShape(pathShape.shape, family);
      continue;
    }
    let actualMax = 0;
    for (const line of box.lines) {
      const w = measureLine(line.text, fonts, line);
      if (w > actualMax) actualMax = w;
    }
    const pad = paddingForKind(box, paddingX);
    const avail = availableWidthFor(box, pad);
    if (actualMax <= avail) continue;
    let delta = actualMax - avail;
    if (delta > maxExpand) delta = maxExpand;
    const oldX = box.rect.x;
    const oldRight = oldX + box.rect.width;
    box.rect.x = oldX - delta / 2;
    box.rect.width = box.rect.width + delta;
    if (box.headerRect) {
      // header rect is sibling of outer (subgraph): keep them in lockstep
      box.headerRect.x = box.rect.x;
      box.headerRect.width = box.rect.width;
    }
    adjustments.set(box, {
      oldX,
      oldRight,
      newX: box.rect.x,
      newRight: box.rect.x + box.rect.width,
    });
  }

  // 2) Subgraph outer rect must enclose any child node we widened. SVG output
  //    has subgraph rects as siblings of the child nodes (not nested), so we
  //    detect membership by geometry: a node whose original rect lies inside
  //    a subgraph's original rect is considered a child.
  const subgraphs = boxes.filter((b) => b.kind === 'subgraph');
  for (const sg of subgraphs) {
    const adj = adjustments.get(sg);
    const sgX0 = adj ? adj.oldX : sg.rect.x;
    const sgRight0 = adj ? adj.oldRight : sg.rect.x + sg.rect.width;
    const sgY0 = sg.rect.y;
    const sgY1 = sg.rect.y + sg.rect.height;
    let needLeft = sg.rect.x;
    let needRight = sg.rect.x + sg.rect.width;
    for (const child of boxes) {
      if (child === sg) continue;
      if (child.kind !== 'node') continue;
      // Child membership uses ORIGINAL geometry to avoid double-counting
      // when both sg and child were widened.
      const cAdj = adjustments.get(child);
      const cX0 = cAdj ? cAdj.oldX : child.rect.x;
      const cRight0 = cAdj ? cAdj.oldRight : child.rect.x + child.rect.width;
      const cY0 = child.rect.y;
      const cY1 = child.rect.y + child.rect.height;
      const insideOriginally =
        cX0 >= sgX0 - 0.5 && cRight0 <= sgRight0 + 0.5 && cY0 >= sgY0 - 0.5 && cY1 <= sgY1 + 0.5;
      if (!insideOriginally) continue;
      const padInside = 8;
      if (child.rect.x - padInside < needLeft) needLeft = child.rect.x - padInside;
      if (child.rect.x + child.rect.width + padInside > needRight) {
        needRight = child.rect.x + child.rect.width + padInside;
      }
    }
    const oldX = sg.rect.x;
    const oldRight = sg.rect.x + sg.rect.width;
    if (needLeft < oldX || needRight > oldRight) {
      const baseAdj = adjustments.get(sg);
      const trackOldX = baseAdj ? baseAdj.oldX : oldX;
      const trackOldRight = baseAdj ? baseAdj.oldRight : oldRight;
      sg.rect.x = needLeft;
      sg.rect.width = needRight - needLeft;
      if (sg.headerRect) {
        sg.headerRect.x = sg.rect.x;
        sg.headerRect.width = sg.rect.width;
      }
      adjustments.set(sg, {
        oldX: trackOldX,
        oldRight: trackOldRight,
        newX: sg.rect.x,
        newRight: sg.rect.x + sg.rect.width,
      });
    }
  }

  // 3) Build a new SVG by replacing rect attributes in place. Splice from end
  //    to start so earlier offsets stay valid.
  const sliceOps: Array<{ start: number; end: number; replacement: string }> = [];
  for (const box of boxes) {
    if (!adjustments.has(box) && !box.headerRect) continue;
    const adj = adjustments.get(box);
    if (adj) {
      const orig = svg.slice(box.rectStart, box.rectEnd);
      sliceOps.push({
        start: box.rectStart,
        end: box.rectEnd,
        replacement: buildRectReplacement(orig, box.rect),
      });
      if (box.headerRect && box.headerStart != null && box.headerEnd != null) {
        const horig = svg.slice(box.headerStart, box.headerEnd);
        sliceOps.push({
          start: box.headerStart,
          end: box.headerEnd,
          replacement: buildRectReplacement(horig, box.headerRect),
        });
      }
    }
  }
  sliceOps.sort((a, b) => a.start - b.start);
  let out = '';
  let cursor = 0;
  for (const op of sliceOps) {
    out += svg.slice(cursor, op.start);
    out += op.replacement;
    cursor = op.end;
  }
  out += svg.slice(cursor);

  // 4) Edge endpoint reflow. We match polyline/path edges by data-from /
  //    data-to to the corresponding box's data-id, then shift the first or
  //    last X coordinate by the same amount the box's matching edge moved.
  if (reflowEdges) {
    const byId = new Map<string, BoxAdjustment>();
    for (const [box, adj] of adjustments) {
      if (box.dataId) byId.set(box.dataId, adj);
    }
    if (byId.size > 0) {
      out = reflowEdgesInSvg(out, byId);
    }
  }

  // 5) viewBox / width / height extension.
  out = updateViewBox(out, boxes);

  return out;
}

function reflowEdgesInSvg(svg: string, byId: Map<string, BoxAdjustment>): string {
  const POLY_RE = /<polyline\b([^>]*)\/>/g;
  return svg.replace(POLY_RE, (full, attrs: string) => {
    if (!/\bclass="edge"/.test(attrs)) return full;
    const from = /\bdata-from="([^"]*)"/.exec(attrs)?.[1];
    const to = /\bdata-to="([^"]*)"/.exec(attrs)?.[1];
    const fromAdj = from ? byId.get(from) : undefined;
    const toAdj = to ? byId.get(to) : undefined;
    if (!fromAdj && !toAdj) return full;
    const ptsM = /\bpoints="([^"]+)"/.exec(attrs);
    if (!ptsM) return full;
    const original = ptsM[1]!.trim().split(/\s+/).map((p) => {
      const [xs, ys] = p.split(',');
      return { x: parseFloat(xs!), y: parseFloat(ys!) };
    });
    if (original.length < 2 || original.some((pt) => !Number.isFinite(pt.x) || !Number.isFinite(pt.y))) {
      return full;
    }
    const pts = original.map((pt) => ({ x: pt.x, y: pt.y }));
    const oldFirstX = original[0]!.x;
    const oldLastX = original[original.length - 1]!.x;

    if (fromAdj) pts[0]!.x = shiftEndpoint(oldFirstX, fromAdj);
    if (toAdj) pts[pts.length - 1]!.x = shiftEndpoint(oldLastX, toAdj);

    // Keep orthogonal legs orthogonal: any interior vertex whose original X
    // matched an endpoint's original X gets dragged to that endpoint's new X.
    // (beautiful-mermaid emits axis-aligned routing for flowchart edges.)
    if (fromAdj) {
      const newFirstX = pts[0]!.x;
      for (let i = 1; i < pts.length - 1; i++) {
        if (Math.abs(original[i]!.x - oldFirstX) < 0.001) pts[i]!.x = newFirstX;
      }
    }
    if (toAdj) {
      const newLastX = pts[pts.length - 1]!.x;
      for (let i = pts.length - 2; i > 0; i--) {
        if (Math.abs(original[i]!.x - oldLastX) < 0.001) pts[i]!.x = newLastX;
      }
    }
    const newPts = pts.map((pt) => `${formatNum(pt.x)},${formatNum(pt.y)}`).join(' ');
    return full.replace(/\bpoints="[^"]*"/, `points="${newPts}"`);
  });
}

function shiftEndpoint(oldEndX: number, adj: BoxAdjustment): number {
  // Pick whichever original side the endpoint is closest to.
  const distLeft = Math.abs(oldEndX - adj.oldX);
  const distRight = Math.abs(oldEndX - adj.oldRight);
  if (distRight <= distLeft) return oldEndX + (adj.newRight - adj.oldRight);
  return oldEndX + (adj.newX - adj.oldX);
}

function updateViewBox(svg: string, boxes: ParsedBox[]): string {
  const vbInfo = parseViewBox(svg);
  if (!vbInfo) return svg;
  const { vb, widthAttr, heightAttr } = vbInfo;

  let minX = vb.x;
  let maxX = vb.x + vb.w;
  for (const box of boxes) {
    const left = box.rect.x;
    const right = box.rect.x + box.rect.width;
    if (left < minX) minX = left;
    if (right > maxX) maxX = right;
  }
  const newW = maxX - minX;
  if (Math.abs(minX - vb.x) < 0.5 && Math.abs(newW - vb.w) < 0.5) return svg;

  // Translate everything so minX -> 0 (matches upstream's leading-zero origin
  // when nothing crosses the left edge). Rather than rewrite every coordinate
  // in the SVG body, we shift the viewBox window and width attr to keep the
  // rendered region the same.
  const newVb = `${formatNum(minX)} ${formatNum(vb.y)} ${formatNum(newW)} ${formatNum(vb.h)}`;
  const widthScale = newW / vb.w;
  const newWidthAttr = formatNum(widthAttr * widthScale);
  // height left untouched (we never adjust y bounds in v1)
  const newHeightAttr = formatNum(heightAttr);

  let out = svg.replace(/(<svg\b[^>]*?\bviewBox=)"[^"]+"/, `$1"${newVb}"`);
  out = out.replace(/(<svg\b[^>]*?\bwidth=)"[^"]+"/, `$1"${newWidthAttr}"`);
  out = out.replace(/(<svg\b[^>]*?\bheight=)"[^"]+"/, `$1"${newHeightAttr}"`);
  return out;
}
