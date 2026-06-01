import { layoutStateDiagram } from "./drawing.js"
import { parseMermaidStateDiagram } from "./parser.js"
import { renderStateGridAnsi, renderStateGridText } from "./render-grid.js"
import type { StateDiagramAnsiOptions, StateDiagramRenderOptions } from "./types.js"

export function renderStateDiagram(content: string, options: StateDiagramRenderOptions = {}): string {
  return renderStateGridText(layoutStateDiagram(parseMermaidStateDiagram(content), options))
}

export function renderStateDiagramAnsi(content: string, options: StateDiagramAnsiOptions = {}): string {
  return renderStateGridAnsi(layoutStateDiagram(parseMermaidStateDiagram(content), options), options.theme)
}
