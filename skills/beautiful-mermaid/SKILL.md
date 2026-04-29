---
name: beautiful-mermaid
description: Render Mermaid diagrams as SVG, PNG, or ASCII art via the `bm` CLI. Use when the user asks to render, visualize, or generate a flowchart, sequence diagram, ER diagram, state diagram, class diagram, gantt chart, or any Mermaid graph.
---

# beautiful-mermaid

Render Mermaid diagrams to SVG, PNG, or terminal ASCII through the `bm` CLI from `beautiful-mermaid-cli`.

## When to use

- The user wants to render a Mermaid diagram (`graph`, `flowchart`, `sequenceDiagram`, `classDiagram`, `stateDiagram`, `erDiagram`, `gantt`, …) to an image file.
- The user pastes Mermaid source and asks for a rendered visual.
- The user wants ASCII / Unicode box-drawing output for a diagram in the terminal.
- The user asks to render with a specific font, or to know which fonts are available — first call `bm fonts --json` to enumerate the system, then pass `--font <family>` (or `--font-file <path>`) to `bm render`.

## Prerequisites

Confirm the `bm` binary, fonts, and PNG WASM runtime are usable before rendering programmatically:

```bash
bm doctor --json
```

If `bm` is missing: `npm i -g beautiful-mermaid-cli` (or `brew install okooo5km/tap/bm`).

## Core commands

```bash
# SVG (default)
bm render -c '<mermaid source>' -o out.svg

# PNG with theme & 2x scale
bm render -c '<mermaid source>' -o out.png --theme dracula --scale 2

# Terminal ASCII / Unicode box-drawing
bm ascii -c '<mermaid source>'

# List the 15 built-in themes
bm themes

# List system fonts (use --filter cjk / mono / latin to narrow)
bm fonts --json --filter cjk

# Render with a custom font (CJK example) — affects both SVG & PNG
bm render -c '<mermaid source>' -o out.png --font 'Source Han Sans CN'

# Distinct mono font for code-class text (PNG only)
bm render -c '<mermaid source>' -o out.png --font 'Inter' --font-mono 'JetBrains Mono'

# Render using a font file directly (when --font name is ambiguous; PNG only)
bm render -c '<mermaid source>' -o out.png --font-file /path/to/MyFont.ttf
```

Font semantics differ between SVG and PNG:
- **SVG**: `--font` is baked into the markup as a `font-family` declaration. The
  reader (browser, editor) needs that font installed to see it. `--font-mono`
  and `--font-file` are ignored for SVG. Emoji and CJK render as long as the
  reader has matching system fonts — this almost always works.
- **PNG**: `bm` resolves the font on the local system, embeds rasterized glyphs.
  All three flags participate in resvg's per-glyph fallback, so mixed CJK/Latin
  diagrams render correctly even when the chosen font has only Latin coverage.

### PNG emoji: glyphs missing, surrounding text intact

PNG output **cannot render emoji glyphs** — resvg-wasm does not implement
COLRv1 (Noto Color Emoji, Twemoji, Segoe UI Emoji v2) or sbix (Apple Color
Emoji). Emoji codepoints in the input render as blank space in the PNG.

The good news: surrounding **Latin / CJK text renders correctly**. `bm`
loads the OS-bundled emoji font (Apple Color Emoji on macOS, Noto Color
Emoji on Linux, Segoe UI Emoji on Windows) into `fontBuffers` purely as
a shaping shim — its presence claims the emoji codepoints in cmap, which
prevents them from corrupting the per-glyph fallback for nearby CJK
characters. Without the shim, mixed `[🚀 中文]` text would render entirely
as tofu boxes.

`bm render -o foo.png` emits a one-shot stderr warning when the input
contains emoji.

**SVG output preserves emoji** — the viewer renders them via system fonts.

If a user asks to render emoji:
1. Strongly prefer `bm render -o foo.svg`.
2. If they need PNG specifically, warn them emoji glyphs will be missing
   (surrounding text is fine), or suggest rendering to SVG first then
   rasterizing with a real-text-engine tool (Inkscape, librsvg, Chrome
   headless).
3. `bm fonts --filter emoji` lists emoji fonts the system has — useful
   awareness but does not change PNG output.

Source may also come from a file (`bm render diagram.mmd ...`) or stdin (`cat x.mmd | bm render -o out.svg`).

## For programmatic / agent use

Every subcommand accepts `--json` for a stable, machine-readable contract (`schema_version: 1`):

- Success payloads → **stdout**; error payloads → **stderr**. Never mixed.
- Exit codes: `0` success, `1` WASM/unclassified, `2` usage, `3` parse, `4` I/O.
- PNG cannot be inlined in JSON — always pass `-o <file>` for PNG output.

```bash
bm render --json -c 'graph LR\n  A-->B' -o out.svg
bm themes --json
bm ascii --json -c 'graph LR\n  A-->B'
bm fonts --json --filter cjk      # discover available CJK fonts
```

## Deep reference

See `reference.md` for the full flag table, the 15-theme list, and the `--json` schema summary.
