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
- Node matrix: 20 / 22 (LTS only — 18 EOL'd 2025-04 and is excluded).
- Releases triggered by `v*` git tag → npm with provenance + GitHub Release + Homebrew tap auto-bump.
- Local `npm publish` is **not used** — provenance requires CI.

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

## Lint / Format

- **ESLint**: flat config in `eslint.config.js` (ESLint 9). Uses `@typescript-eslint` + `eslint:recommended`; `eslint-config-prettier` disables formatting rules to leave them to Prettier.
- **Prettier**: config in `.prettierrc` (`singleQuote`, `printWidth: 100`, `trailingComma: 'all'`). Run `npm run format` to auto-format. `.prettierignore` excludes `dist/` and lockfiles.
- **Vitest**: config in `vitest.config.ts`. Tests live in `tests/**/*.test.ts`.
- **Bun task policy**: under Bun, run `bun run test` (which invokes vitest), **never** `bun test` — Bun's native test runner is incompatible with vitest's API.

## Release

```bash
git checkout main && git pull
npm version patch  # or minor / major
git push --follow-tags
# GitHub Actions handles npm publish + Release + Homebrew bump
```
