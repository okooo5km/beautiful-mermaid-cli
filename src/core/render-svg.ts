// SVG renderer — okooo5km(十里)

import { renderMermaidSVG, type RenderOptions } from 'beautiful-mermaid';

export function renderSvg(source: string, opts: RenderOptions = {}): string {
  return renderMermaidSVG(source, opts);
}
