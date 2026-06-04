import { TextBufferRenderable, type BorderStyle, type ColorInput, type RenderContext, type RGBA } from "@opentui/core"
import { parseDiagramRenderableColor, setDiagramRenderableColor } from "../core/adapter/renderable-color.js"
import { DiagramRenderablePipeline } from "../core/adapter/renderable-pipeline.js"
import { brightenColor } from "../core/color/style.js"
import { layoutSequenceDiagram } from "./drawing.js"
import {
  DEFAULT_FRAGMENT_BORDER_STYLE,
  normalizeSequenceMinParticipantGap,
  normalizeSequencePulseFrame,
  normalizeSequencePulseGap,
  normalizeSequencePulseLength,
} from "./options.js"
import { parseMermaidSequenceDiagram } from "./parser.js"
import { renderSequenceGridStyledText, type SequenceGrid } from "./render-grid.js"
import { resolveSequenceStyleColors } from "./style.js"
import type { SequenceDiagram, SequenceDiagramOptions } from "./types.js"

export class SequenceDiagramRenderable extends TextBufferRenderable {
  private _content: string
  private _compact: boolean
  private _minParticipantGap: number
  private _fragmentBorderStyle: BorderStyle
  private _pulseFrame?: number
  private _pulseLength: number
  private _pulseGap: number
  private _participantColor?: RGBA
  private _lifelineColor?: RGBA
  private _groupColor?: RGBA
  private _requestColor?: RGBA
  private _responseColor?: RGBA
  private _pulseColor?: RGBA
  private _noteColor?: RGBA
  private _noteBackgroundColor?: RGBA
  private readonly _pipeline: DiagramRenderablePipeline<SequenceDiagram, SequenceGrid>

  constructor(ctx: RenderContext, options: SequenceDiagramOptions = {}) {
    super(ctx, { ...options, wrapMode: options.wrapMode ?? "none" })
    this._content = options.content ?? ""
    this._compact = options.compact ?? false
    this._minParticipantGap = normalizeSequenceMinParticipantGap(options.minParticipantGap)
    this._fragmentBorderStyle = options.fragmentBorderStyle ?? DEFAULT_FRAGMENT_BORDER_STYLE
    this._pulseFrame = normalizeSequencePulseFrame(options.pulseFrame)
    this._pulseLength = normalizeSequencePulseLength(options.pulseLength)
    this._pulseGap = normalizeSequencePulseGap(options.pulseGap)
    this._participantColor = parseDiagramRenderableColor(options.participantColor)
    this._lifelineColor = parseDiagramRenderableColor(options.lifelineColor)
    this._groupColor = parseDiagramRenderableColor(options.groupColor)
    this._requestColor = parseDiagramRenderableColor(options.requestColor)
    this._responseColor = parseDiagramRenderableColor(options.responseColor)
    this._pulseColor = parseDiagramRenderableColor(options.pulseColor)
    this._noteColor = parseDiagramRenderableColor(options.noteColor)
    this._noteBackgroundColor = parseDiagramRenderableColor(options.noteBackgroundColor)
    this._pipeline = new DiagramRenderablePipeline({
      parse: () => parseMermaidSequenceDiagram(this._content),
      draw: (diagram) => this.drawGrid(diagram),
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

  get minParticipantGap(): number {
    return this._minParticipantGap
  }

  set minParticipantGap(value: number) {
    const next = normalizeSequenceMinParticipantGap(value)
    if (this._minParticipantGap === next) return
    this._minParticipantGap = next
    this._pipeline.invalidateGrid()
  }

  get fragmentBorderStyle(): BorderStyle {
    return this._fragmentBorderStyle
  }

  set fragmentBorderStyle(value: BorderStyle | undefined) {
    const next = value ?? DEFAULT_FRAGMENT_BORDER_STYLE
    if (this._fragmentBorderStyle === next) return
    this._fragmentBorderStyle = next
    this._pipeline.invalidateGrid()
  }

  get pulseFrame(): number | undefined {
    return this._pulseFrame
  }

  set pulseFrame(value: number | undefined) {
    const next = normalizeSequencePulseFrame(value)
    if (this._pulseFrame === next) return
    this._pulseFrame = next
    this._pipeline.invalidateGrid()
  }

  get pulseLength(): number {
    return this._pulseLength
  }

  set pulseLength(value: number | undefined) {
    const next = normalizeSequencePulseLength(value)
    if (this._pulseLength === next) return
    this._pulseLength = next
    this._pipeline.invalidateGrid()
  }

  get pulseGap(): number {
    return this._pulseGap
  }

  set pulseGap(value: number | undefined) {
    const next = normalizeSequencePulseGap(value)
    if (this._pulseGap === next) return
    this._pulseGap = next
    this._pipeline.invalidateGrid()
  }

  get participantColor(): RGBA | undefined {
    return this._participantColor
  }

  set participantColor(value: ColorInput | undefined) {
    this.setColor(this._participantColor, value, (color) => {
      this._participantColor = color
    })
  }

  get lifelineColor(): RGBA | undefined {
    return this._lifelineColor
  }

  set lifelineColor(value: ColorInput | undefined) {
    this.setColor(this._lifelineColor, value, (color) => {
      this._lifelineColor = color
    })
  }

  get groupColor(): RGBA | undefined {
    return this._groupColor
  }

  set groupColor(value: ColorInput | undefined) {
    this.setColor(this._groupColor, value, (color) => {
      this._groupColor = color
    })
  }

  get requestColor(): RGBA | undefined {
    return this._requestColor
  }

  set requestColor(value: ColorInput | undefined) {
    this.setColor(this._requestColor, value, (color) => {
      this._requestColor = color
    })
  }

  get responseColor(): RGBA | undefined {
    return this._responseColor
  }

  set responseColor(value: ColorInput | undefined) {
    this.setColor(this._responseColor, value, (color) => {
      this._responseColor = color
    })
  }

  get pulseColor(): RGBA | undefined {
    return this._pulseColor
  }

  set pulseColor(value: ColorInput | undefined) {
    this.setColor(this._pulseColor, value, (color) => {
      this._pulseColor = color
    })
  }

  get noteColor(): RGBA | undefined {
    return this._noteColor
  }

  set noteColor(value: ColorInput | undefined) {
    this.setColor(this._noteColor, value, (color) => {
      this._noteColor = color
    })
  }

  get noteBackgroundColor(): RGBA | undefined {
    return this._noteBackgroundColor
  }

  set noteBackgroundColor(value: ColorInput | undefined) {
    this.setColor(this._noteBackgroundColor, value, (color) => {
      this._noteBackgroundColor = color
    })
  }

  batchUpdate(update: () => void): void {
    this._pipeline.batchUpdate(update)
  }

  private setColor(
    current: RGBA | undefined,
    value: ColorInput | undefined,
    assign: (color: RGBA | undefined) => void,
  ): void {
    setDiagramRenderableColor(current, value, assign, () => this._pipeline.invalidateStyle())
  }

  private drawGrid(diagram: SequenceDiagram): SequenceGrid {
    return layoutSequenceDiagram(diagram, {
      compact: this._compact,
      minParticipantGap: this._minParticipantGap,
      fragmentBorderStyle: this._fragmentBorderStyle,
      pulseFrame: this._pulseFrame,
      pulseLength: this._pulseLength,
      pulseGap: this._pulseGap,
    })
  }

  private publishStyledText(grid: SequenceGrid): void {
    this.textBuffer.setStyledText(
      renderSequenceGridStyledText(
        grid,
        resolveSequenceStyleColors({
          participant: this._participantColor,
          lifeline: this._lifelineColor,
          group: this._groupColor ?? brightenColor(this._lifelineColor, 0.08),
          request: this._requestColor,
          response: this._responseColor,
          pulse: this._pulseColor,
          fragment: brightenColor(this._lifelineColor, 0.18),
          fragmentLabelBg: this._noteBackgroundColor,
          note: this._noteColor,
          noteBg: this._noteBackgroundColor,
        }),
      ),
    )
    this.updateTextInfo()
  }
}
