import { BorderChars, type BorderStyle } from "@opentui/core"
import { DiagramCanvas } from "../core/canvas.js"
import { diagramPulseCellStyle, diagramPulseStyleLevel } from "../core/animation/pulse-cell.js"
import { visitDiagramPulsePath } from "../core/animation/pulse.js"
import {
  DEFAULT_FRAGMENT_BORDER_STYLE,
  normalizeSequencePulseFrame,
  normalizeSequencePulseGap,
  normalizeSequencePulseLength,
} from "./options.js"
import {
  createSequencePlacementPlan,
  type SequenceGroupPlacement,
  type SequenceHorizontalBounds,
  type SequenceStepPlacement,
} from "./placement.js"
import type { SequenceGrid } from "./render-grid.js"
import { SEQUENCE_FADE_STEPS as FADE_STEPS, SEQUENCE_PULSE_STYLES as PULSE_STYLES } from "./style.js"
import type {
  MessageStyle,
  SequenceArrowHead,
  SequenceCellStyle,
  SequenceDiagram,
  SequenceDiagramRenderOptions,
} from "./types.js"

const SEQUENCE_BORDER = BorderChars.rounded

function arrowHeadChar(head: SequenceArrowHead | undefined, direction: 1 | -1): string {
  switch (head) {
    case "open":
      return direction === 1 ? ">" : "<"
    case "cross":
      return "✕"
    case "async":
      return direction === 1 ? ")" : "("
    default:
      return direction === 1 ? "▶" : "◀"
  }
}

function createGrid(width: number, height: number): SequenceGrid {
  return new DiagramCanvas(width, height)
}

function setCell(grid: SequenceGrid, x: number, y: number, char: string, style?: SequenceCellStyle): void {
  grid.setCell(x, y, char, style)
}

function setText(grid: SequenceGrid, x: number, y: number, text: string, style?: SequenceCellStyle): void {
  grid.setText(Math.max(0, x), y, text, style)
}

function setArrowDepartureFade(
  grid: SequenceGrid,
  x: number,
  y: number,
  direction: 1 | -1,
  style: SequenceCellStyle,
): void {
  setCell(
    grid,
    x,
    y,
    direction === 1 ? SEQUENCE_BORDER.leftT : SEQUENCE_BORDER.rightT,
    `${style}Fade1` as SequenceCellStyle,
  )
  for (let step = 2; step <= 5; step++) {
    setCell(grid, x + direction * (step - 1), y, SEQUENCE_BORDER.horizontal, `${style}Fade${step}` as SequenceCellStyle)
  }
}

function pulseCellStyle(
  messageStyle: MessageStyle,
  distance: number,
  radius: number,
  edgeDistance: number,
  char: string,
): { style: SequenceCellStyle; level: number } {
  return diagramPulseCellStyle(
    PULSE_STYLES[messageStyle],
    distance,
    radius,
    edgeDistance,
    char,
    `${SEQUENCE_BORDER.horizontal}${SEQUENCE_BORDER.vertical}`,
  )
}

function pulseStyleLevel(style: SequenceCellStyle | undefined): number {
  const pulseStyleSets: ReadonlyArray<readonly SequenceCellStyle[]> = [PULSE_STYLES.request, PULSE_STYLES.response]
  for (const pulseStyles of pulseStyleSets) {
    const level = diagramPulseStyleLevel(style, pulseStyles)
    if (level > 0) return level
  }
  return 0
}

function setPulseCell(
  grid: SequenceGrid,
  x: number,
  y: number,
  messageStyle: MessageStyle,
  distance: number,
  radius: number,
  edgeDistance: number,
): void {
  const cell = grid.getCell(x, y)
  if (!cell || cell.char === " ") return

  const pulse = pulseCellStyle(messageStyle, distance, radius, edgeDistance, cell.char)
  if (pulseStyleLevel(cell.style) > pulse.level) return
  cell.style = pulse.style
}

function drawPulseOnPath(
  grid: SequenceGrid,
  pathLength: number,
  pointAt: (index: number) => readonly [number, number],
  messageStyle: MessageStyle,
  pulseFrame: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  visitDiagramPulsePath({
    pathLength,
    pointAt,
    pulseFrame,
    pulseLength,
    pulseGap,
    visit: ([x, y], distance, radius, edgeDistance) =>
      setPulseCell(grid, x, y, messageStyle, distance, radius, edgeDistance),
  })
}

function drawStraightPulse(
  grid: SequenceGrid,
  leftX: number,
  rightX: number,
  y: number,
  direction: 1 | -1,
  messageStyle: MessageStyle,
  pulseFrame: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  const pathLength = rightX - leftX + 1
  if (pathLength <= 0) return
  drawPulseOnPath(
    grid,
    pathLength,
    (index) => [direction === 1 ? leftX + index : rightX - index, y],
    messageStyle,
    pulseFrame,
    pulseLength,
    pulseGap,
  )
}

function drawSelfMessagePulse(
  grid: SequenceGrid,
  centerX: number,
  rightX: number,
  headX: number,
  topRow: number,
  bottomRow: number,
  messageStyle: MessageStyle,
  pulseFrame: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  const topStartX = Math.min(centerX + FADE_STEPS.length, rightX)
  const topLength = rightX - topStartX + 1
  const rightLength = bottomRow - topRow
  const bottomLength = rightX - headX
  const pathLength = topLength + rightLength + bottomLength

  drawPulseOnPath(
    grid,
    pathLength,
    (index) => {
      if (index < topLength) return [topStartX + index, topRow]
      if (index < topLength + rightLength) return [rightX, topRow + 1 + index - topLength]
      return [rightX - 1 - (index - topLength - rightLength), bottomRow]
    },
    messageStyle,
    pulseFrame,
    pulseLength,
    pulseGap,
  )
}

function groupVerticalChar(existing: string | undefined): string | undefined {
  switch (existing) {
    case undefined:
    case " ":
      return SEQUENCE_BORDER.vertical
    case SEQUENCE_BORDER.vertical:
      return SEQUENCE_BORDER.vertical
    default:
      return undefined
  }
}

function setGroupVerticalCell(grid: SequenceGrid, x: number, y: number): void {
  const existing = grid.getCell(x, y)?.char
  const char = groupVerticalChar(existing)
  if (char) setCell(grid, x, y, char, "group")
}

function renderParticipantGroups(
  grid: SequenceGrid,
  groupBounds: readonly SequenceGroupPlacement[],
  bottomY: number,
): void {
  for (const bounds of groupBounds) {
    for (let x = bounds.leftX; x <= bounds.rightX; x++) {
      setCell(grid, x, 0, SEQUENCE_BORDER.horizontal, "group")
      setCell(grid, x, bottomY, SEQUENCE_BORDER.horizontal, "group")
    }

    setCell(grid, bounds.leftX, 0, SEQUENCE_BORDER.topLeft, "group")
    setCell(grid, bounds.rightX, 0, SEQUENCE_BORDER.topRight, "group")
    setCell(grid, bounds.leftX, bottomY, SEQUENCE_BORDER.bottomLeft, "group")
    setCell(grid, bounds.rightX, bottomY, SEQUENCE_BORDER.bottomRight, "group")

    for (let y = 1; y < bottomY; y++) {
      setGroupVerticalCell(grid, bounds.leftX, y)
      setGroupVerticalCell(grid, bounds.rightX, y)
    }

    if (bounds.labelText) {
      setText(grid, bounds.leftX + 2, 0, bounds.labelText, "group")
    }
  }
}

function drawFragmentWalls(
  grid: SequenceGrid,
  bounds: SequenceHorizontalBounds,
  startY: number,
  endY: number,
  borderStyle: BorderStyle,
): void {
  if (endY < startY) return
  const border = BorderChars[borderStyle]

  for (let y = startY; y <= endY; y++) {
    setCell(grid, bounds.leftX, y, border.vertical, "fragment")
    setCell(grid, bounds.rightX, y, border.vertical, "fragment")
  }
}

function renderFragment(
  grid: SequenceGrid,
  placement: Extract<SequenceStepPlacement, { type: "fragment" }>,
  borderStyle: BorderStyle,
): void {
  const { bounds, fragment, labelText: label, y } = placement
  const border = BorderChars[borderStyle]
  const { leftX, rightX } = bounds

  const leftChar =
    fragment.kind === "alt" || fragment.kind === "loop"
      ? border.topLeft
      : fragment.kind === "else"
        ? border.leftT
        : border.bottomLeft
  const rightChar =
    fragment.kind === "alt" || fragment.kind === "loop"
      ? border.topRight
      : fragment.kind === "else"
        ? border.rightT
        : border.bottomRight

  for (let x = leftX; x <= rightX; x++) {
    setCell(grid, x, y, border.horizontal, "fragment")
  }

  setCell(grid, leftX, y, leftChar, "fragment")
  setCell(grid, rightX, y, rightChar, "fragment")
  if (label) {
    setText(grid, leftX + 2, y, label, "fragmentLabel")
  }
}

function renderSelfMessage(
  grid: SequenceGrid,
  placement: Extract<SequenceStepPlacement, { type: "selfMessage" }>,
  style: MessageStyle,
  pulseFrame: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  const { centerX, rightX, topY: topRow, bottomY: bottomRow, labelLines, message } = placement

  setArrowDepartureFade(grid, centerX, topRow, 1, style)
  for (let x = centerX + FADE_STEPS.length; x < rightX; x++) {
    setCell(grid, x, topRow, SEQUENCE_BORDER.horizontal, style)
  }
  setCell(grid, rightX, topRow, SEQUENCE_BORDER.topRight, style)

  for (let lineIndex = 0; lineIndex < labelLines.length; lineIndex++) {
    const y = topRow + lineIndex + 1
    setCell(grid, centerX, y, SEQUENCE_BORDER.vertical, "lifeline")
    setText(grid, centerX + 2, y, labelLines[lineIndex]!, style)
    setCell(grid, rightX, y, SEQUENCE_BORDER.vertical, style)
  }

  for (let x = centerX + 1; x < rightX; x++) {
    setCell(grid, x, bottomRow, SEQUENCE_BORDER.horizontal, style)
  }
  const headX = message.head === undefined ? centerX : centerX + 1
  setCell(grid, headX, bottomRow, arrowHeadChar(message.head, -1), style)
  setCell(grid, rightX, bottomRow, SEQUENCE_BORDER.bottomRight, style)
  if (pulseFrame !== undefined) {
    drawSelfMessagePulse(grid, centerX, rightX, headX, topRow, bottomRow, style, pulseFrame, pulseLength, pulseGap)
  }
}

export function layoutSequenceDiagram(
  diagram: SequenceDiagram,
  options: SequenceDiagramRenderOptions = {},
): SequenceGrid {
  const plan = createSequencePlacementPlan(diagram, options)
  if (plan.width === 0 || plan.height === 0) return createGrid(0, 0)
  const fragmentBorderStyle = options.fragmentBorderStyle ?? DEFAULT_FRAGMENT_BORDER_STYLE
  const pulseFrame = normalizeSequencePulseFrame(options.pulseFrame)
  const pulseLength = normalizeSequencePulseLength(options.pulseLength)
  const pulseGap = normalizeSequencePulseGap(options.pulseGap)
  const grid = createGrid(plan.width, plan.height)

  if (plan.groups.length > 0) renderParticipantGroups(grid, plan.groups, plan.height - 1)

  for (const placement of plan.participants) {
    const { participant, centerX: center, headerLeftX, headerRightX, labelX } = placement
    const { participantHeaderTopY, participantHeaderY, participantRuleY, lifelineStartY, lifelineEndY } = plan.rows

    for (let x = headerLeftX; x <= headerRightX; x++) {
      setCell(grid, x, participantHeaderTopY, SEQUENCE_BORDER.horizontal, "lifeline")
      setCell(grid, x, participantRuleY, SEQUENCE_BORDER.horizontal, "lifeline")
    }

    setCell(grid, headerLeftX, participantHeaderTopY, SEQUENCE_BORDER.topLeft, "lifeline")
    setCell(grid, headerRightX, participantHeaderTopY, SEQUENCE_BORDER.topRight, "lifeline")
    setCell(grid, headerLeftX, participantHeaderY, SEQUENCE_BORDER.vertical, "lifeline")
    setCell(grid, headerRightX, participantHeaderY, SEQUENCE_BORDER.vertical, "lifeline")
    setCell(grid, headerLeftX, participantRuleY, SEQUENCE_BORDER.bottomLeft, "lifeline")
    setCell(grid, headerRightX, participantRuleY, SEQUENCE_BORDER.bottomRight, "lifeline")
    setText(grid, labelX, participantHeaderY, participant.label, "participant")
    setCell(grid, center, participantRuleY, SEQUENCE_BORDER.topT, "lifeline")

    for (let y = lifelineStartY; y <= lifelineEndY; y++) {
      setCell(grid, center, y, SEQUENCE_BORDER.vertical, "lifeline")
    }
  }

  for (const placement of plan.steps) {
    if (placement.type === "note") {
      setText(grid, placement.textX, placement.textY, placement.text, "noteBadge")
      continue
    }

    if (placement.type === "fragment") {
      if (placement.wallsBefore) {
        drawFragmentWalls(
          grid,
          placement.wallsBefore.bounds,
          placement.wallsBefore.startY,
          placement.wallsBefore.endY,
          fragmentBorderStyle,
        )
      }
      renderFragment(grid, placement, fragmentBorderStyle)
      continue
    }

    const message = placement.message
    const messageStyle: MessageStyle = message.style === "dashed" ? "response" : "request"

    if (placement.type === "selfMessage") {
      renderSelfMessage(grid, placement, messageStyle, pulseFrame, pulseLength, pulseGap)
      continue
    }

    for (let lineIndex = 0; lineIndex < placement.labelLines.length; lineIndex++) {
      setText(grid, placement.labelX, placement.labelY + lineIndex, placement.labelLines[lineIndex]!, messageStyle)
    }

    for (let x = placement.leftX + 1; x < placement.rightX; x++) {
      setCell(grid, x, placement.arrowY, SEQUENCE_BORDER.horizontal, messageStyle)
    }

    setArrowDepartureFade(grid, placement.fromX, placement.arrowY, placement.direction, messageStyle)
    setCell(grid, placement.headX, placement.arrowY, arrowHeadChar(message.head, placement.direction), messageStyle)
    if (pulseFrame !== undefined) {
      const leftPulseX = placement.direction === 1 ? placement.fromX + FADE_STEPS.length : placement.headX
      const rightPulseX = placement.direction === 1 ? placement.headX : placement.fromX - FADE_STEPS.length
      drawStraightPulse(
        grid,
        leftPulseX,
        rightPulseX,
        placement.arrowY,
        placement.direction,
        messageStyle,
        pulseFrame,
        pulseLength,
        pulseGap,
      )
    }
  }

  return grid
}
