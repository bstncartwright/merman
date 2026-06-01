import { BorderChars } from "@opentui/core"
import type { DiagramDirection } from "../core/geometry.js"
import { diagramTextWidth, splitDiagramLines } from "../core/text.js"
import type { StateDiagramBoxBounds as BoxBounds } from "./layout.js"
import type { StateDiagram, StateDiagramState, StateDiagramTransition } from "./types.js"
import { isHiddenCompositeMarker, type StateVisibleDiagram, type StateVisibleTransition } from "./visible-model.js"

interface StateTransitionRoutePlanBase {
  transition: StateVisibleTransition
  from: BoxBounds
  to: BoxBounds
  targetIsChoice: boolean
}

export type StateTransitionRoutePlan =
  | (StateTransitionRoutePlanBase & { kind: "self" })
  | (StateTransitionRoutePlanBase & { kind: "horizontal-forward"; leftToRight: boolean })
  | (StateTransitionRoutePlanBase & { kind: "bottom-feedback"; railY: number })
  | (StateTransitionRoutePlanBase & { kind: "vertical-elbow"; hasReverse: boolean; offsetConnector: boolean })
  | (StateTransitionRoutePlanBase & { kind: "vertical" })

export type StateTransitionPathPoint = readonly [number, number]

interface StateTransitionRenderCellBase {
  x: number
  y: number
  fadeDistance?: number
}

export type StateTransitionRenderCell = StateTransitionRenderCellBase &
  ({ char: string; arrowDirection?: never } | { char?: never; arrowDirection: DiagramDirection })

export interface StateTransitionRenderLabel {
  x: number
  y: number
  lines: readonly string[]
}

export interface StateTransitionRenderPlan {
  route: StateTransitionRoutePlan
  cells: readonly StateTransitionRenderCell[]
  path: readonly StateTransitionPathPoint[]
  label?: StateTransitionRenderLabel
}

export interface StateTransitionJunctionPlan {
  state: StateDiagramState
  bounds: BoxBounds
  connections: ReadonlySet<DiagramDirection>
  transitions: readonly StateVisibleTransition[]
  kind: "choice" | "hidden-composite-marker"
}

interface StateTransitionRenderBuilder {
  route: StateTransitionRoutePlan
  cells: StateTransitionRenderCell[]
  path: StateTransitionPathPoint[]
  label?: StateTransitionRenderLabel
}

export function measureStateTransitionLabel(label: string): { lines: string[]; width: number; height: number } {
  if (!label) return { lines: [], width: 0, height: 0 }
  const lines = splitDiagramLines(label)
  return { lines, width: Math.max(...lines.map(diagramTextWidth)), height: lines.length }
}

export function hasReverseTransition(diagram: StateDiagram, transition: StateDiagramTransition): boolean {
  return diagram.transitions.some((other) => other.from === transition.to && other.to === transition.from)
}

export function isStateHorizontalFeedback(
  diagram: Pick<StateDiagram, "direction">,
  from: BoxBounds,
  to: BoxBounds,
): boolean {
  if (diagram.direction === "RL") return to.centerX > from.centerX
  return to.centerX < from.centerX
}

function hasOpposingTopConnector(
  diagram: StateVisibleDiagram,
  transition: StateVisibleTransition,
  bounds: ReadonlyMap<string, BoxBounds>,
): boolean {
  const from = bounds.get(transition.from)
  const to = bounds.get(transition.to)
  if (!from || !to || from.centerY === to.centerY) return false

  const lowerId = from.centerY > to.centerY ? transition.from : transition.to
  const lower = bounds.get(lowerId)!
  const leavesLower = transition.from === lowerId
  return diagram.transitions.some((other) => {
    if (other === transition || (leavesLower ? other.to !== lowerId : other.from !== lowerId)) return false
    const otherFrom = bounds.get(other.from)
    const otherTo = bounds.get(other.to)
    if (!otherFrom || !otherTo || Math.max(otherFrom.centerY, otherTo.centerY) !== lower.centerY) return false
    if (other.from !== lowerId) return true
    return !(
      (diagram.direction === "LR" || diagram.direction === "RL") &&
      isStateHorizontalFeedback(diagram, otherFrom, otherTo)
    )
  })
}

export function createStateTransitionRoutePlans(
  diagram: StateVisibleDiagram,
  bounds: ReadonlyMap<string, BoxBounds>,
  feedbackLaneY: number,
): StateTransitionRoutePlan[] {
  const statesById = new Map(diagram.states.map((state) => [state.id, state]))

  return diagram.transitions.flatMap((transition): StateTransitionRoutePlan[] => {
    const from = bounds.get(transition.from)
    const to = bounds.get(transition.to)
    if (!from || !to) return []

    const targetState = statesById.get(transition.to)
    const targetIsChoice = targetState?.kind === "choice" || isHiddenCompositeMarker(targetState)
    const base = { transition, from, to, targetIsChoice }
    if (diagram.direction !== "LR" && diagram.direction !== "RL") return [{ ...base, kind: "vertical" }]
    if (transition.from === transition.to) return [{ ...base, kind: "self" }]

    const feedback = isStateHorizontalFeedback(diagram, from, to)
    if (from.centerY !== to.centerY) {
      if (from.centerY > to.centerY && feedback) return [{ ...base, kind: "bottom-feedback", railY: feedbackLaneY }]
      const hasReverse = hasReverseTransition(diagram, transition)
      return [
        {
          ...base,
          kind: "vertical-elbow",
          hasReverse,
          offsetConnector: hasReverse || hasOpposingTopConnector(diagram, transition, bounds),
        },
      ]
    }
    if (feedback) return [{ ...base, kind: "bottom-feedback", railY: feedbackLaneY }]
    return [{ ...base, kind: "horizontal-forward", leftToRight: from.centerX <= to.centerX }]
  })
}

function addCell(builder: StateTransitionRenderBuilder, cell: StateTransitionRenderCell): void {
  builder.cells.push(cell)
  builder.path.push([cell.x, cell.y])
}

function addPathPoint(builder: StateTransitionRenderBuilder, x: number, y: number): void {
  builder.path.push([x, y])
}

function addLabel(builder: StateTransitionRenderBuilder, x: number, y: number, label: string): void {
  const metrics = measureStateTransitionLabel(label)
  if (metrics.lines.length > 0) builder.label = { x, y, lines: metrics.lines }
}

function addHorizontalFadeRamp(
  builder: StateTransitionRenderBuilder,
  fromX: number,
  toX: number,
  y: number,
  direction: 1 | -1,
  startDistance: number,
): void {
  let fadeDistance = startDistance
  for (let x = fromX; direction === 1 ? x <= toX : x >= toX; x += direction) {
    addCell(builder, { x, y, char: "─", fadeDistance })
    fadeDistance += 1
  }
}

function addVerticalFadeRamp(
  builder: StateTransitionRenderBuilder,
  x: number,
  fromY: number,
  toY: number,
  direction: 1 | -1,
  startDistance: number,
): void {
  let fadeDistance = startDistance
  for (let y = fromY; direction === 1 ? y <= toY : y >= toY; y += direction) {
    addCell(builder, { x, y, char: "│", fadeDistance })
    fadeDistance += 1
  }
}

function addRightDeparture(builder: StateTransitionRenderBuilder, bounds: BoxBounds): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  addCell(builder, {
    x: bounds.left + bounds.width - 1,
    y: bounds.centerY,
    char: BorderChars.rounded.leftT,
    fadeDistance: 0,
  })
}

function addLeftDeparture(builder: StateTransitionRenderBuilder, bounds: BoxBounds): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  addCell(builder, { x: bounds.left, y: bounds.centerY, char: BorderChars.rounded.rightT, fadeDistance: 0 })
}

function addBottomDeparture(builder: StateTransitionRenderBuilder, bounds: BoxBounds, x: number): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  addCell(builder, {
    x,
    y: bounds.top + bounds.height - 1,
    char: BorderChars.rounded.topT,
    fadeDistance: 0,
  })
}

function addTopDeparture(builder: StateTransitionRenderBuilder, bounds: BoxBounds, x: number): void {
  if (bounds.width <= 1 || bounds.height <= 1) return
  addCell(builder, { x, y: bounds.top, char: BorderChars.rounded.bottomT, fadeDistance: 0 })
}

function addHorizontalForward(builder: StateTransitionRenderBuilder): void {
  const { from, to, targetIsChoice, leftToRight, transition } = builder.route as Extract<
    StateTransitionRoutePlan,
    { kind: "horizontal-forward" }
  >
  const y = from.centerY
  if (leftToRight) addRightDeparture(builder, from)
  else addLeftDeparture(builder, from)
  const step = leftToRight ? 1 : -1
  const startX = leftToRight ? from.left + from.width : from.left - 1
  const endX = leftToRight ? to.left - 1 : to.left + to.width
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1
  addHorizontalFadeRamp(builder, startX, targetIsChoice ? endX : endX - step, y, step, startDistance)
  if (targetIsChoice) addPathPoint(builder, to.left, y)
  else addCell(builder, { x: endX, y, arrowDirection: leftToRight ? "right" : "left" })
  if (!transition.label) return
  const metrics = measureStateTransitionLabel(transition.label)
  const labelX = Math.min(startX, endX) + Math.max(1, Math.floor((Math.abs(endX - startX) - metrics.width) / 2))
  addLabel(builder, labelX, Math.max(0, y - metrics.height), transition.label)
}

function addSelfTransition(builder: StateTransitionRenderBuilder): void {
  const { from: bounds, transition } = builder.route
  if (bounds.width <= 1 || bounds.height <= 1) return
  const sourceX = bounds.left + Math.max(2, Math.floor(bounds.width / 3))
  const bottomY = bounds.top + bounds.height - 1
  const railY = bottomY + 2
  const targetX = Math.max(sourceX + 3, bounds.left + Math.min(bounds.width - 3, Math.ceil((bounds.width * 2) / 3)))

  addBottomDeparture(builder, bounds, sourceX)
  addCell(builder, { x: sourceX, y: bottomY + 1, char: "│", fadeDistance: 1 })
  addCell(builder, { x: sourceX, y: railY, char: "╰" })
  for (let x = sourceX + 1; x < targetX; x++) addCell(builder, { x, y: railY, char: "─" })
  addCell(builder, { x: targetX, y: railY, char: "╯" })
  addCell(builder, { x: targetX, y: bottomY + 1, arrowDirection: "up" })
  if (transition.label) addLabel(builder, targetX + 2, bottomY + 1, transition.label)
}

function outsideBottomY(bounds: BoxBounds): number {
  return bounds.top + bounds.height
}

function addBottomFeedback(builder: StateTransitionRenderBuilder): void {
  const { from, to, targetIsChoice, transition, railY } = builder.route as Extract<
    StateTransitionRoutePlan,
    { kind: "bottom-feedback" }
  >
  const sourceX = from.centerX
  const targetX = to.width > 1 ? (sourceX > to.centerX ? to.left + 1 : to.left + to.width - 2) : to.centerX
  const targetRailCutsSource = targetX >= from.left && targetX <= from.left + from.width - 1
  const railTargetX = targetRailCutsSource ? Math.max(from.left + from.width, to.left + to.width) + 2 : targetX
  const sourceBottomY = outsideBottomY(from)
  const targetBottomY = outsideBottomY(to)
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  addBottomDeparture(builder, from, sourceX)
  addVerticalFadeRamp(builder, sourceX, sourceBottomY, railY - 1, 1, startDistance)
  addCell(builder, { x: sourceX, y: railY, char: sourceX > railTargetX ? "╯" : "╰" })
  if (sourceX !== railTargetX) {
    const horizontalStep = sourceX < railTargetX ? 1 : -1
    for (let x = sourceX + horizontalStep; x !== railTargetX; x += horizontalStep) {
      addCell(builder, { x, y: railY, char: "─" })
    }
  }
  addCell(builder, { x: railTargetX, y: railY, char: sourceX > railTargetX ? "╰" : "╯" })
  for (let y = railY - 1; y > targetBottomY; y--) addCell(builder, { x: railTargetX, y, char: "│" })
  if (railTargetX !== targetX) {
    addCell(builder, { x: railTargetX, y: targetBottomY, char: railTargetX < targetX ? "╭" : "╮" })
    const horizontalStep = railTargetX < targetX ? 1 : -1
    for (let x = railTargetX + horizontalStep; x !== targetX; x += horizontalStep) {
      addCell(builder, { x, y: targetBottomY, char: "─" })
    }
  }
  addCell(builder, { x: targetX, y: targetBottomY, ...(targetIsChoice ? { char: "│" } : { arrowDirection: "up" }) })
  if (targetIsChoice) addPathPoint(builder, to.left, to.top)
  if (!transition.label) return
  const metrics = measureStateTransitionLabel(transition.label)
  const horizontalRoom = Math.abs(sourceX - railTargetX) - 2
  const labelX =
    metrics.width <= horizontalRoom
      ? Math.min(sourceX, railTargetX) + Math.max(1, Math.floor((Math.abs(sourceX - railTargetX) - metrics.width) / 2))
      : railTargetX + 2
  addLabel(builder, labelX, Math.max(0, railY - metrics.height), transition.label)
}

function innerConnectorX(bounds: BoxBounds, preferredX: number): number {
  if (bounds.width <= 2) return bounds.centerX
  return Math.max(bounds.left + 1, Math.min(bounds.left + bounds.width - 2, preferredX))
}

function addVerticalElbowTransition(builder: StateTransitionRenderBuilder): void {
  const { from, to, transition, targetIsChoice, hasReverse, offsetConnector } = builder.route as Extract<
    StateTransitionRoutePlan,
    { kind: "vertical-elbow" }
  >
  const topToBottom = from.centerY < to.centerY
  const offset = offsetConnector ? (topToBottom ? -2 : 2) : 0
  const startX = innerConnectorX(from, from.centerX + offset)
  const endX = innerConnectorX(to, to.centerX + offset)
  const startY = topToBottom ? from.top + from.height : from.top - 1
  const endY = topToBottom ? to.top - 1 : to.top + to.height
  const verticalStep = topToBottom ? 1 : -1
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  if (topToBottom) addBottomDeparture(builder, from, startX)
  else addTopDeparture(builder, from, startX)
  const bendY =
    startX === endX ? endY : topToBottom ? endY - verticalStep * Math.min(2, Math.abs(endY - startY) - 1) : startY
  const targetApproachLength = Math.abs(endY - bendY)
  const hasTargetApproach = targetApproachLength > 0
  if (startY !== bendY) addVerticalFadeRamp(builder, startX, startY, bendY - verticalStep, verticalStep, startDistance)
  if (startX !== endX) {
    const horizontalStep = startX < endX ? 1 : -1
    addCell(builder, {
      x: startX,
      y: bendY,
      char: topToBottom ? (startX < endX ? "╰" : "╯") : startX < endX ? "╭" : "╮",
    })
    for (let x = startX + horizontalStep; x !== endX; x += horizontalStep) addCell(builder, { x, y: bendY, char: "─" })
    if (hasTargetApproach) {
      addCell(builder, {
        x: endX,
        y: bendY,
        char: topToBottom ? (startX < endX ? "╮" : "╭") : startX < endX ? "╯" : "╰",
      })
      for (let distance = 1; distance < targetApproachLength; distance++) {
        addCell(builder, { x: endX, y: bendY + verticalStep * distance, char: "│" })
      }
    }
  }
  const targetChar = targetIsChoice ? (hasTargetApproach || startX === endX ? "│" : topToBottom ? "┬" : "┴") : undefined
  addCell(builder, {
    x: endX,
    y: endY,
    ...(targetChar ? { char: targetChar } : { arrowDirection: topToBottom ? "down" : "up" }),
  })
  if (targetIsChoice) addPathPoint(builder, to.left, to.top)
  if (!transition.label) return
  const metrics = measureStateTransitionLabel(transition.label)
  if (topToBottom) {
    const leftLabelX = startX - metrics.width - 2
    const labelX = hasReverse || endX < startX ? (leftLabelX >= 0 ? leftLabelX : startX + 4) : startX + 2
    addLabel(
      builder,
      labelX,
      hasTargetApproach ? Math.max(0, bendY - metrics.height) : Math.min(startY + 1, endY),
      transition.label,
    )
  } else {
    const labelX = Math.min(startX, endX) + Math.max(1, Math.floor((Math.abs(endX - startX) - metrics.width) / 2))
    addLabel(
      builder,
      startX === endX ? startX + 3 : labelX,
      hasTargetApproach ? Math.max(0, bendY - metrics.height) : Math.max(0, startY),
      transition.label,
    )
  }
}

function addVerticalTransition(builder: StateTransitionRenderBuilder): void {
  const { from, to, transition, targetIsChoice } = builder.route
  const topToBottom = from.centerY <= to.centerY
  const x = from.centerX
  const startY = topToBottom ? from.top + from.height : from.top - 1
  const endY = topToBottom ? to.top - 1 : to.top + to.height
  const step = topToBottom ? 1 : -1
  const startDistance = from.width <= 1 || from.height <= 1 ? 0 : 1

  if (topToBottom) addBottomDeparture(builder, from, x)
  else addTopDeparture(builder, from, x)
  if (startY !== endY) addVerticalFadeRamp(builder, x, startY, endY - step, step, startDistance)
  addCell(builder, {
    x,
    y: endY,
    ...(targetIsChoice ? { char: "│" } : { arrowDirection: topToBottom ? "down" : "up" }),
  })
  if (targetIsChoice) addPathPoint(builder, to.left, to.top)
  if (transition.label) addLabel(builder, x + 2, Math.min(startY, endY) + 1, transition.label)
}

function createStateTransitionRenderPlan(route: StateTransitionRoutePlan): StateTransitionRenderPlan {
  const builder: StateTransitionRenderBuilder = { route, cells: [], path: [] }
  switch (route.kind) {
    case "self":
      addSelfTransition(builder)
      break
    case "horizontal-forward":
      addHorizontalForward(builder)
      break
    case "bottom-feedback":
      addBottomFeedback(builder)
      break
    case "vertical-elbow":
      addVerticalElbowTransition(builder)
      break
    case "vertical":
      addVerticalTransition(builder)
      break
  }
  return builder
}

export function createStateTransitionRenderPlans(
  diagram: StateVisibleDiagram,
  bounds: ReadonlyMap<string, BoxBounds>,
  feedbackLaneY: number,
): StateTransitionRenderPlan[] {
  return createStateTransitionRoutePlans(diagram, bounds, feedbackLaneY).map(createStateTransitionRenderPlan)
}

function connectionDirection(from: BoxBounds, to: BoxBounds): DiagramDirection {
  const deltaX = to.centerX - from.centerX
  const deltaY = to.centerY - from.centerY
  if (Math.abs(deltaX) >= Math.abs(deltaY) && deltaX !== 0) return deltaX > 0 ? "right" : "left"
  if (deltaY !== 0) return deltaY > 0 ? "down" : "up"
  return "right"
}

export function createStateTransitionJunctionPlans(
  diagram: StateVisibleDiagram,
  bounds: ReadonlyMap<string, BoxBounds>,
): StateTransitionJunctionPlan[] {
  return diagram.states.flatMap((state): StateTransitionJunctionPlan[] => {
    const kind =
      state.kind === "choice" ? "choice" : isHiddenCompositeMarker(state) ? "hidden-composite-marker" : undefined
    if (!kind) return []
    const stateBounds = bounds.get(state.id)
    if (!stateBounds) return []

    const connections = new Set<DiagramDirection>()
    const transitions: StateVisibleTransition[] = []
    for (const transition of diagram.transitions) {
      let connected = false
      if (transition.to === state.id) {
        const sourceBounds = bounds.get(transition.from)
        if (sourceBounds) connections.add(connectionDirection(stateBounds, sourceBounds))
        connected = true
      }
      if (transition.from === state.id) {
        const targetBounds = bounds.get(transition.to)
        if (targetBounds) {
          const feedback =
            kind === "choice" &&
            (diagram.direction === "LR" || diagram.direction === "RL") &&
            isStateHorizontalFeedback(diagram, stateBounds, targetBounds)
          connections.add(feedback ? "down" : connectionDirection(stateBounds, targetBounds))
        }
        connected = true
      }
      if (connected) transitions.push(transition)
    }

    return [{ state, bounds: stateBounds, connections, transitions, kind }]
  })
}
