# AGENTS.md — beautiful-mermaid-cli

> **This file is the single source of truth for project-level conventions, architecture, and workflows.**
> All future updates to project-level rules MUST land here. `CLAUDE.md` is intentionally kept as a one-line
> pointer to this file and should not be expanded. User-global instructions (`~/.claude/CLAUDE.md`) cover
> personal preferences (language, signing, tool-call hygiene) and remain disjoint from this file.

## Project Overview

A command-line wrapper around [`beautiful-mermaid`](https://github.com/lukilabs/beautiful-mermaid) that turns Mermaid diagrams into SVG / PNG / ASCII output.

- **Package name**: `beautiful-mermaid-cli`
- **Bin**: `bm` (primary), `beautiful-mermaid` (fallback)
- **Repo**: `github.com/okooo5km/beautiful-mermaid-cli`
- **License**: MIT
- **Author**: okooo5km(十里) <yetiannow@gmail.com>

## Tech Stack

- Language: TypeScript (ESM)
- Runtime: Node.js ≥ 20 / Bun ≥ 1.0 (dual support)
- Build: `tsc` → `dist/`
- Render core: `beautiful-mermaid`
- PNG: `@resvg/resvg-wasm` (optional dep, WASM) — loaded via `await import()` in `src/core/render-png.ts`; the wasm binary is located at runtime via `createRequire(import.meta.url).resolve('@resvg/resvg-wasm/index_bg.wasm')` and read with `fs.readFile`, so layout works under npm, pnpm, and Bun.
- CLI: `commander`
- Test: `vitest`

## Project Structure

```
src/
├── cli.ts                # Entry, shebang + commander wiring
├── commands/             # Subcommands (render / ascii / themes)
├── core/                 # Render pipeline (svg / png / ascii / options)
├── io/                   # input.ts (file/stdin/-c), output.ts
└── utils/                # format inference, error formatting
tests/
└── fixtures/             # Sample .mmd files per diagram type
doc/                      # Design docs (architecture, theming, png)
```

## Conventions

- **Code & comments**: English only.
- **File header signatures**: `okooo5km(十里)` when adding author tags.
- **No emojis in source code** unless explicitly requested.
- **Strict TS**: `strict: true`, `noUncheckedIndexedAccess: true`.
- **ESM only**: top-level `"type": "module"`, use `import`/`export`, no CommonJS.
- **Exit code semantics** (single source of truth: `src/utils/errors.ts`):
  - `0` success
  - `1` `WasmError` / unclassified
  - `2` `UsageError` / `ThemeNotFoundError` / commander unknown-option
  - `3` `ParseError` (Mermaid parse / render failure)
  - `4` `IoError` (file read/write failure)

## CI / Release

- All workflows use **latest major versions** of GitHub Actions (see `doc/PLAN.md` §9.5 lock table).
- CI matrix (`ci.yml`): Node 20 / 22 (LTS only — 18 EOL'd 2025-04) × Ubuntu / macOS / Windows + Bun on all three OS.
- Release (`release.yml`) triggered by `v*` git tag → npm publish → GitHub Release → Homebrew formula bump.
- **Trusted Publishing (OIDC)**: `npm publish` runs without `NPM_TOKEN`. The workflow declares `id-token: write` and the package has a Trusted Publisher configured at `npmjs.com/package/beautiful-mermaid-cli/access` pointing at this repo + `release.yml`. Provenance attestation is automatic.
- **release.yml pins Node 24** (not the LTS-22 used by `ci.yml`) — Node 22's bundled npm 10.x lacks Trusted Publishing support, and `npm install -g npm@latest` mid-job hits a known self-upgrade bug (`MODULE_NOT_FOUND: promise-retry`). Node 24 ships npm 11.5+ out of the box.
- **Homebrew tap**: `okooo5km/homebrew-tap` (existing shared tap, also hosts `mms`, `ogvs`, `pngoptim`, `svgift`). The bump action opens a PR; merge it manually to publish the new formula.
- Local `npm publish` is reserved for the one-time `0.0.0` placeholder used to claim the package name on npm. All tagged releases must flow through CI so provenance is intact.

## Documentation

- Update **this `AGENTS.md`** and `doc/` when architecture / conventions change. Do not expand `CLAUDE.md`.
- Per-feature docs live in `doc/`, not in `README.md`.
- Roadmap and decisions: `doc/PLAN.md`.

## Common Commands

```bash
npm run dev        # tsc --watch
npm run build      # tsc
npm test           # vitest run
npm run lint
npm run typecheck
```

## Package.json conventions

- `bin` paths must **not** have a leading `./` — npm 11+ strict validation rejects them and `npm pkg fix` strips them. Wrong: `"bm": "./dist/cli.js"`. Right: `"bm": "dist/cli.js"`.
- `publishConfig.registry` is pinned to `https://registry.npmjs.org/` so `npm publish` always targets the official registry, even when the developer's local `npm config get registry` points at a mirror (e.g. `npmmirror`).
- `publishConfig.provenance: true` is set so CI publishes always carry provenance. One-off local placeholder publishes must override with `--provenance=false` because they lack OIDC.

## Lint / Format

- **ESLint**: flat config in `eslint.config.js` (ESLint 9). Uses `@typescript-eslint` + `eslint:recommended`; `eslint-config-prettier` disables formatting rules to leave them to Prettier.
- **Prettier**: config in `.prettierrc` (`singleQuote`, `printWidth: 100`, `trailingComma: 'all'`). Run `npm run format` to auto-format. `.prettierignore` excludes `dist/` and lockfiles.
- **Vitest**: config in `vitest.config.ts`. Tests live in `tests/**/*.test.ts`.
- **Bun task policy**: under Bun, run `bun run test` (which invokes vitest), **never** `bun test` — Bun's native test runner is incompatible with vitest's API.

## Release

```bash
git checkout main && git pull
npm run lint && npm run typecheck && npm test && npm run build  # pre-flight
npm version patch  # or minor / major
git push --follow-tags
# GitHub Actions handles npm publish (Trusted Publishing) + Release + Homebrew bump PR
gh run watch --workflow Release --exit-status
gh pr list --repo okooo5km/homebrew-tap   # then merge the auto-generated bump PR
```
