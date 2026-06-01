import { BorderChars, type BorderCharacters, type BorderStyle } from "@opentui/core"
import { DiagramCanvas, type DiagramCanvasCell } from "../core/canvas.js"
import { diagramRadialCellColorLevel } from "../core/color/map.js"
import { diagramArrowHead, diagramLineGlyph, drawDiagramFrame, mergeDiagramLineGlyph } from "../core/drawing.js"
import type { DiagramDirection } from "../core/geometry.js"
import { setDiagramPulseCell } from "../core/animation/pulse-cell.js"
import { visitDiagramPulsePath } from "../core/animation/pulse.js"
import {
  activeTransitionIndex,
  isActiveTransition,
  normalizeActiveTransitionMode,
  normalizeActiveTransitions,
} from "./active-transition.js"
import {
  createStateDiagramLayout,
  expandCompositeBoundsForFeedback,
  measureStateTransitionLabel,
  type StateDiagramBoxBounds as BoxBounds,
  type StateDiagramNoteBounds as StateNoteBounds,
} from "./layout.js"
import {
  DEFAULT_STATE_ARROW_HEAD_STYLE,
  DEFAULT_STATE_BORDER_STYLE,
  normalizeStateMinStateGap,
  normalizeStatePulseFrame,
  normalizeStatePulseGap,
  normalizeStatePulseLength,
  normalizeStatePulseProgress,
} from "./options.js"
import type { StateCellMetadata, StateGrid } from "./render-grid.js"
import { createStateTransitionRoutePlans, isStateHorizontalFeedback, type StateTransitionRoutePlan } from "./routing.js"
import {
  isStateActiveTransitionStyle,
  isStateTransitionFadeStyle,
  STATE_ACTIVE_TRANSITION_PULSE_STYLES,
  stateActiveTransitionPulseStyleLevel,
  stateDiagramStateColorKey,
  stateInactiveTransitionStyle,
  stateTransitionFadeStyle,
} from "./style.js"
import type {
  FadeSourceStyle,
  StateCellStyle,
  StateDiagram,
  StateDiagramActiveTransition,
  StateDiagramActiveTransitionMode,
  StateDiagramArrowHeadStyle,
  StateDiagramRenderOptions,
  StateDiagramState,
  StateDiagramTransition,
} from "./types.js"
import { isHiddenCompositeMarker, prepareVisibleStateDiagram } from "./visible-model.js"

type StateCell = DiagramCanvasCell<StateCellStyle, StateCellMetadata>

type StatePathPoint = readonly [number, number]

interface TransitionDrawContext {
  fadeSource: FadeSourceStyle
  active: boolean
  fadeFromSource: boolean
  path?: StatePathPoint[]
  sourceStateId: string
}

const ACTIVE_TRANSITION_FRONTIER_ACTIVE_SIDE = 2
const ACTIVE_TRANSITION_FRONTIER_INACTIVE_SIDE = 5

function makeGrid(width: number, height: number): StateGrid {
  return new DiagramCanvas(width, height, {
    mergeCell: (existing, incoming): StateCell => {
      const shouldMerge = isTransitionDrawingStyle(existing.style) && isTransitionDrawingStyle(incoming.style)
      return {
        ...incoming,
        char: shouldMerge
          ? (mergeDiagramLineGlyph(existing.char, incoming.char, "rounded") ?? incoming.char)
          : incoming.char,
      }
    },
  })
}

function isTransitionDrawingStyle(style: StateCellStyle | undefined): boolean {
  return (
    style === "transition" ||
    style === "activeTransition" ||
    isStateActiveTransitionStyle(style) ||
    isStateTransitionFadeStyle(style)
  )
}

function setCell(
  grid: StateGrid,
  x: number,
  y: number,
  char: string,
  style?: StateCellStyle,
  stateId?: string,
  bgStateId?: string,
): void {
  grid.setCell(x, y, char, style, { stateId, bgStateId })
}

function addPathPoint(path: StatePathPoint[] | undefined, x: number, y: number): void {
  path?.push([x, y])
}

function setPathCell(
  grid: StateGrid,
  path: StatePathPoint[] | undefined,
  x: number,
  y: number,
  char: string,
  style?: StateCellStyle,
  stateId?: string,
): void {
  setCell(grid, x, y, char, style, stateId)
  addPathPoint(path, x, y)
}

function setText(
  grid: StateGrid,
  x: number,
  y: number,
  text: string,
  style?: StateCellStyle,
  stateId?: string,
  bgStateId?: string,
): void {
  grid.setText(x, y, text, style, { stateId, bgStateId })
}

function setTransitionLabel(grid: StateGrid, x: number, y: number, label: string, style: StateCellStyle): void {
  measureStateTransitionLabel(label).lines.forEach((line, index) => setText(grid, x, y + index, line, style))
}

function drawBox(
  grid: StateGrid,
  state: StateDiagramState,
  bounds: BoxBounds,
  lines: string[],
  active: boolean,
  borderStyle: BorderStyle,
): void {
  if (isHiddenCompositeMarker(state)) return

  if (state.kind !== "state") {
    setCell(grid, bounds.left, bounds.top, state.label, active ? "activeState" : state.kind, state.id)
    return
  }
  const style: StateCellStyle = active ? "activeState" : "state"
  fillBoxInterior(grid, bounds, style, state.id)
  drawStateFrame(grid, bounds, BorderChars[borderStyle], style, state.id)
  lines.forEach((line, index) => {
    setStateText(grid, bounds, bounds.left + 2, bounds.top + 1 + index, line, style, state.id)
  })
}

function stateColorKeyForCell(bounds: BoxBounds, stateId: string, x: number, y: number, border = false): string {
  return stateDiagramStateColorKey(stateId, diagramRadialCellColorLevel(bounds, x, y, border))
}

function fillBoxInterior(grid: StateGrid, bounds: BoxBounds, style: StateCellStyle, stateId: string): void {
  for (let y = bounds.top + 1; y < bounds.top + bounds.height - 1; y++) {
    for (let x = bounds.left + 1; x < bounds.left + bounds.width - 1; x++) {
      const colorKey = stateColorKeyForCell(bounds, stateId, x, y)
      setCell(grid, x, y, " ", style, colorKey, colorKey)
    }
  }
}

function drawStateFrame(
  grid: StateGrid,
  bounds: BoxBounds,
  chars: BorderCharacters,
  style: StateCellStyle,
  stateId: string,
): void {
  const setBorderCell = (x: number, y: number, char: string) => {
    setCell(grid, x, y, char, style, stateColorKeyForCell(bounds, stateId, x, y, true))
  }

  drawDiagramFrame(bounds, chars, setBorderCell)
}

function setStateText(
  grid: StateGrid,
  bounds: BoxBounds,
  x: number,
  y: number,
  text: string,
  style: StateCellStyle,
  stateId: string,
): void {
  grid.setText(x, y, text, style, (cellX, cellY) => {
    const colorKey = stateColorKeyForCell(bounds, stateId, cellX, cellY)
    return { stateId: colorKey, bgStateId: colorKey }
  })
}

function drawContainerFrame(
  grid: StateGrid,
  bounds: BoxBounds,
  label: string,
  chars: BorderCharacters,
  style: StateCellStyle,
  stateId?: string,
): void {
  drawDiagramFrame(bounds, chars, (x, y, char) => setCell(grid, x, y, char, style, stateId))
  if (label) setText(grid, bounds.left + 2, bounds.top, ` ${label} `, style, stateId)
}

function drawHorizontalNoteConnector(grid: StateGrid, fromX: number, toX: number, y: number, char: string): void {
  const step = fromX <= toX ? 1 : -1
  for (let x = fromX; step === 1 ? x <= toX : x >= toX; x += step) {
    setCell(grid, x, y, char, "noteConnector")
  }
}

function drawNote(grid: StateGrid, bounds: StateNoteBounds, target: BoxBounds): void {
  const chars = BorderChars.double
  const connectorChars = BorderChars.double
  const noteX = bounds.note.position === "right" ? bounds.left - 1 : bounds.left + bounds.width
  const targetX = bounds.note.position === "right" ? target.left + target.width : target.left - 1
  const targetBottom = target.top + target.height - 1
  const noteBottom = bounds.top + bounds.height - 1
  const noteAbove = noteBottom < target.top
  const noteBelow = bounds.top > targetBottom
  let connectorY: number

  if (noteAbove || noteBelow) {
    const targetY = noteAbove ? target.top - 1 : targetBottom + 1
    connectorY = bounds.centerY
    const verticalStep = targetY <= connectorY ? 1 : -1

    for (let y = targetY; verticalStep === 1 ? y <= connectorY : y >= connectorY; y += verticalStep) {
      setCell(grid, targetX, y, connectorChars.vertical, "noteConnector")
    }

    drawHorizontalNoteConnector(grid, targetX, noteX, connectorY, connectorChars.horizontal)
    const connectorTurnsRight = targetX <= noteX
    const corner = noteAbove
      ? connectorTurnsRight
        ? connectorChars.topLeft
        : connectorChars.topRight
      : connectorTurnsRight
        ? connectorChars.bottomLeft
        : connectorChars.bottomRight
    setCell(grid, targetX, connectorY, corner, "noteConnector")
  } else {
    connectorY = Math.max(bounds.top + 1, Math.min(target.centerY, bounds.top + bounds.height - 2))
    drawHorizontalNoteConnector(grid, targetX, noteX, connectorY, connectorChars.horizontal)
  }

  drawContainerFrame(grid, bounds, "", chars, "noteBorder")
  setCell(
    grid,
    bounds.note.position === "right" ? bounds.left : bounds.left + bounds.width - 1,
    connectorY,
    bounds.note.position === "right" ? chars.rightT : chars.leftT,
    "noteBorder",
  )
  bounds.lines.forEach((line, index) => setText(grid, bounds.left + 2, bounds.top + 1 + index, line, "noteText"))
}

function transitionLineStyle(active: boolean): StateCellStyle {
  return active ? "activeTransition" : "transition"
}

function transitionLabelStyle(active: boolean): StateCellStyle {
  return active ? "activeTransition" : "label"
}

function transitionFadeCellStyle(context: TransitionDrawContext, distance: number): StateCellStyle {
  return stateTransitionFadeStyle(context.fadeSource, context.active, distance, context.fadeFromSource)
}

function drawHorizontalRamp(
  grid: StateGrid,
  fromX: number,
  toX: number,
  y: number,
  direction: 1 | -1,
  startDistance: number,
  context: TransitionDrawContext,
): void {
  let distance = startDistance
  for (let x = fromX; direction === 1 ? x <= toX : x >= toX; x += direction) {
    setPathCell(grid, context.path, x, y, "─", transitionFadeCellStyle(context, distance), context.sourceStateId)
    distance += 1
  }
}

function drawVerticalRamp(
  grid: StateGrid,
  x: number,
  fromY: number,
  toY: number,
  direction: 1 | -1,
  startDistance: number,
  context: TransitionDrawContext,
): void {
  let distance = startDistance
  for (let y = fromY; direction === 1 ? y <= toY : y >= toY; y += direction) {
    setPathCell(grid, context.path, x, y, "│", transitionFadeCellStyle(context, distance), context.sourceStateId)
    distance += 1
  }
}

function drawRightDeparture(grid: StateGrid, bounds: BoxBounds, context: TransitionDrawContext): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  setPathCell(
    grid,
    context.path,
    bounds.left + bounds.width - 1,
    bounds.centerY,
    BorderChars.rounded.leftT,
    transitionFadeCellStyle(context, 0),
    context.sourceStateId,
  )
}

function drawLeftDeparture(grid: StateGrid, bounds: BoxBounds, context: TransitionDrawContext): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  setPathCell(
    grid,
    context.path,
    bounds.left,
    bounds.centerY,
    BorderChars.rounded.rightT,
    transitionFadeCellStyle(context, 0),
    context.sourceStateId,
  )
}

function drawBottomDeparture(grid: StateGrid, bounds: BoxBounds, x: number, context: TransitionDrawContext): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  setPathCell(
    grid,
    context.path,
    x,
    bounds.top + bounds.height - 1,
    BorderChars.rounded.topT,
    transitionFadeCellStyle(context, 0),
    context.sourceStateId,
  )
}

function drawTopDeparture(grid: StateGrid, bounds: BoxBounds, x: number, context: TransitionDrawContext): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  setPathCell(
    grid,
    context.path,
    x,
    bounds.top,
    BorderChars.rounded.bottomT,
    transitionFadeCellStyle(context, 0),
    context.sourceStateId,
  )
}

function drawHorizontalForward(
  grid: StateGrid,
  plan: Extract<StateTransitionRoutePlan, { kind: "horizontal-forward" }>,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  context: TransitionDrawContext,
): void {
  const { from, to, targetIsChoice, leftToRight, transition } = plan
  const label = transition.label
  const y = from.centerY
  const lineStyle = transitionLineStyle(context.active)
  if (leftToRight) drawRightDeparture(grid, from, context)
  else drawLeftDeparture(grid, from, context)
  const step = leftToRight ? 1 : -1
  const startX = leftToRight ? from.left + from.width : from.left - 1
  const endX = leftToRight ? to.left - 1 : to.left + to.width
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1
  drawHorizontalRamp(grid, startX, targetIsChoice ? endX : endX - step, y, step, startDistance, context)
  if (targetIsChoice) addPathPoint(context.path, to.left, y)
  else
    setPathCell(
      grid,
      context.path,
      endX,
      y,
      diagramArrowHead(leftToRight ? "right" : "left", arrowHeadStyle),
      lineStyle,
    )
  if (label) {
    const metrics = measureStateTransitionLabel(label)
    const labelX = Math.min(startX, endX) + Math.max(1, Math.floor((Math.abs(endX - startX) - metrics.width) / 2))
    setTransitionLabel(grid, labelX, Math.max(0, y - metrics.height), label, transitionLabelStyle(context.active))
  }
}

function drawTransitionRoutePlan(
  grid: StateGrid,
  plan: StateTransitionRoutePlan,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  context: TransitionDrawContext,
): void {
  const { from, to, transition, targetIsChoice } = plan
  switch (plan.kind) {
    case "self":
      drawSelfTransition(grid, from, transition.label, arrowHeadStyle, context)
      return
    case "horizontal-forward":
      drawHorizontalForward(grid, plan, arrowHeadStyle, context)
      return
    case "bottom-feedback":
      drawBottomFeedback(grid, from, to, transition.label, plan.railY, arrowHeadStyle, targetIsChoice, context)
      return
    case "vertical-elbow":
      drawVerticalElbowTransition(
        grid,
        from,
        to,
        transition.label,
        plan.hasReverse,
        arrowHeadStyle,
        targetIsChoice,
        context,
      )
      return
    case "vertical":
      drawVertical(grid, from, to, transition.label, arrowHeadStyle, targetIsChoice, context)
  }
}

function drawSelfTransition(
  grid: StateGrid,
  bounds: BoxBounds,
  label: string,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  context: TransitionDrawContext,
): void {
  if (bounds.width <= 1 || bounds.height <= 1) return

  const lineStyle = transitionLineStyle(context.active)
  const sourceX = bounds.left + Math.max(2, Math.floor(bounds.width / 3))
  const bottomY = bounds.top + bounds.height - 1
  const railY = bottomY + 2
  const targetX = Math.max(sourceX + 3, bounds.left + Math.min(bounds.width - 3, Math.ceil((bounds.width * 2) / 3)))

  drawBottomDeparture(grid, bounds, sourceX, context)
  setPathCell(grid, context.path, sourceX, bottomY + 1, "│", transitionFadeCellStyle(context, 1), context.sourceStateId)
  setPathCell(grid, context.path, sourceX, railY, "╰", lineStyle)
  for (let x = sourceX + 1; x < targetX; x++) setPathCell(grid, context.path, x, railY, "─", lineStyle)
  setPathCell(grid, context.path, targetX, railY, "╯", lineStyle)
  setPathCell(grid, context.path, targetX, bottomY + 1, diagramArrowHead("up", arrowHeadStyle), lineStyle)

  if (label) setTransitionLabel(grid, targetX + 2, bottomY + 1, label, transitionLabelStyle(context.active))
}

function outsideBottomY(bounds: BoxBounds): number {
  return bounds.top + bounds.height
}

function innerConnectorX(bounds: BoxBounds, preferredX: number): number {
  if (bounds.width <= 2) return bounds.centerX
  return Math.max(bounds.left + 1, Math.min(bounds.left + bounds.width - 2, preferredX))
}

function drawBottomFeedback(
  grid: StateGrid,
  from: BoxBounds,
  to: BoxBounds,
  label: string,
  railY: number,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  targetIsChoice: boolean,
  context: TransitionDrawContext,
): void {
  const lineStyle = transitionLineStyle(context.active)
  const sourceX = from.centerX
  const targetX = to.width > 1 ? (sourceX > to.centerX ? to.left + 1 : to.left + to.width - 2) : to.centerX
  const targetRailCutsSource = targetX >= from.left && targetX <= from.left + from.width - 1
  const railTargetX = targetRailCutsSource ? Math.max(from.left + from.width, to.left + to.width) + 2 : targetX
  const sourceBottomY = outsideBottomY(from)
  const targetBottomY = outsideBottomY(to)
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  drawBottomDeparture(grid, from, sourceX, context)
  drawVerticalRamp(grid, sourceX, sourceBottomY, railY - 1, 1, startDistance, context)
  setPathCell(grid, context.path, sourceX, railY, sourceX > railTargetX ? "╯" : "╰", lineStyle)
  if (sourceX !== railTargetX) {
    const horizontalStep = sourceX < railTargetX ? 1 : -1
    for (let x = sourceX + horizontalStep; x !== railTargetX; x += horizontalStep) {
      setPathCell(grid, context.path, x, railY, "─", lineStyle)
    }
  }
  setPathCell(grid, context.path, railTargetX, railY, sourceX > railTargetX ? "╰" : "╯", lineStyle)
  for (let y = railY - 1; y > targetBottomY; y--) setPathCell(grid, context.path, railTargetX, y, "│", lineStyle)
  if (railTargetX !== targetX) {
    setPathCell(grid, context.path, railTargetX, targetBottomY, railTargetX < targetX ? "╭" : "╮", lineStyle)
    const horizontalStep = railTargetX < targetX ? 1 : -1
    for (let x = railTargetX + horizontalStep; x !== targetX; x += horizontalStep) {
      setPathCell(grid, context.path, x, targetBottomY, "─", lineStyle)
    }
  }
  setPathCell(
    grid,
    context.path,
    targetX,
    targetBottomY,
    targetIsChoice ? "│" : diagramArrowHead("up", arrowHeadStyle),
    lineStyle,
  )
  if (targetIsChoice) addPathPoint(context.path, to.left, to.top)

  if (label) {
    const metrics = measureStateTransitionLabel(label)
    const horizontalRoom = Math.abs(sourceX - railTargetX) - 2
    const labelX =
      metrics.width <= horizontalRoom
        ? Math.min(sourceX, railTargetX) +
          Math.max(1, Math.floor((Math.abs(sourceX - railTargetX) - metrics.width) / 2))
        : railTargetX + 2
    setTransitionLabel(grid, labelX, Math.max(0, railY - metrics.height), label, transitionLabelStyle(context.active))
  }
}

function drawVerticalElbowTransition(
  grid: StateGrid,
  from: BoxBounds,
  to: BoxBounds,
  label: string,
  hasReverse: boolean,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  targetIsChoice: boolean,
  context: TransitionDrawContext,
): void {
  const lineStyle = transitionLineStyle(context.active)
  const topToBottom = from.centerY < to.centerY
  const offset = hasReverse ? (topToBottom ? -2 : 2) : 0
  const startX = innerConnectorX(from, from.centerX + offset)
  const endX = innerConnectorX(to, to.centerX + offset)
  const startY = topToBottom ? from.top + from.height : from.top - 1
  const endY = topToBottom ? to.top - 1 : to.top + to.height
  const verticalStep = topToBottom ? 1 : -1
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  if (topToBottom) {
    drawBottomDeparture(grid, from, startX, context)
  } else {
    drawTopDeparture(grid, from, startX, context)
  }

  if (startY !== endY) drawVerticalRamp(grid, startX, startY, endY - verticalStep, verticalStep, startDistance, context)

  if (startX !== endX) {
    const horizontalStep = startX < endX ? 1 : -1
    setPathCell(
      grid,
      context.path,
      startX,
      endY,
      topToBottom ? (startX < endX ? "╰" : "╯") : startX < endX ? "╭" : "╮",
      lineStyle,
    )
    for (let x = startX + horizontalStep; x !== endX; x += horizontalStep) {
      setPathCell(grid, context.path, x, endY, "─", lineStyle)
    }
  }

  const targetChar = targetIsChoice
    ? startX === endX
      ? "│"
      : topToBottom
        ? "┬"
        : "┴"
    : diagramArrowHead(topToBottom ? "down" : "up", arrowHeadStyle)
  setPathCell(grid, context.path, endX, endY, targetChar, lineStyle)
  if (targetIsChoice) addPathPoint(context.path, to.left, to.top)
  if (label) {
    const width = measureStateTransitionLabel(label).width
    if (topToBottom) {
      const leftLabelX = startX - width - 2
      const labelX = hasReverse || endX < startX ? (leftLabelX >= 0 ? leftLabelX : startX + 4) : startX + 2
      setTransitionLabel(grid, labelX, Math.min(startY + 1, endY), label, transitionLabelStyle(context.active))
    } else {
      const labelX = Math.min(startX, endX) + Math.max(1, Math.floor((Math.abs(endX - startX) - width) / 2))
      setTransitionLabel(
        grid,
        startX === endX ? startX + 3 : labelX,
        Math.max(0, startY),
        label,
        transitionLabelStyle(context.active),
      )
    }
  }
}

function drawVertical(
  grid: StateGrid,
  from: BoxBounds,
  to: BoxBounds,
  label: string,
  arrowHeadStyle: StateDiagramArrowHeadStyle,
  targetIsChoice: boolean,
  context: TransitionDrawContext,
): void {
  const lineStyle = transitionLineStyle(context.active)
  const topToBottom = from.centerY <= to.centerY
  const x = from.centerX
  const startY = topToBottom ? from.top + from.height : from.top - 1
  const endY = topToBottom ? to.top - 1 : to.top + to.height
  const step = topToBottom ? 1 : -1
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  if (topToBottom) {
    drawBottomDeparture(grid, from, x, context)
  } else {
    drawTopDeparture(grid, from, x, context)
  }

  if (startY !== endY) drawVerticalRamp(grid, x, startY, endY - step, step, startDistance, context)
  setPathCell(
    grid,
    context.path,
    x,
    endY,
    targetIsChoice ? "│" : diagramArrowHead(topToBottom ? "down" : "up", arrowHeadStyle),
    lineStyle,
  )
  if (targetIsChoice) addPathPoint(context.path, to.left, to.top)
  if (label) setTransitionLabel(grid, x + 2, Math.min(startY, endY) + 1, label, transitionLabelStyle(context.active))
}

function connectionDirection(from: BoxBounds, to: BoxBounds): DiagramDirection {
  const deltaX = to.centerX - from.centerX
  const deltaY = to.centerY - from.centerY
  if (Math.abs(deltaX) >= Math.abs(deltaY) && deltaX !== 0) return deltaX > 0 ? "right" : "left"
  if (deltaY !== 0) return deltaY > 0 ? "down" : "up"
  return "right"
}

function drawChoiceJunctions(
  grid: StateGrid,
  diagram: StateDiagram,
  bounds: Map<string, BoxBounds>,
  activeState: string | undefined,
  activeTransitions: readonly StateDiagramActiveTransition[],
): void {
  for (const state of diagram.states) {
    if (state.kind !== "choice") continue
    const choiceBounds = bounds.get(state.id)
    if (!choiceBounds) continue

    const connections = new Set<DiagramDirection>()
    let active = false
    for (const transition of diagram.transitions) {
      if (transition.to === state.id) {
        const sourceBounds = bounds.get(transition.from)
        if (sourceBounds) connections.add(connectionDirection(choiceBounds, sourceBounds))
        active = active || isActiveTransition(transition, activeTransitions)
      }
      if (transition.from === state.id) {
        const targetBounds = bounds.get(transition.to)
        if (targetBounds) {
          const feedback =
            (diagram.direction === "LR" || diagram.direction === "RL") &&
            isStateHorizontalFeedback(diagram, choiceBounds, targetBounds)
          connections.add(feedback ? "down" : connectionDirection(choiceBounds, targetBounds))
        }
        active = active || isActiveTransition(transition, activeTransitions)
      }
    }

    setCell(
      grid,
      choiceBounds.left,
      choiceBounds.top,
      diagramLineGlyph(connections, "rounded"),
      state.id === activeState ? "activeState" : active ? "activeTransition" : "choice",
    )
  }
}

function drawHiddenCompositeMarkerJunctions(
  grid: StateGrid,
  diagram: StateDiagram,
  bounds: Map<string, BoxBounds>,
  activeState: string | undefined,
  activeTransitions: readonly StateDiagramActiveTransition[],
): void {
  for (const state of diagram.states) {
    if (!isHiddenCompositeMarker(state)) continue
    const markerBounds = bounds.get(state.id)
    if (!markerBounds) continue

    const connections = new Set<DiagramDirection>()
    let active = false
    for (const transition of diagram.transitions) {
      if (transition.to === state.id) {
        const sourceBounds = bounds.get(transition.from)
        if (sourceBounds) connections.add(connectionDirection(markerBounds, sourceBounds))
        active = active || isActiveTransition(transition, activeTransitions)
      }
      if (transition.from === state.id) {
        const targetBounds = bounds.get(transition.to)
        if (targetBounds) connections.add(connectionDirection(markerBounds, targetBounds))
        active = active || isActiveTransition(transition, activeTransitions)
      }
    }

    setCell(
      grid,
      markerBounds.left,
      markerBounds.top,
      diagramLineGlyph(connections, "rounded"),
      state.id === activeState ? "activeState" : active ? "activeTransition" : "transition",
    )
  }
}

function isActiveTransitionPulseTargetStyle(style: StateCellStyle | undefined): boolean {
  return isStateActiveTransitionStyle(style) || stateActiveTransitionPulseStyleLevel(style) > 0
}

function setActiveTransitionPulseCell(
  grid: StateGrid,
  x: number,
  y: number,
  distance: number,
  radius: number,
  edgeDistance: number,
): void {
  setTransitionPulseCell(grid, x, y, distance, radius, edgeDistance, isActiveTransitionPulseTargetStyle)
}

function isTransitionFrontierStyle(style: StateCellStyle | undefined): boolean {
  return isTransitionDrawingStyle(style) || stateActiveTransitionPulseStyleLevel(style) > 0
}

function setTransitionPulseCell(
  grid: StateGrid,
  x: number,
  y: number,
  distance: number,
  radius: number,
  edgeDistance: number,
  canStyle: (style: StateCellStyle | undefined) => boolean,
): void {
  setDiagramPulseCell(grid, x, y, distance, radius, edgeDistance, STATE_ACTIVE_TRANSITION_PULSE_STYLES, canStyle)
}

function setTransitionFrontierCell(
  grid: StateGrid,
  x: number,
  y: number,
  distance: number,
  radius: number,
  edgeDistance: number,
): void {
  setTransitionPulseCell(grid, x, y, distance, radius, edgeDistance, isTransitionFrontierStyle)
}

function activeTransitionPathLength(paths: readonly (StatePathPoint[] | undefined)[]): number {
  return paths.reduce((total, path) => total + (path?.length ?? 0), 0)
}

function activeTransitionPathPointAt(
  paths: readonly (StatePathPoint[] | undefined)[],
  index: number,
): StatePathPoint | undefined {
  let offset = index
  for (const path of paths) {
    if (!path) continue
    if (offset < path.length) return path[offset]
    offset -= path.length
  }
  return undefined
}

function drawActiveTransitionPulseOnPaths(
  grid: StateGrid,
  paths: readonly (StatePathPoint[] | undefined)[],
  pulseFrame: number | undefined,
  pulseProgress: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  const pathLength = activeTransitionPathLength(paths)
  if (pathLength === 0 || (pulseFrame === undefined && pulseProgress === undefined)) return

  visitDiagramPulsePath({
    pathLength,
    pointAt: (index) => activeTransitionPathPointAt(paths, index),
    pulseFrame,
    pulseProgress,
    pulseLength,
    pulseGap,
    visit: ([x, y], distance, radius, edgeDistance) =>
      setActiveTransitionPulseCell(grid, x, y, distance, radius, edgeDistance),
  })
}

function applyActiveTransitionPulse(
  grid: StateGrid,
  pulseFrame: number | undefined,
  pulseProgress: number | undefined,
  pulseLength: number,
  pulseGap: number,
  activeTransitionPaths: readonly (StatePathPoint[] | undefined)[],
): void {
  if (pulseFrame === undefined && pulseProgress === undefined) return

  drawActiveTransitionPulseOnPaths(grid, activeTransitionPaths, pulseFrame, pulseProgress, pulseLength, pulseGap)
}

function setInactiveTransitionCell(grid: StateGrid, x: number, y: number): void {
  const cell = grid.getCell(x, y)
  if (!cell || !isStateActiveTransitionStyle(cell.style)) return
  cell.style = stateInactiveTransitionStyle(cell.style)
}

function applyActiveTransitionMask(
  grid: StateGrid,
  activeTransitionPaths: readonly (StatePathPoint[] | undefined)[],
  progress: number | undefined,
  mode: StateDiagramActiveTransitionMode,
): void {
  if (progress === undefined) return

  const pathLength = activeTransitionPathLength(activeTransitionPaths)
  if (pathLength === 0) return

  const cutoff = Math.round(progress * pathLength)
  for (let index = 0; index < pathLength; index++) {
    const inactive = mode === "reveal" ? index >= cutoff : index < cutoff
    if (!inactive) continue
    const point = activeTransitionPathPointAt(activeTransitionPaths, index)
    if (!point) continue
    const [x, y] = point
    setInactiveTransitionCell(grid, x, y)
  }

  const before = mode === "reveal" ? ACTIVE_TRANSITION_FRONTIER_ACTIVE_SIDE : ACTIVE_TRANSITION_FRONTIER_INACTIVE_SIDE
  const after = mode === "reveal" ? ACTIVE_TRANSITION_FRONTIER_INACTIVE_SIDE : ACTIVE_TRANSITION_FRONTIER_ACTIVE_SIDE
  const radius = Math.max(before, after)
  for (let offset = -before; offset <= after; offset++) {
    const pathIndex = cutoff + offset
    if (pathIndex < 0 || pathIndex >= pathLength) continue
    const point = activeTransitionPathPointAt(activeTransitionPaths, pathIndex)
    if (!point) continue
    const [x, y] = point
    const edgeDistance = Math.min(pathIndex, pathLength - 1 - pathIndex)
    setTransitionFrontierCell(grid, x, y, Math.abs(offset), radius, edgeDistance)
  }
}

function transitionFadeSource(
  statesById: Map<string, StateDiagramState>,
  transition: StateDiagramTransition,
  activeState: string | undefined,
): FadeSourceStyle {
  if (transition.from === activeState) return "activeState"
  const source = statesById.get(transition.from)
  if (isHiddenCompositeMarker(source)) return "composite"
  if (source?.kind === "start") return "start"
  if (source?.kind === "end") return "end"
  if (source?.kind === "choice") return "choice"
  return "state"
}

export function layoutStateDiagram(sourceDiagram: StateDiagram, options: StateDiagramRenderOptions = {}): StateGrid {
  const directedDiagram = options.direction ? { ...sourceDiagram, direction: options.direction } : sourceDiagram
  const diagram = prepareVisibleStateDiagram(directedDiagram)
  const borderStyle = options.borderStyle ?? DEFAULT_STATE_BORDER_STYLE
  const arrowHeadStyle = options.arrowHeadStyle ?? DEFAULT_STATE_ARROW_HEAD_STYLE
  const minStateGap = normalizeStateMinStateGap(options.minStateGap)
  const pulseFrame = normalizeStatePulseFrame(options.pulseFrame)
  const pulseProgress = normalizeStatePulseProgress(options.pulseProgress)
  const pulseLength = normalizeStatePulseLength(options.pulseLength)
  const pulseGap = normalizeStatePulseGap(options.pulseGap)
  const activeTransitionProgress = normalizeStatePulseProgress(options.activeTransitionProgress)
  const activeTransitionMode = normalizeActiveTransitionMode(options.activeTransitionMode)
  const activeTransitions = normalizeActiveTransitions(options.activeTransition)
  const { bounds, sizes, compositeBounds, noteBounds } = createStateDiagramLayout(diagram, {
    minStateGap,
  })
  const statesById = new Map(diagram.states.map((state) => [state.id, state]))
  let allBounds = [...bounds.values(), ...noteBounds]
  let maxY = Math.max(0, ...allBounds.map((bound) => bound.top + bound.height))
  const feedbackLaneY = maxY + 3
  expandCompositeBoundsForFeedback(diagram, bounds, compositeBounds, feedbackLaneY)
  allBounds = [...bounds.values(), ...noteBounds]
  const maxX = Math.max(0, ...allBounds.map((bound) => bound.left + bound.width))
  maxY = Math.max(0, ...allBounds.map((bound) => bound.top + bound.height))
  const transitionLabelSizes = diagram.transitions.map((transition) => measureStateTransitionLabel(transition.label))
  const maxTransitionLabelWidth = Math.max(0, ...transitionLabelSizes.map((size) => size.width))
  const maxTransitionLabelLines = Math.max(0, ...transitionLabelSizes.map((size) => size.height))
  const grid = makeGrid(maxX + Math.max(24, maxTransitionLabelWidth + 4), maxY + 8 + maxTransitionLabelLines)
  const activeTransitionPaths: Array<StatePathPoint[] | undefined> = []

  for (const composite of diagram.composites) {
    const bound = compositeBounds.get(composite.id)
    if (!bound) continue
    drawContainerFrame(
      grid,
      bound,
      composite.label,
      BorderChars[borderStyle],
      options.activeState === composite.id ? "activeState" : "composite",
    )
  }

  for (const state of diagram.states) {
    const bound = bounds.get(state.id)
    const size = sizes.get(state.id)
    if (!bound || !size) continue
    drawBox(grid, state, bound, size.lines, options.activeState === state.id, borderStyle)
  }

  for (const plan of createStateTransitionRoutePlans(diagram, bounds, feedbackLaneY)) {
    const transition = plan.transition
    const fadeSource = transitionFadeSource(statesById, transition, options.activeState)
    const activeIndex = activeTransitionIndex(transition, activeTransitions)
    const active = activeIndex !== -1
    const fadeFromSource = activeIndex <= 0
    const activePath: StatePathPoint[] | undefined = active ? [] : undefined
    const drawContext: TransitionDrawContext = {
      fadeSource,
      active,
      fadeFromSource,
      path: activePath,
      sourceStateId: transition.from,
    }
    drawTransitionRoutePlan(grid, plan, arrowHeadStyle, drawContext)

    if (activePath?.length) activeTransitionPaths[activeIndex] = activePath
  }

  drawChoiceJunctions(grid, diagram, bounds, options.activeState, activeTransitions)
  drawHiddenCompositeMarkerJunctions(grid, diagram, bounds, options.activeState, activeTransitions)
  applyActiveTransitionMask(grid, activeTransitionPaths, activeTransitionProgress, activeTransitionMode)
  applyActiveTransitionPulse(grid, pulseFrame, pulseProgress, pulseLength, pulseGap, activeTransitionPaths)

  for (const noteBound of noteBounds) {
    const target = bounds.get(noteBound.note.target)
    if (target) drawNote(grid, noteBound, target)
  }

  return grid
}
