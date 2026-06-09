import { renderFlowchartGrid, renderGridText } from "../flowchart/drawing.js"
import { renderGridAnsi } from "../flowchart/style.js"
import { erDiagramToFlowchartDiagram } from "./adapter.js"
import { parseMermaidErDiagram } from "./parser.js"
import type { ErDiagramAnsiOptions, ErDiagramRenderOptions } from "./types.js"

export function renderErDiagram(content: string, options: ErDiagramRenderOptions = {}): string {
  return renderGridText(renderFlowchartGrid(erDiagramToFlowchartDiagram(parseMermaidErDiagram(content)), options))
}

export function renderErDiagramAnsi(content: string, options: ErDiagramAnsiOptions = {}): string {
  return renderGridAnsi(
    renderFlowchartGrid(erDiagramToFlowchartDiagram(parseMermaidErDiagram(content)), options),
    options.theme,
  )
}
