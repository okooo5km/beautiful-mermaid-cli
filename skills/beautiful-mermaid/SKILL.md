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
```

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
```

## Deep reference

See `reference.md` for the full flag table, the 15-theme list, and the `--json` schema summary.
