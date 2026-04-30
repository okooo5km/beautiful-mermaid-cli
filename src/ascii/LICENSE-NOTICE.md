# Vendored ASCII Renderer

The TypeScript modules in this directory (and its `parsers/` and `shapes/`
subdirectories) are adapted from upstream
[`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid)
v1.1.3 by Craft Docs, distributed under the MIT License.

We vendor instead of importing because the public exports of the npm
package do not surface the internal sub-parsers (`sequence/`, `class/`,
`er/`, `xychart/`) that the ASCII pipeline depends on, and because we
need to apply CJK display-width fixes that have not yet been upstreamed.

## Modifications by okooo5km(十里), 2026

- Introduced `width.ts` (`displayWidth` / `charWidth` powered by
  [`get-east-asian-width`](https://www.npmjs.com/package/get-east-asian-width)).
- Replaced every layout/centering site that used `String#length` as a
  display-width proxy with `displayWidth(...)`.
- Reworked `drawText` and the per-shape text-drawing loops so wide
  glyphs (CJK / Fullwidth) reserve two canvas cells (one glyph + one
  empty-string sentinel) — keeping the printed row aligned with the
  virtual grid the layout was computed against.
- Inlined upstream `MIX` constants and `normalizeBrTags` since they are
  not part of the published exports.

## Upstream license

```
MIT License

Copyright (c) 2026 Craft Docs

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
