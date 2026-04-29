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
├── core/
│   ├── options.ts        # Theme + flag → RenderOptions builder
│   ├── render-svg.ts     # SVG pass-through to beautiful-mermaid (+ optional fit pass)
│   ├── render-ascii.ts   # ASCII / Unicode renderer
│   ├── render-png.ts     # SVG → PNG via resvg-wasm (uses svg-flatten + fonts)
│   ├── svg-flatten.ts    # CSS var() / color-mix() → concrete hex (PNG-only)
│   ├── svg-text-fit.ts   # Font-aware width compensation when --font is set
│   └── fonts.ts          # System font probing, returns Uint8Array buffers
├── io/                   # input.ts (file/stdin/-c), output.ts
└── utils/                # format inference, error formatting
tests/
└── fixtures/             # Sample .mmd files per diagram type
doc/                      # Design docs (architecture, theming, png)
skills/
└── beautiful-mermaid/    # Claude Agent Skill (SKILL.md + reference.md)
                          # Auto-discovered by `npx skills add okooo5km/beautiful-mermaid-cli`.
                          # Not bundled in the npm tarball — agents pull it from GitHub.
```

## PNG rendering pipeline (resvg-wasm constraints)

PNG output flows through `@resvg/resvg-wasm`, which has two non-obvious
limitations that bit us in v0.1.0 and shaped the current pipeline:

1. **CSS Color L4/L5 unsupported.** beautiful-mermaid's SVG output uses
   `var(--xxx)` and `color-mix(in srgb, ...)` for every color. resvg
   silently falls back to black on any unresolved color expression →
   the result is huge black rectangles with no text. Browsers (and
   macOS Preview) handle this fine, but resvg cannot. Fix: `src/core/svg-flatten.ts`
   walks the SVG once before render, resolves all `var()` and `color-mix()`
   to concrete hex literals, strips `@import url(...)` (resvg cannot fetch
   network resources), and rewrites `font-family` to a name we have actually
   loaded. Only the PNG path is flattened; SVG output is the original
   beautiful-mermaid string.
2. **System font loading is broken in wasm.** The `loadSystemFonts`,
   `fontDirs`, and `fontFiles` options on `Resvg` silently fail in the
   wasm runtime because wasm has no filesystem enumeration. The native
   `@resvg/resvg-js` package supports them, but we deliberately stick
   with wasm to keep "no native build" guarantees. The only working
   path for fonts is `font.fontBuffers: Uint8Array[]` — pre-read font
   files in JS and hand the bytes over. `src/core/fonts.ts` probes a
   short, per-OS list of well-known system font paths (macOS Helvetica,
   Linux DejaVu / Liberation, Windows Arial / Segoe) and caches the
   loaded buffers per process. If nothing exists, text won't render but
   the rest of the diagram will — graceful degradation.

**Consequence**: do NOT switch to `@resvg/resvg-js` to "simplify" font
loading. The wasm path is intentional. If a future version of resvg-wasm
adds CSS L5 support upstream, `svg-flatten.ts` becomes vestigial and can
be deleted in one shot.

### CJK rendering

CJK (中 / 日 / 한) glyphs are mostly absent from the Latin candidates above,
so loading only Helvetica/DejaVu/Arial produces tofu boxes for any non-Latin
text. The fix has two parts, both already wired:

1. **Per-OS CJK candidates** — `src/core/fonts.ts` probes a second list of
   well-known CJK font paths after the Latin list and tags them
   `coverage: 'cjk'`. Default candidates:
   - **macOS** — `/System/Library/Fonts/PingFang.ttc` (`PingFang SC`,
     pan-CJK), `Hiragino Sans GB.ttc`, `ヒラギノ角ゴシック W3.ttc`
     (`Hiragino Sans` JP), `AppleSDGothicNeo.ttc` (KR).
   - **Windows** — `msyh.ttc` (`Microsoft YaHei`, SC), `msjh.ttc`
     (`Microsoft JhengHei`, TC), `simsun.ttc`, `YuGothR.ttc` /
     `YuGothic.ttc` (`Yu Gothic`, JP), `meiryo.ttc`,
     `malgun.ttf` (`Malgun Gothic`, KR).
   - **Linux** — Noto Sans CJK at the Debian/Ubuntu, Fedora, and Arch
     paths, then WenQuanYi Micro Hei / Zen Hei as legacy fallbacks. Linux
     does **not** ship CJK fonts by default — users on minimal images
     (Docker `node:slim`, etc.) must install one explicitly:
     `apt install fonts-noto-cjk` / `dnf install google-noto-sans-cjk-fonts`
     / `pacman -S noto-fonts-cjk`. `bm doctor` reports `cjk_family: none`
     when nothing was found, and `bm render -o foo.png` writes a one-shot
     stderr warning the first time CJK text is detected without a CJK font.

2. **font-family stack rewrite** — the old code rewrote every `font-family`
   declaration to a single Latin family, which defeated resvg/usvg's
   per-glyph fallback. `svg-flatten.ts` now takes `fontFamilyStack: string[]`
   instead and emits a `Latin, CJK, sans-serif` stack so resvg falls through
   to the CJK family on a per-glyph basis. Generic CSS keywords pass through
   bare; quoted family names are emitted with double quotes in `<style>`
   rules and single quotes in XML attributes (so the attribute's outer
   double quotes are not terminated).

`bm doctor` exposes the loaded families separately as
`fonts.latin_family` and `fonts.cjk_family` (both optional, additive in
schema v1). The human output prints a dedicated `CJK font` row alongside
the existing `fonts` row.

### User font overrides

v0.2.2 adds three flags that let the user (or an agent) override the
default font choice on a per-render basis. They flow through different
parts of the pipeline:

| Flag              | SVG path                                  | PNG path                                                                 |
|-------------------|-------------------------------------------|--------------------------------------------------------------------------|
| `--font <family>` | Forwarded to beautiful-mermaid as `RenderOptions.font`; baked into the SVG markup. | Resolved via `font-discovery` against system font directories; loaded buffer prepended to `fontBuffers`; family inserted at the head of the family stack so resvg's per-glyph fallback prefers it. |
| `--font-mono <family>` | **Ignored** — beautiful-mermaid does not yet expose a separate mono slot. | Same as `--font` but populates the mono slot, used by `flattenSvgForRaster` only when an SVG declaration contains the `monospace` keyword. |
| `--font-file <path>`   | Ignored.                            | Read directly via `fs.readFile`; family name extracted with fontkit; takes priority over `--font` for the user-primary slot (avoids family-name disambiguation when multiple installed fonts share a name). |

Stack composition in `render-png.ts`:

```
sansStack = [userFamily?, latinFamily?, cjkFamily?, 'sans-serif']
monoStack = [userMonoFamily?, latinFamily?, cjkFamily?, 'monospace']
```

resvg/usvg walks the stack per glyph, so a Latin code font with no CJK
coverage still produces correct output for mixed-script diagrams (CJK
glyphs fall through to `cjkFamily`). When the user-supplied family is
not found on the system, `loadSystemFontBuffers()` emits a one-shot
stderr warning and degrades to the hardcoded candidate fallback path —
the render never fails just because a custom font was missing.

#### Font-aware width compensation (`svg-text-fit.ts`)

beautiful-mermaid measures text width with a hardcoded char-class
heuristic tuned for Inter (see `node_modules/beautiful-mermaid/src/text-metrics.ts`).
When the user supplies a wider font (HarmonyOS Sans, Source Han Sans,
etc.), CJK and mixed-script labels can overflow the rect sized for
Inter. The fit pass closes that gap **only when `--font` / `--font-file`
is set** — the no-flag case is byte-exact identical to v0.2.2 output.

Pipeline: `renderSvg` runs after `renderMermaidSVG` and remeasures every
text node with fontkit against the user's actual font (with per-codepoint
fallback through the loaded buffers). For each rect-bearing `<g>`
(node / subgraph outer + header / edge-label) it expands the rect
symmetrically — `oldX -= delta/2; oldW += delta` — so `text-anchor="middle"`
is preserved (text x is untouched). Stadium nodes use `avail = w - h * 0.85`
to leave room for the elliptical caps. Subgraph outers get a second pass
that grows them to enclose any child node whose new bbox exceeds the
original outer. Polyline edges are reflowed by matching `data-from` /
`data-to` to box `data-id` and shifting endpoint X by the same amount the
adjacent box edge moved, with collinear interior vertices dragged along
to keep orthogonal routing intact.

Path-shape nodes (hexagon / diamond / cylinder / ...) are out of scope in
v1: the rect → path remap is non-trivial because the bounding box and
visible shape diverge. We emit a one-shot stderr warning when a non-rect
shape is detected, and otherwise leave the SVG alone.

**SVG dimensions may grow.** When an expanded rect crosses the original
viewBox, the pass widens `viewBox` and the `width` attribute to keep the
content visible. The JSON `dimensions` field reflects the post-fit box,
which is additive under `schema_version: 1`.

### Emoji handling: shaping shim, glyph rendering disabled

resvg-wasm 2.6.x cannot render any modern color emoji format — COLRv1
(Noto Color Emoji, Twemoji, Segoe UI Emoji v2), sbix (Apple Color Emoji),
or SVG-in-OpenType (Adobe). We verified empirically: feeding only emoji
fonts plus an emoji-only SVG to resvg produces a blank PNG.

Even worse, **without** an emoji font in `fontBuffers`, mixed-script text
breaks: a `[🚀 中文]` label renders entirely as tofu, including the CJK
characters. resvg's per-glyph fallback shaping seems to fail across the
whole text run when no font's cmap covers an emoji codepoint.

Mitigation in `fonts.ts`: load the OS-bundled emoji font as a *shaping
shim* — its cmap covers emoji codepoints, which prevents the per-glyph
shaper from corrupting the rest of the run. The emoji glyphs themselves
still fail (blank space) but Latin / CJK render correctly.

Coverage is `'emoji'`. Per-platform shim:

- **macOS**: `/System/Library/Fonts/Apple Color Emoji.ttc` (sbix, ships
  with the OS — always present).
- **Windows**: `C:\Windows\Fonts\seguiemj.ttf` (COLR, Vista+).
- **Linux**: `Noto Color Emoji` from `fonts-noto-color-emoji` (apt) /
  `google-noto-color-emoji-fonts` (dnf) / `noto-fonts-emoji` (pacman).
  When absent, mixed emoji + CJK input may break — CI installs
  `fonts-noto-cjk` but not the emoji package, so this is a known soft
  spot for minimal Linux containers without the emoji package.

`LoadedFonts` does **not** expose `emojiFamily`, and the family stack
emitted by `flattenSvgForRaster` does **not** include the emoji family.
The shim is intentionally invisible to consumers because exposing it as
`emoji_family` would mislead users into thinking emoji glyphs render.
`render-png.ts` emits a one-shot stderr warning when SVG contains emoji
codepoints.

`font-discovery.ts` keeps the `'emoji'` coverage tag for the unrelated
`bm fonts --filter emoji` command — that command lists what emoji fonts
are installed system-wide, separate from the PNG-render shim slot.

When resvg-wasm gains real color-emoji support upstream, the cleanup
path: re-introduce `emojiFamily` to `LoadedFonts`, append it to the
family stacks in `render-png.ts`, surface `emoji_family` in doctor, and
remove the warning.

### `bm fonts` and `font-discovery.ts`

The `bm fonts` command (and the `--font` / `--font-file` resolution)
share `src/core/font-discovery.ts`, which uses `fontkit` to parse every
`.ttf` / `.otf` / `.ttc` / `.otc` it finds under the OS-standard font
directories. fontkit is added to `dependencies` (~5.6 MB, 9 transitive
deps, pure JS, supports `.ttc`).

`font-discovery.ts` is **not** in the PNG default hot path. The
hardcoded candidate list in `fonts.ts` still serves the no-flag PNG
case in millisecond cold-start. Discovery only runs when the user
passes `--font` / `--font-file` / runs `bm fonts`.

## Agent Interface Contract

Since v0.2.0, every subcommand accepts `--json` for machine-readable output.
Treat this as a **stable contract**:

- **stdout** carries JSON success payloads; **stderr** carries JSON error payloads.
  Never mix.
- Each payload is one line of JSON terminated by `\n`. The first key is always
  `"schema_version": 1`.
- Exit codes are part of the contract (see `src/utils/errors.ts`):
  `0` success, `1` unclassified, `2` usage / unknown theme / guard violation,
  `3` parse error, `4` I/O error.
- `--json` mode emits **no ANSI escapes** (errors skip `picocolors`).
- `--json` is opt-in; no flags change default human-facing output.

What is guaranteed not to break inside `schema_version: 1`:

- Existing field names and types in success payloads (`themes`, `format`,
  `output`, `bytes`, `dimensions`, `svg`, `text`, `lines`, `theme`).
- The error envelope shape: `{ success: false, error: { code, type, message, ... } }`.
- Existing exit code numbers and their meanings.

What may change inside v1 (additive only):

- **New optional fields** on success or error payloads.
- New theme names appearing in `themes`.
- New error `type` values when new error classes are added.

Anything bigger — renaming a field, removing a field, changing an exit code,
changing the error envelope shape — bumps `schema_version` to `2` and is a
breaking change announced in the changelog.

The full per-command JSON schema (with examples) lives in
[`doc/agent-interface.md`](doc/agent-interface.md).

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
- **Agent Skill sync**: when the `--json` contract, exit codes, flag set, or theme
  catalog changes, update `skills/beautiful-mermaid/SKILL.md` and
  `skills/beautiful-mermaid/reference.md` in the same change. `reference.md` does
  not duplicate the schema — it summarizes and links to `doc/agent-interface.md`.

## CI / Release

- All workflows use **latest major versions** of GitHub Actions (see `doc/PLAN.md` §9.5 lock table).
- CI matrix (`ci.yml`): Node 20 / 22 (LTS only — 18 EOL'd 2025-04) × Ubuntu / macOS / Windows + Bun on all three OS.
- Release (`release.yml`) triggered by `v*` git tag → npm publish → GitHub Release → Homebrew formula bump.
- **Trusted Publishing (OIDC)**: `npm publish` runs without `NPM_TOKEN`. The workflow declares `id-token: write` and the package has a Trusted Publisher configured at `npmjs.com/package/beautiful-mermaid-cli/access` pointing at this repo + `release.yml`. Provenance attestation is automatic.
- **release.yml pins Node 24** (not the LTS-22 used by `ci.yml`) — Node 22's bundled npm 10.x lacks Trusted Publishing support, and `npm install -g npm@latest` mid-job hits a known self-upgrade bug (`MODULE_NOT_FOUND: promise-retry`). Node 24 ships npm 11.5+ out of the box.
- **Homebrew tap**: `okooo5km/homebrew-tap` (existing shared tap, also hosts `mms`, `ogvs`, `pngoptim`, `svgift`). The release workflow opens a bump PR via `dawidd6/action-homebrew-bump-formula` and immediately squash-merges it via `gh pr merge` (no manual step). Direct merge is safe because the action computes `url` + `sha256` from the actual tarball; no human review can catch what `brew style` cannot. If a future release needs to be reviewed before publishing, drop the `Auto-merge Homebrew bump PR` step in `release.yml` for that run.
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
# GitHub Actions handles npm publish (Trusted Publishing) + Release + Homebrew bump (auto-merged)
gh run watch --workflow Release --exit-status
```
