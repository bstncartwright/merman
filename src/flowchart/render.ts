import { renderFlowchartGrid, renderGridText } from "./drawing.js"
import type { FlowchartDiagramAnsiOptions, FlowchartDiagramRenderOptions } from "./options.js"
import { parseMermaidFlowchartDiagram } from "./parser.js"
import { renderGridAnsi } from "./style.js"

export function renderFlowchartDiagram(content: string, options: FlowchartDiagramRenderOptions = {}): string {
  return renderGridText(renderFlowchartGrid(parseMermaidFlowchartDiagram(content), options))
}

export function renderFlowchartDiagramAnsi(content: string, options: FlowchartDiagramAnsiOptions = {}): string {
  return renderGridAnsi(renderFlowchartGrid(parseMermaidFlowchartDiagram(content), options), options.theme)
}
