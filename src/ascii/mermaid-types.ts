// Adapted from beautiful-mermaid v1.1.3 (https://github.com/lukilabs/beautiful-mermaid)
// MIT License — see src/ascii/LICENSE-NOTICE.md
// Subset of the parser types vendored so the ASCII pipeline can stay
// self-contained without depending on the root package's private exports.

export interface MermaidGraph {
  direction: Direction
  nodes: Map<string, MermaidNode>
  edges: MermaidEdge[]
  subgraphs: MermaidSubgraph[]
  classDefs: Map<string, Record<string, string>>
  classAssignments: Map<string, string>
  nodeStyles: Map<string, Record<string, string>>
  linkStyles: Map<number | 'default', Record<string, string>>
}

export type Direction = 'TD' | 'TB' | 'LR' | 'BT' | 'RL'

export interface MermaidNode {
  id: string
  label: string
  shape: NodeShape
}

export type NodeShape =
  | 'rectangle'
  | 'rounded'
  | 'diamond'
  | 'stadium'
  | 'circle'
  | 'subroutine'
  | 'doublecircle'
  | 'hexagon'
  | 'cylinder'
  | 'asymmetric'
  | 'trapezoid'
  | 'trapezoid-alt'
  | 'state-start'
  | 'state-end'

export interface MermaidEdge {
  source: string
  target: string
  label?: string
  style: EdgeStyle
  hasArrowStart: boolean
  hasArrowEnd: boolean
}

export type EdgeStyle = 'solid' | 'dotted' | 'thick'

export interface MermaidSubgraph {
  id: string
  label: string
  nodeIds: string[]
  children: MermaidSubgraph[]
  direction?: Direction
}
