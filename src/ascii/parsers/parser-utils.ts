// Adapted from beautiful-mermaid v1.1.3 (https://github.com/lukilabs/beautiful-mermaid)
// MIT License — see src/ascii/LICENSE-NOTICE.md
//
// Subset of `multiline-utils.ts` needed by the vendored sub-parsers.

export function normalizeBrTags(label: string): string {
  const unquoted = label.startsWith('"') && label.endsWith('"') ? label.slice(1, -1) : label
  return unquoted
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/\\n/g, '\n')
    .replace(/<\/?(?:sub|sup|small|mark)\s*>/gi, '')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(?<!\*)\*([^\s*](?:[^*]*[^\s*])?)\*(?!\*)/g, '<i>$1</i>')
    .replace(/~~(.+?)~~/g, '<s>$1</s>')
}
