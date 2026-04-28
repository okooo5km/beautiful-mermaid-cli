# skills/

Claude Agent Skills shipped with `beautiful-mermaid-cli`. Each skill is a
single directory containing a `SKILL.md` (with YAML frontmatter) and any
sibling reference / script files.

## Available skills

- [`beautiful-mermaid/`](./beautiful-mermaid/SKILL.md) — render Mermaid
  diagrams as SVG, PNG, or ASCII via the `bm` CLI.

## Install (in any agent that supports the SKILL.md spec)

```bash
# vercel-labs/skills installer (Claude Code, Cursor, Codex, etc.)
npx -y skills add okooo5km/beautiful-mermaid-cli

# Or manually drop into a project
cp -r skills/beautiful-mermaid /path/to/project/.claude/skills/
```

Skills installed into `.claude/skills/<name>/` are project-scoped; copying
into `~/.claude/skills/<name>/` makes them available to every project for
the current user.
