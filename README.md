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

## License

[MIT](LICENSE) © okooo5km(十里)
