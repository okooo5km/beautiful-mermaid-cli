# beautiful-mermaid · Reference

Companion to `SKILL.md`. Read this when you need exact flag names, theme keys,
JSON field shapes, or exit-code semantics.

The authoritative `--json` schema lives in
[`doc/agent-interface.md`](https://github.com/okooo5km/beautiful-mermaid-cli/blob/main/doc/agent-interface.md);
this file is a deliberately compact summary.

---

## Subcommands

| Subcommand    | Purpose                                            |
|---------------|----------------------------------------------------|
| `bm render`   | Render Mermaid to SVG or PNG.                      |
| `bm ascii`    | Render Mermaid to ASCII / Unicode box-drawing.     |
| `bm themes`   | List built-in themes.                              |
| `bm doctor`   | Self-check: version, node, fonts, PNG WASM status. |

Source can be supplied as: a path argument (`bm render diagram.mmd`),
inline (`-c '<text>'`), or via stdin (no `-c` and no path argument).
`bm` never prompts.

---

## `bm render` flags

| Flag                  | Type      | Default | Notes                                                          |
|-----------------------|-----------|---------|----------------------------------------------------------------|
| `-o, --output <file>` | path      | —       | Output file. Required for PNG. Format inferred from extension. |
| `-f, --format <fmt>`  | `svg\|png`| inferred| Overrides extension-based format inference.                    |
| `-c, --code <text>`   | string    | —       | Inline Mermaid source.                                         |
| `--theme <name>`      | string    | —       | One of the 15 themes below.                                    |
| `--scale <n>`         | number    | `1`     | PNG render scale factor.                                       |
| `--padding <px>`      | number    | `40`    | Diagram padding.                                               |
| `--node-spacing <px>` | number    | `24`    | Spacing between nodes.                                         |
| `--rank-spacing <px>` | number    | `40`    | Spacing between ranks (flowcharts).                            |
| `--json`              | boolean   | off     | Emit machine-readable JSON (see below).                        |

## `bm ascii` flags

| Flag                       | Type                  | Default       | Notes                                  |
|----------------------------|-----------------------|---------------|----------------------------------------|
| `-o, --output <file>`      | path                  | —             | Write text to file in addition to JSON.|
| `-c, --code <text>`        | string                | —             | Inline Mermaid source.                 |
| `--ascii`                  | boolean               | off           | Pure ASCII (`+ - |`); default uses Unicode box-drawing. |
| `--color-mode <mode>`      | `none\|256\|truecolor`| `none`        | Force `none` in `--json` mode.         |
| `--json`                   | boolean               | off           | Emit JSON; text always inlined.        |

---

## Themes (15)

```
catppuccin-frappe   catppuccin-latte   catppuccin-macchiato   catppuccin-mocha
dracula             everforest         github-dark            github-light
gruvbox-dark        gruvbox-light      nord                   solarized-dark
solarized-light     tokyo-night        zinc-light
```

Always discover at runtime with `bm themes --json` — new themes may be added
within `schema_version: 1` (additive change).

---

## `--json` schema (v1) summary

All payloads share `"schema_version": 1` as the first key. Success on stdout,
errors on stderr. One UTF-8 line, terminated by `\n`. No ANSI escapes.

### `bm themes --json`

```json
{ "schema_version": 1, "themes": [{ "name": "...", "bg": "#RRGGBB", "fg": "#RRGGBB", "accent": "#RRGGBB" }], "count": 15 }
```

### `bm render --json`

| `-f` / inferred | `-o <file>` | Result                                                                          |
|-----------------|-------------|---------------------------------------------------------------------------------|
| `svg`           | provided    | Writes file; JSON has `output` (absolute path), `bytes`, `dimensions`.          |
| `svg`           | omitted     | No file; JSON inlines full `svg` markup.                                        |
| `png`           | provided    | Writes file; JSON has `output`, `bytes`, `dimensions`.                          |
| `png`           | omitted     | **Error, exit 2**: `PNG cannot be inlined in JSON; provide -o <file>.`          |

Common fields: `success: true`, `format: "svg" | "png"`, `bytes: integer`,
`dimensions: { width, height } | null`, `theme: string` (when `--theme` was provided).

### `bm ascii --json`

```json
{ "schema_version": 1, "success": true, "text": "...", "lines": 3, "output": "/abs/path.txt" }
```

`output` only present when `-o` is provided. `text` is always inlined and ANSI-free.

### `bm doctor --json`

```json
{
  "schema_version": 1,
  "version": "0.2.x",
  "node_version": "v22.x",
  "platform": "darwin",
  "arch": "arm64",
  "fonts": { "available": ["Helvetica", "..."], "primary_family": "Helvetica", "buffers": 4 },
  "wasm_loaded": true
}
```

Always exits `0`. Inspect `wasm_loaded` and `fonts.buffers` to decide what is
usable. If `wasm_loaded === false`, PNG renders will fail with exit `1`; SVG and
ASCII still work. If `fonts.buffers === 0`, PNG output lacks text glyphs (SVG
unaffected).

### Error envelope (any subcommand)

```json
{
  "schema_version": 1,
  "success": false,
  "error": {
    "code": 2,
    "type": "ThemeNotFoundError",
    "message": "Unknown theme: drakula. Did you mean: dracula?",
    "suggestions": ["dracula"]
  }
}
```

| `error.type`            | When                                                |
|-------------------------|-----------------------------------------------------|
| `UsageError`            | Bad flag, PNG-to-stdout, `--json`+PNG without `-o`. |
| `ThemeNotFoundError`    | Unknown `--theme`. Includes `suggestions`.          |
| `ParseError`            | Mermaid parse / render failure. Includes `source`.  |
| `IoError`               | File read/write failure (ENOENT, EACCES, …).        |
| `WasmError`             | `@resvg/resvg-wasm` failed to initialize.           |

---

## Exit codes

| Code | Meaning                                                              |
|------|----------------------------------------------------------------------|
| `0`  | Success                                                              |
| `1`  | `WasmError` / unclassified internal failure                          |
| `2`  | `UsageError` / `ThemeNotFoundError` / commander unknown-option       |
| `3`  | `ParseError` (invalid Mermaid source)                                |
| `4`  | `IoError` (file read/write)                                          |

Exit codes are part of the `schema_version: 1` contract; they will not be
renumbered without a `schema_version` bump.
