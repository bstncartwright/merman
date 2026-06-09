import { TextBufferRenderable, type RenderContext } from "@opentui/core"
import { DiagramRenderablePipeline } from "../core/adapter/renderable-pipeline.js"
import { renderFlowchartGrid } from "../flowchart/drawing.js"
import { renderGridStyledText, resolveFlowchartStyleColors, type FlowchartGrid } from "../flowchart/style.js"
import { erDiagramToFlowchartDiagram } from "./adapter.js"
import { parseMermaidErDiagram } from "./parser.js"
import type { ErDiagram, ErDiagramOptions } from "./types.js"

export class ErDiagramRenderable extends TextBufferRenderable {
  private _content: string
  private _compact: boolean
  private readonly _pipeline: DiagramRenderablePipeline<ErDiagram, FlowchartGrid>

  constructor(ctx: RenderContext, options: ErDiagramOptions = {}) {
    super(ctx, { ...options, wrapMode: options.wrapMode ?? "none" })
    this._content = options.content ?? ""
    this._compact = options.compact ?? false
    this._pipeline = new DiagramRenderablePipeline({
      parse: () => parseMermaidErDiagram(this._content),
      draw: (diagram) => renderFlowchartGrid(erDiagramToFlowchartDiagram(diagram), { compact: this._compact }),
      publish: (grid) => this.publishStyledText(grid),
    })
    this._pipeline.invalidateParsedDiagram()
  }

  get content(): string {
    return this._content
  }

  set content(value: string) {
    if (this._content === value) return
    this._content = value
    this._pipeline.invalidateParsedDiagram()
  }

  get compact(): boolean {
    return this._compact
  }

  set compact(value: boolean) {
    if (this._compact === value) return
    this._compact = value
    this._pipeline.invalidateGrid()
  }

  private publishStyledText(grid: FlowchartGrid): void {
    this.textBuffer.setStyledText(renderGridStyledText(grid, resolveFlowchartStyleColors()))
    this.updateTextInfo()
  }
}
