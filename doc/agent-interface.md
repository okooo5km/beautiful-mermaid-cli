# Agent Interface — `--json` schema (v1)

> Stable contract for AI agents and other automated callers.
> See `AGENTS.md` § "Agent Interface Contract" for the compatibility promise.

All `--json` payloads share three rules:

1. The payload is one line of UTF-8 JSON terminated by `\n`.
2. The first key is `"schema_version": 1`.
3. Success payloads go to **stdout**; error payloads go to **stderr**. Both
   produce non-empty output even when the other stream is empty.

Exit codes (`src/utils/errors.ts`):

| Code | Class                              | Trigger                                                       |
|------|------------------------------------|---------------------------------------------------------------|
| 0    | —                                  | Success                                                       |
| 1    | `WasmError` / unclassified         | WASM init failure, unknown internal error                     |
| 2    | `UsageError` / `ThemeNotFoundError`| Bad flags, unknown theme, PNG-to-stdout, `--json`+PNG no `-o` |
| 3    | `ParseError`                       | Mermaid parse / render failure                                |
| 4    | `IoError`                          | File read/write failure (e.g. ENOENT, EACCES)                 |

---

## `bm themes --json`

Lists every built-in theme.

**stdout** (success):

```json
{
  "schema_version": 1,
  "themes": [
    { "name": "catppuccin-latte", "bg": "#eff1f5", "fg": "#4c4f69", "accent": "#8839ef" },
    { "name": "dracula", "bg": "#282a36", "fg": "#f8f8f2", "accent": "#bd93f9" }
  ],
  "count": 15
}
```

| Field            | Type           | Required | Notes                                       |
|------------------|----------------|----------|---------------------------------------------|
| `schema_version` | `1`            | yes      | Contract version.                           |
| `themes`         | array          | yes      | One entry per theme.                        |
| `themes[].name`  | string         | yes      | Theme key (sorted alphabetically).          |
| `themes[].bg`    | `#RRGGBB`      | yes      | Background color.                           |
| `themes[].fg`    | `#RRGGBB`      | yes      | Foreground / text color.                    |
| `themes[].accent`| `#RRGGBB`      | no       | Present when the theme defines an accent.   |
| `count`          | integer        | yes      | `themes.length`.                            |

---

## `bm render --json`

Renders Mermaid → SVG or PNG. Behavior depends on `-o` and `-f`:

| `-f` / inferred | `-o <file>` | Result                                                   |
|-----------------|-------------|----------------------------------------------------------|
| `svg`           | provided    | Writes file. JSON contains `output` (absolute path).     |
| `svg`           | omitted     | No file written. JSON inlines `svg` (full markup).       |
| `png`           | provided    | Writes file. JSON contains `output` (absolute path).     |
| `png`           | omitted     | **Error** (exit 2): `PNG cannot be inlined in JSON`.     |

**stdout** (SVG, with `-o`):

```json
{
  "schema_version": 1,
  "success": true,
  "format": "svg",
  "output": "/abs/path/out.svg",
  "bytes": 2101,
  "theme": "dracula",
  "dimensions": { "width": 855.912, "height": 413.6 }
}
```

**stdout** (SVG, no `-o`, inlined):

```json
{
  "schema_version": 1,
  "success": true,
  "format": "svg",
  "svg": "<svg xmlns=\"...\">...</svg>",
  "bytes": 2101,
  "dimensions": { "width": 855.912, "height": 413.6 }
}
```

**stdout** (PNG, with `-o`):

```json
{
  "schema_version": 1,
  "success": true,
  "format": "png",
  "output": "/abs/path/out.png",
  "bytes": 18234,
  "dimensions": { "width": 855.912, "height": 413.6 }
}
```

| Field            | Type             | When present                              | Notes                                                 |
|------------------|------------------|-------------------------------------------|-------------------------------------------------------|
| `schema_version` | `1`              | always                                    |                                                       |
| `success`        | `true`           | always                                    |                                                       |
| `format`         | `"svg" \| "png"` | always                                    | Resolved from `-f` or `-o` extension.                 |
| `output`         | string           | when `-o` is provided                     | Absolute path (`path.resolve`).                       |
| `bytes`          | integer          | always                                    | UTF-8 byte length (SVG) or buffer length (PNG).       |
| `theme`          | string           | when `--theme` is provided                | The theme name passed in.                             |
| `dimensions`     | `{width,height}` or `null` | always                          | Parsed from the SVG `viewBox`. May be `null`.         |
| `svg`            | string           | SVG only, when `-o` omitted               | Full SVG markup. Mutually exclusive with `output`.    |

---

## `bm ascii --json`

Renders Mermaid → ASCII / Unicode text. Text is always inlined; `-o` is optional
and writes the same text to a file in addition to the JSON. Color is forced to
`none` in `--json` mode (no ANSI escapes appear in `text`).

**stdout** (success):

```json
{
  "schema_version": 1,
  "success": true,
  "text": "┌────┐\n│ A  │\n└────┘",
  "lines": 3,
  "output": "/abs/path/out.txt"
}
```

| Field            | Type     | When present              | Notes                                          |
|------------------|----------|---------------------------|------------------------------------------------|
| `schema_version` | `1`      | always                    |                                                |
| `success`        | `true`   | always                    |                                                |
| `text`           | string   | always                    | Plain text, no ANSI.                           |
| `lines`          | integer  | always                    | `text.split('\\n').length`.                    |
| `output`         | string   | when `-o` is provided     | Absolute path. Same content as `text`.         |

---

## `bm doctor --json`

Reports the local environment so an agent can self-check before invoking the
render path. Always exits `0` even when fonts are missing or wasm cannot load —
inspect the boolean / array fields to decide what is usable.

**stdout** (success):

```json
{
  "schema_version": 1,
  "version": "0.2.0",
  "node_version": "v22.11.0",
  "platform": "darwin",
  "arch": "arm64",
  "fonts": {
    "available": ["Helvetica", "Helvetica Neue", "Geneva", "Arial", "PingFang SC"],
    "primary_family": "Helvetica",
    "latin_family": "Helvetica",
    "cjk_family": "PingFang SC",
    "buffers": 5
  },
  "wasm_loaded": true
}
```

| Field                   | Type     | When present                | Notes                                                  |
|-------------------------|----------|-----------------------------|--------------------------------------------------------|
| `schema_version`        | `1`      | always                      |                                                        |
| `version`               | string   | always                      | `beautiful-mermaid-cli` package version.               |
| `node_version`          | string   | always                      | `process.version` (e.g. `v22.11.0`).                   |
| `platform`              | string   | always                      | `process.platform` (`darwin`, `linux`, `win32`, …).    |
| `arch`                  | string   | always                      | `process.arch` (`arm64`, `x64`, …).                    |
| `fonts.available`       | string[] | always                      | Family names with on-disk font files (probed list).    |
| `fonts.primary_family`  | string   | always                      | Family that PNG rendering will use as fallback.        |
| `fonts.latin_family`    | string   | when a Latin font is loaded | First Latin-script family loaded (additive in v1).     |
| `fonts.cjk_family`      | string   | when a CJK font is loaded   | First CJK family loaded; absence ⇒ tofu boxes for CJK in PNG. |
| `fonts.buffers`         | integer  | always                      | Count of font files actually loaded into memory.       |
| `wasm_loaded`           | boolean  | always                      | `true` if `@resvg/resvg-wasm` initialized successfully.|
| `wasm_error`            | string   | only when `wasm_loaded=false` | Underlying error message from the load attempt.      |

When `fonts.buffers === 0`, PNG output will lack text glyphs (graceful
degradation; SVG output is unaffected). When `wasm_loaded === false`, PNG
rendering will fail with exit code `1` (`WasmError`); SVG and ASCII still work.

---

## `bm fonts --json`

Enumerates fonts on the system (recursively walking the OS standard font
directories) and reports each face with its family name, coverage, and
monospace flag. Use this to discover what is available before invoking
`bm render --font <family>`.

**stdout** (success):

```json
{
  "schema_version": 1,
  "fonts": [
    {
      "family": "PingFang SC",
      "postscript_name": "PingFangSC-Regular",
      "path": "/System/Library/Fonts/PingFang.ttc",
      "index": 0,
      "coverage": ["latin", "cjk"],
      "is_monospace": false,
      "style": "Regular"
    }
  ],
  "count": 1
}
```

| Field                | Type        | When present              | Notes                                                            |
|----------------------|-------------|---------------------------|------------------------------------------------------------------|
| `schema_version`     | `1`         | always                    |                                                                  |
| `fonts`              | array       | always                    | One element per face. May be empty.                              |
| `fonts[].family`     | string      | always                    | Primary family name from the font's name table.                  |
| `fonts[].postscript_name` | string | when present              | PostScript name. Useful for unambiguous identification.          |
| `fonts[].path`       | string      | always                    | Absolute path to the font file on disk.                          |
| `fonts[].index`      | integer     | only inside a `.ttc`/`.otc` collection | Face index within the collection.                       |
| `fonts[].coverage`   | string[]    | always                    | Subset of `["latin", "cjk", "emoji"]`. Probed via cmap lookup. **Emoji is reported for awareness only — PNG output cannot render emoji (resvg-wasm limitation); use SVG output.** |
| `fonts[].is_monospace` | boolean   | always                    | `true` for code-style fonts (Mono / Code / Menlo / Consolas / panose-mono **without** CJK coverage). CJK fonts are excluded by design. |
| `fonts[].style`      | string      | when present              | Subfamily (`Regular`, `Bold`, `Italic`, …).                      |
| `count`              | integer     | always                    | Equals `fonts.length`.                                           |

`--filter <kind>` narrows to `latin` / `cjk` / `mono`. Sorting is alphabetical by
family. The first call in a process is the slow path (filesystem walk + fontkit
parse, ~100 ms – 1 s depending on the font library size); subsequent calls are
served from an in-memory cache.

---

## Error payloads (any subcommand)

When a `--json`-mode invocation fails, the JSON envelope is written to **stderr**
and the process exits with the matching code from the table above. `stdout` is
empty.

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

| Field                   | Type           | When present                                  | Notes                                                  |
|-------------------------|----------------|-----------------------------------------------|--------------------------------------------------------|
| `schema_version`        | `1`            | always                                        |                                                        |
| `success`               | `false`        | always                                        |                                                        |
| `error.code`            | integer        | always                                        | Same as the process exit code.                         |
| `error.type`            | string         | always                                        | `CliError` subclass name (`UsageError`, `ParseError`,  |
|                         |                |                                               | `IoError`, `ThemeNotFoundError`, `WasmError`, …).      |
| `error.message`         | string         | always                                        | Human-readable, no ANSI.                               |
| `error.suggestions`     | string[]       | `ThemeNotFoundError` only                     | Best Levenshtein matches from the theme catalog.       |
| `error.source`          | string         | `ParseError` only                             | The Mermaid source that failed to parse.               |

Examples by class:

```json
// exit 3 — invalid Mermaid
{"schema_version":1,"success":false,"error":{"code":3,"type":"ParseError","message":"...","source":"..."}}

// exit 4 — file not found
{"schema_version":1,"success":false,"error":{"code":4,"type":"IoError","message":"File not found: x.mmd"}}

// exit 2 — PNG inline guard
{"schema_version":1,"success":false,"error":{"code":2,"type":"UsageError","message":"PNG cannot be inlined in JSON; provide -o <file>."}}
```

---

## Forward compatibility

Within `schema_version: 1` we may add new optional fields, new themes, and new
error `type` values without bumping the version. Renames, removals, type changes,
or exit code reassignments are breaking and bump the schema to `2`.

If your agent depends on a field, treat unknown fields as additive and ignore
them. If you need to detect contract version, check `schema_version` directly —
do not infer it from the presence/absence of any single field.
