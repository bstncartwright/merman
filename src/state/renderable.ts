import { TextBufferRenderable, type BorderStyle, type ColorInput, type RenderContext, type RGBA } from "@opentui/core"
import { parseDiagramRenderableColor, setDiagramRenderableColor } from "../core/adapter/renderable-color.js"
import { diagramColorMapsEqual, normalizeDiagramColorMap } from "../core/color/map.js"
import {
  activeTransitionListsEqual,
  normalizeActiveTransitionMode,
  normalizeActiveTransitions,
} from "./active-transition.js"
import { layoutStateDiagram } from "./drawing.js"
import {
  DEFAULT_STATE_ARROW_HEAD_STYLE,
  DEFAULT_STATE_BORDER_STYLE,
  DEFAULT_STATE_DIAGRAM_MIN_STATE_GAP,
  normalizeStatePulseFrame,
  normalizeStatePulseGap,
  normalizeStatePulseLength,
  normalizeStatePulseProgress,
} from "./options.js"
import { parseMermaidStateDiagram } from "./parser.js"
import { renderStateGridStyledText } from "./render-grid.js"
import { resolveStateStyleColors } from "./style.js"
import type {
  StateDiagramActiveTransition,
  StateDiagramActiveTransitionMode,
  StateDiagramActiveTransitionSelection,
  StateDiagramArrowHeadStyle,
  StateDiagramDirection,
  StateDiagramOptions,
  StateDiagramStateColors,
} from "./types.js"

export class StateDiagramRenderable extends TextBufferRenderable {
  private _content: string
  private _direction?: StateDiagramDirection
  private _borderStyle: BorderStyle
  private _arrowHeadStyle: StateDiagramArrowHeadStyle
  private _minStateGap: number
  private _activeState?: string
  private _activeTransitions: StateDiagramActiveTransition[]
  private _activeTransitionProgress?: number
  private _activeTransitionMode: StateDiagramActiveTransitionMode
  private _stateColor?: RGBA
  private _activeStateColor?: RGBA
  private _compositeColor?: RGBA
  private _transitionColor?: RGBA
  private _activeTransitionColor?: RGBA
  private _pulseColor?: RGBA
  private _labelColor?: RGBA
  private _noteBorderColor?: RGBA
  private _noteTextColor?: RGBA
  private _noteConnectorColor?: RGBA
  private _startColor?: RGBA
  private _endColor?: RGBA
  private _choiceColor?: RGBA
  private _stateColors: Map<string, RGBA>
  private _stateBgColors: Map<string, RGBA>
  private _pulseFrame?: number
  private _pulseProgress?: number
  private _pulseLength: number
  private _pulseGap: number
  private _batchDepth = 0
  private _needsUpdate = false

  constructor(ctx: RenderContext, options: StateDiagramOptions = {}) {
    super(ctx, { ...options, wrapMode: options.wrapMode ?? "none" })
    this._content = options.content ?? ""
    this._direction = options.direction
    this._borderStyle = options.borderStyle ?? DEFAULT_STATE_BORDER_STYLE
    this._arrowHeadStyle = options.arrowHeadStyle ?? DEFAULT_STATE_ARROW_HEAD_STYLE
    this._minStateGap = options.minStateGap ?? DEFAULT_STATE_DIAGRAM_MIN_STATE_GAP
    this._activeState = options.activeState
    this._activeTransitions = normalizeActiveTransitions(options.activeTransition)
    this._activeTransitionProgress = normalizeStatePulseProgress(options.activeTransitionProgress)
    this._activeTransitionMode = normalizeActiveTransitionMode(options.activeTransitionMode)
    this._stateColor = parseDiagramRenderableColor(options.stateColor)
    this._activeStateColor = parseDiagramRenderableColor(options.activeStateColor)
    this._compositeColor = parseDiagramRenderableColor(options.compositeColor)
    this._transitionColor = parseDiagramRenderableColor(options.transitionColor)
    this._activeTransitionColor = parseDiagramRenderableColor(options.activeTransitionColor)
    this._pulseColor = parseDiagramRenderableColor(options.pulseColor)
    this._labelColor = parseDiagramRenderableColor(options.labelColor)
    this._noteBorderColor = parseDiagramRenderableColor(options.noteBorderColor)
    this._noteTextColor = parseDiagramRenderableColor(options.noteTextColor)
    this._noteConnectorColor = parseDiagramRenderableColor(options.noteConnectorColor)
    this._startColor = parseDiagramRenderableColor(options.startColor)
    this._endColor = parseDiagramRenderableColor(options.endColor)
    this._choiceColor = parseDiagramRenderableColor(options.choiceColor)
    this._stateColors = normalizeDiagramColorMap(options.stateColors)
    this._stateBgColors = normalizeDiagramColorMap(options.stateBgColors)
    this._pulseFrame = normalizeStatePulseFrame(options.pulseFrame)
    this._pulseProgress = normalizeStatePulseProgress(options.pulseProgress)
    this._pulseLength = normalizeStatePulseLength(options.pulseLength)
    this._pulseGap = normalizeStatePulseGap(options.pulseGap)
    this.updateDiagram()
  }

  get content(): string {
    return this._content
  }

  set content(value: string) {
    if (this._content === value) return
    this._content = value
    this.invalidateDiagram()
  }

  get activeState(): string | undefined {
    return this._activeState
  }

  set activeState(value: string | undefined) {
    if (this._activeState === value) return
    this._activeState = value
    this.invalidateDiagram()
  }

  get direction(): StateDiagramDirection | undefined {
    return this._direction
  }

  set direction(value: StateDiagramDirection | undefined) {
    if (this._direction === value) return
    this._direction = value
    this.invalidateDiagram()
  }

  get borderStyle(): BorderStyle {
    return this._borderStyle
  }

  set borderStyle(value: BorderStyle | undefined) {
    const next = value ?? DEFAULT_STATE_BORDER_STYLE
    if (this._borderStyle === next) return
    this._borderStyle = next
    this.invalidateDiagram()
  }

  get minStateGap(): number {
    return this._minStateGap
  }

  set minStateGap(value: number | undefined) {
    const next = value ?? DEFAULT_STATE_DIAGRAM_MIN_STATE_GAP
    if (this._minStateGap === next) return
    this._minStateGap = next
    this.invalidateDiagram()
  }

  get activeTransition(): StateDiagramActiveTransitionSelection | undefined {
    if (this._activeTransitions.length === 0) return undefined
    if (this._activeTransitions.length === 1) return this._activeTransitions[0]
    return [...this._activeTransitions]
  }

  set activeTransition(value: StateDiagramActiveTransitionSelection | undefined) {
    const next = normalizeActiveTransitions(value)
    if (activeTransitionListsEqual(this._activeTransitions, next)) return
    this._activeTransitions = next
    this.invalidateDiagram()
  }

  get activeTransitionProgress(): number | undefined {
    return this._activeTransitionProgress
  }

  set activeTransitionProgress(value: number | undefined) {
    const next = normalizeStatePulseProgress(value)
    if (this._activeTransitionProgress === next) return
    this._activeTransitionProgress = next
    this.invalidateDiagram()
  }

  get activeTransitionMode(): StateDiagramActiveTransitionMode {
    return this._activeTransitionMode
  }

  set activeTransitionMode(value: StateDiagramActiveTransitionMode | undefined) {
    const next = normalizeActiveTransitionMode(value)
    if (this._activeTransitionMode === next) return
    this._activeTransitionMode = next
    this.invalidateDiagram()
  }

  get arrowHeadStyle(): StateDiagramArrowHeadStyle {
    return this._arrowHeadStyle
  }

  set arrowHeadStyle(value: StateDiagramArrowHeadStyle | undefined) {
    const next = value ?? DEFAULT_STATE_ARROW_HEAD_STYLE
    if (this._arrowHeadStyle === next) return
    this._arrowHeadStyle = next
    this.invalidateDiagram()
  }

  private setColor(
    current: RGBA | undefined,
    value: ColorInput | undefined,
    assign: (color: RGBA | undefined) => void,
  ): void {
    setDiagramRenderableColor(current, value, assign, () => this.invalidateDiagram())
  }

  set stateColor(value: ColorInput | undefined) {
    this.setColor(this._stateColor, value, (color) => (this._stateColor = color))
  }

  set activeStateColor(value: ColorInput | undefined) {
    this.setColor(this._activeStateColor, value, (color) => (this._activeStateColor = color))
  }

  set compositeColor(value: ColorInput | undefined) {
    this.setColor(this._compositeColor, value, (color) => (this._compositeColor = color))
  }

  set transitionColor(value: ColorInput | undefined) {
    this.setColor(this._transitionColor, value, (color) => (this._transitionColor = color))
  }

  set activeTransitionColor(value: ColorInput | undefined) {
    this.setColor(this._activeTransitionColor, value, (color) => (this._activeTransitionColor = color))
  }

  set pulseColor(value: ColorInput | undefined) {
    this.setColor(this._pulseColor, value, (color) => (this._pulseColor = color))
  }

  set labelColor(value: ColorInput | undefined) {
    this.setColor(this._labelColor, value, (color) => (this._labelColor = color))
  }

  set noteBorderColor(value: ColorInput | undefined) {
    this.setColor(this._noteBorderColor, value, (color) => (this._noteBorderColor = color))
  }

  set noteTextColor(value: ColorInput | undefined) {
    this.setColor(this._noteTextColor, value, (color) => (this._noteTextColor = color))
  }

  set noteConnectorColor(value: ColorInput | undefined) {
    this.setColor(this._noteConnectorColor, value, (color) => (this._noteConnectorColor = color))
  }

  set startColor(value: ColorInput | undefined) {
    this.setColor(this._startColor, value, (color) => (this._startColor = color))
  }

  set endColor(value: ColorInput | undefined) {
    this.setColor(this._endColor, value, (color) => (this._endColor = color))
  }

  set choiceColor(value: ColorInput | undefined) {
    this.setColor(this._choiceColor, value, (color) => (this._choiceColor = color))
  }

  set stateColors(value: StateDiagramStateColors | undefined) {
    const next = normalizeDiagramColorMap(value)
    if (diagramColorMapsEqual(this._stateColors, next)) return
    this._stateColors = next
    this.invalidateDiagram()
  }

  set stateBgColors(value: StateDiagramStateColors | undefined) {
    const next = normalizeDiagramColorMap(value)
    if (diagramColorMapsEqual(this._stateBgColors, next)) return
    this._stateBgColors = next
    this.invalidateDiagram()
  }

  get pulseFrame(): number | undefined {
    return this._pulseFrame
  }

  set pulseFrame(value: number | undefined) {
    const next = normalizeStatePulseFrame(value)
    if (this._pulseFrame === next) return
    this._pulseFrame = next
    this.invalidateDiagram()
  }

  get pulseProgress(): number | undefined {
    return this._pulseProgress
  }

  set pulseProgress(value: number | undefined) {
    const next = normalizeStatePulseProgress(value)
    if (this._pulseProgress === next) return
    this._pulseProgress = next
    this.invalidateDiagram()
  }

  get pulseLength(): number {
    return this._pulseLength
  }

  set pulseLength(value: number | undefined) {
    const next = normalizeStatePulseLength(value)
    if (this._pulseLength === next) return
    this._pulseLength = next
    this.invalidateDiagram()
  }

  get pulseGap(): number {
    return this._pulseGap
  }

  set pulseGap(value: number | undefined) {
    const next = normalizeStatePulseGap(value)
    if (this._pulseGap === next) return
    this._pulseGap = next
    this.invalidateDiagram()
  }

  batchUpdate(update: () => void): void {
    this._batchDepth += 1
    try {
      update()
    } finally {
      this._batchDepth -= 1
      if (this._batchDepth === 0 && this._needsUpdate) {
        this._needsUpdate = false
        this.updateDiagram()
      }
    }
  }

  private invalidateDiagram(): void {
    if (this._batchDepth > 0) {
      this._needsUpdate = true
      return
    }
    this.updateDiagram()
  }

  private updateDiagram(): void {
    const grid = layoutStateDiagram(parseMermaidStateDiagram(this._content), {
      direction: this._direction,
      borderStyle: this._borderStyle,
      arrowHeadStyle: this._arrowHeadStyle,
      minStateGap: this._minStateGap,
      activeState: this._activeState,
      activeTransition: this._activeTransitions,
      activeTransitionProgress: this._activeTransitionProgress,
      activeTransitionMode: this._activeTransitionMode,
      pulseFrame: this._pulseFrame,
      pulseProgress: this._pulseProgress,
      pulseLength: this._pulseLength,
      pulseGap: this._pulseGap,
    })
    this.textBuffer.setStyledText(
      renderStateGridStyledText(
        grid,
        resolveStateStyleColors({
          state: this._stateColor,
          activeState: this._activeStateColor,
          composite: this._compositeColor,
          transition: this._transitionColor,
          activeTransition: this._activeTransitionColor,
          activeTransitionPulse: this._pulseColor,
          label: this._labelColor,
          noteBorder: this._noteBorderColor,
          noteText: this._noteTextColor,
          noteConnector: this._noteConnectorColor,
          start: this._startColor,
          end: this._endColor,
          choice: this._choiceColor,
        }),
        this._stateColors,
        this._stateBgColors,
      ),
    )
    this.updateTextInfo()
    this.requestRender()
  }
}
