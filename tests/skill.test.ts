// Claude Agent Skill (SKILL.md) static validation — okooo5km(十里)

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const SKILL_DIR = path.resolve('skills', 'beautiful-mermaid');
const SKILL_PATH = path.join(SKILL_DIR, 'SKILL.md');
const REFERENCE_PATH = path.join(SKILL_DIR, 'reference.md');

interface Frontmatter {
  raw: string;
  fields: Record<string, string>;
}

function parseFrontmatter(text: string): Frontmatter {
  const m = /^---\r?\n([\s\S]+?)\r?\n---\r?\n/.exec(text);
  if (!m) throw new Error('SKILL.md is missing YAML frontmatter');
  const raw = m[1] ?? '';
  const fields: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(line);
    if (kv) fields[kv[1]!] = kv[2]!;
  }
  return { raw, fields };
}

describe('Claude Agent Skill (skills/beautiful-mermaid)', () => {
  it('SKILL.md exists at the expected path', () => {
    expect(existsSync(SKILL_PATH)).toBe(true);
  });

  it('reference.md exists alongside SKILL.md', () => {
    expect(existsSync(REFERENCE_PATH)).toBe(true);
  });

  it('SKILL.md has valid YAML frontmatter with name and description', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    const fm = parseFrontmatter(text);
    expect(fm.fields.name).toBeDefined();
    expect(fm.fields.description).toBeDefined();
    expect(fm.fields.description!.length).toBeGreaterThan(0);
  });

  it('skill name matches the official spec (lowercase, digits, dashes; ≤64 chars)', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    const fm = parseFrontmatter(text);
    const name = fm.fields.name!;
    expect(name).toBe('beautiful-mermaid');
    expect(name).toMatch(/^[a-z0-9-]+$/);
    expect(name.length).toBeLessThanOrEqual(64);
  });

  it('description is under 1024 chars (well within the 1536 spec ceiling)', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    const fm = parseFrontmatter(text);
    const desc = fm.fields.description!;
    expect(desc.length).toBeLessThanOrEqual(1024);
  });

  it('description uses an "Use when..." trigger phrase', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    const fm = parseFrontmatter(text);
    expect(fm.fields.description!).toMatch(/Use when/i);
  });

  it('SKILL.md body references the bm CLI prerequisite check', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    expect(text).toMatch(/bm doctor --json/);
  });

  it('SKILL.md points to reference.md for deep details', () => {
    const text = readFileSync(SKILL_PATH, 'utf8');
    expect(text).toMatch(/reference\.md/);
  });
});
