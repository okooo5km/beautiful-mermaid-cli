// Display width helpers used across the vendored ASCII pipeline.
// CJK / Fullwidth / Wide code points occupy 2 terminal cells while
// JS String#length counts UTF-16 code units, so any layout math that
// assumed `.length === columns` was wrong for non-ASCII text.
//
// Box-drawing chars are EAW=Ambiguous; we render them as single-width
// because every existing layout in the pipeline already assumes 1 cell
// for them (so `ambiguousAsWide: false`).

import { eastAsianWidth } from 'get-east-asian-width'

export function charWidth(ch: string): 1 | 2 {
  const cp = ch.codePointAt(0)
  if (cp === undefined) return 1
  return eastAsianWidth(cp, { ambiguousAsWide: false })
}

export function isWide(codePoint: number): boolean {
  return eastAsianWidth(codePoint, { ambiguousAsWide: false }) === 2
}

/** Terminal display width of a string (CJK chars count as 2). */
export function displayWidth(s: string): number {
  let w = 0
  for (const ch of s) w += charWidth(ch)
  return w
}

/**
 * Iterate code points with their display widths.
 * Wraps `for…of` so callers can advance their cursors using the cell width.
 */
export function* iterCells(s: string): Generator<{ ch: string; width: 1 | 2 }> {
  for (const ch of s) yield { ch, width: charWidth(ch) }
}
