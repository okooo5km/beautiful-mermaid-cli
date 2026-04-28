# beautiful-mermaid-cli (`bm`)

[![npm version](https://img.shields.io/npm/v/beautiful-mermaid-cli.svg)](https://www.npmjs.com/package/beautiful-mermaid-cli)
[![CI](https://github.com/okooo5km/beautiful-mermaid-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/okooo5km/beautiful-mermaid-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Provenance](https://img.shields.io/npm/provenance/beautiful-mermaid-cli)](https://www.npmjs.com/package/beautiful-mermaid-cli)

> Render Mermaid diagrams as **beautiful SVG / PNG / ASCII** from the command line, powered by [`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid).

## Features

- 🎨 **15 built-in themes** + per-color overrides for full palette control
- ⚡ **Pure JS stack** — no browser, no Puppeteer, no native build
- 🖼️ **SVG / PNG / ASCII** output (PNG via `@resvg/resvg-wasm`)
- 📥 Input from **file / stdin / inline `-c`**
- 🔄 **Node ≥ 20 & Bun ≥ 1.0** dual support

## Install

```bash
# npm
npm i -g beautiful-mermaid-cli

# Bun
bun add -g beautiful-mermaid-cli

# One-shot, no install
npx beautiful-mermaid-cli diagram.mmd -o out.svg
bunx beautiful-mermaid-cli diagram.mmd -o out.svg

# Homebrew
brew install okooo5km/tap/bm
```

## Usage

```bash
# SVG
bm diagram.mmd -o out.svg

# PNG with theme
bm diagram.mmd -o out.png --theme dracula --scale 2

# Inline code (Mermaid is multiline; use $'...\n...' or a heredoc)
bm -c $'graph LR\n  A-->B-->C' -o out.svg

# stdin
cat diagram.mmd | bm -o out.svg

# ASCII (Unicode box-drawing by default, --ascii for + - | fallback)
bm ascii diagram.mmd --color-mode truecolor
bm ascii diagram.mmd --ascii

# List themes
bm themes
```

See `bm --help` for all options.

## Use with AI Agents

Every subcommand accepts `--json` for stable, machine-readable output. JSON data is
written to **stdout**; JSON-encoded errors go to **stderr**. Exit codes are part of
the contract (see below). Mermaid source can be supplied as a path argument, via
`-c <text>`, or by piping to stdin — `bm` never prompts.

```bash
# List themes as JSON
bm themes --json

# Render and capture metadata + path (binary still on disk)
bm render --json -c $'graph LR\n  A-->B' -o out.svg

# No -o: SVG is inlined in the JSON payload (no temp file needed)
bm render --json -c $'graph LR\n  A-->B'

# ASCII text is always inlined (small payload)
bm ascii --json -c $'graph LR\n  A-->B'

# Self-check the environment (version, fonts, wasm)
bm doctor --json

# Errors are JSON too, on stderr; exit code is non-zero
bm render --json --theme drakula -c $'graph LR\n  A-->B' 2>err.json; echo $?
```

**Exit codes** (stable across 0.x):

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Unclassified error (e.g. WASM init) |
| 2 | Usage error (bad flags, unknown theme, PNG-to-stdout, `--json`+PNG without `-o`) |
| 3 | Parse error (invalid Mermaid source) |
| 4 | I/O error (file read/write) |

Every JSON payload begins with `"schema_version": 1`. Schema details and per-command
field tables live in [`doc/agent-interface.md`](doc/agent-interface.md).

## Install as a Claude Skill

The repo ships an [Agent Skill](https://docs.claude.com/en/docs/claude-code/skills)
at [`skills/beautiful-mermaid/`](skills/beautiful-mermaid/SKILL.md). Once installed,
Claude Code, Cursor, Codex, and other agents that support the `SKILL.md` spec will
auto-discover the `bm` CLI when the user asks to render a Mermaid diagram.

```bash
# Recommended — vercel-labs/skills installer (project- or user-scoped)
npx -y skills add okooo5km/beautiful-mermaid-cli

# Manual drop-in
git clone https://github.com/okooo5km/beautiful-mermaid-cli /tmp/bm
cp -r /tmp/bm/skills/beautiful-mermaid .claude/skills/

# Or via the GitHub CLI extension (where supported)
gh skill install okooo5km/beautiful-mermaid-cli
```

The skill assumes `bm` is on `PATH`. If it isn't, install via
`npm i -g beautiful-mermaid-cli` or `brew install okooo5km/tap/bm`.

## Companion Tool

`bm` produces SVG / PNG. To compress them losslessly before shipping or embedding, pair it with **Zipic**:

<p align="center">
  <a href="https://zipic.app"><img src="https://5km.tech/products/zipic/icon.png" width="60" height="60" alt="Zipic" style="border-radius: 12px;"></a>
</p>

- **[Zipic](https://zipic.app)** — Smart image compression for macOS, with native **SVG / PNG / WebP / AVIF / HEIC** support
  - 🔄 **Perfect Pairing**: `bm diagram.mmd -o out.png` → drop into Zipic → typically 5–10× smaller at the same visual quality
  - ✨ **Bonus**: One-step format conversion (SVG → optimized PNG / WebP) for diagrams you want to embed in Markdown / web
  - 🎯 **Workflow**: `bm` renders beautiful diagrams → Zipic ships them lean

Explore more [5KM Tech](https://5km.tech) products that bring simplicity to complex tasks.

## License

[MIT](LICENSE) © okooo5km(十里)
