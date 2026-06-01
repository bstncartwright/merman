import { TextBufferRenderable, type BorderStyle, type ColorInput, type RenderContext, type RGBA } from "@opentui/core"
import { parseDiagramRenderableColor, setDiagramRenderableColor } from "../core/adapter/renderable-color.js"
import { brightenColor } from "../core/color/style.js"
import { layoutSequenceDiagram, renderGridStyledText, resolveSequenceStyleColors } from "./diagram.js"
import {
  DEFAULT_FRAGMENT_BORDER_STYLE,
  DEFAULT_MIN_PARTICIPANT_GAP,
  normalizeSequencePulseFrame,
  normalizeSequencePulseGap,
  normalizeSequencePulseLength,
} from "./options.js"
import type { SequenceDiagramOptions } from "./types.js"

export class SequenceDiagramRenderable extends TextBufferRenderable {
  private _content: string
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

  constructor(ctx: RenderContext, options: SequenceDiagramOptions = {}) {
    super(ctx, { ...options, wrapMode: options.wrapMode ?? "none" })
    this._content = options.content ?? ""
    this._minParticipantGap = options.minParticipantGap ?? DEFAULT_MIN_PARTICIPANT_GAP
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
    this.updateDiagram()
  }

  get content(): string {
    return this._content
  }

  set content(value: string) {
    if (this._content === value) return
    this._content = value
    this.updateDiagram()
  }

  get minParticipantGap(): number {
    return this._minParticipantGap
  }

  set minParticipantGap(value: number) {
    if (this._minParticipantGap === value) return
    this._minParticipantGap = value
    this.updateDiagram()
  }

  get fragmentBorderStyle(): BorderStyle {
    return this._fragmentBorderStyle
  }

  set fragmentBorderStyle(value: BorderStyle | undefined) {
    const next = value ?? DEFAULT_FRAGMENT_BORDER_STYLE
    if (this._fragmentBorderStyle === next) return
    this._fragmentBorderStyle = next
    this.updateDiagram()
  }

  get pulseFrame(): number | undefined {
    return this._pulseFrame
  }

  set pulseFrame(value: number | undefined) {
    const next = normalizeSequencePulseFrame(value)
    if (this._pulseFrame === next) return
    this._pulseFrame = next
    this.updateDiagram()
  }

  get pulseLength(): number {
    return this._pulseLength
  }

  set pulseLength(value: number | undefined) {
    const next = normalizeSequencePulseLength(value)
    if (this._pulseLength === next) return
    this._pulseLength = next
    this.updateDiagram()
  }

  get pulseGap(): number {
    return this._pulseGap
  }

  set pulseGap(value: number | undefined) {
    const next = normalizeSequencePulseGap(value)
    if (this._pulseGap === next) return
    this._pulseGap = next
    this.updateDiagram()
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

  private setColor(
    current: RGBA | undefined,
    value: ColorInput | undefined,
    assign: (color: RGBA | undefined) => void,
  ): void {
    setDiagramRenderableColor(current, value, assign, () => this.updateDiagram())
  }

  private updateDiagram(): void {
    const grid = layoutSequenceDiagram(this._content, {
      minParticipantGap: this._minParticipantGap,
      fragmentBorderStyle: this._fragmentBorderStyle,
      pulseFrame: this._pulseFrame,
      pulseLength: this._pulseLength,
      pulseGap: this._pulseGap,
    })
    this.textBuffer.setStyledText(
      renderGridStyledText(
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
    this.requestRender()
  }
}
