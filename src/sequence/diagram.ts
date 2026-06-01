import { BorderChars, RGBA, type BorderStyle, type StyledText } from "@opentui/core"
import { DiagramCanvas } from "../core/canvas.js"
import { diagramPulseCellStyle, diagramPulseStyleLevel } from "../core/animation/pulse-cell.js"
import { visitDiagramPulsePath } from "../core/animation/pulse.js"
import {
  ansiBg,
  ansiFg,
  brightenColor,
  createAnsiPeakAndRampTheme,
  createAnsiRampTheme,
  createColorRampTheme,
  createColorPeakAndRamp,
  DIAGRAM_FADE_STEPS,
  numberedStyleKeys,
  type DiagramRgb,
} from "../core/color/style.js"
import { diagramTextWidth } from "../core/text.js"
import { renderDiagramGridAnsi, renderDiagramGridStyledText } from "../core/render-grid.js"
import {
  DEFAULT_FRAGMENT_BORDER_STYLE,
  DEFAULT_MIN_PARTICIPANT_GAP,
  normalizeSequencePulseFrame,
  normalizeSequencePulseGap,
  normalizeSequencePulseLength,
} from "./options.js"
import { parseMermaidSequenceDiagram } from "./parser.js"
import type {
  AnsiSequenceCellStyle,
  FadeStyle,
  MessagePulseStyle,
  MessageStyle,
  PulseFadeStyle,
  SequenceArrowHead,
  SequenceCellStyle,
  SequenceDiagram,
  SequenceDiagramAnsiOptions,
  SequenceDiagramAnsiTheme,
  SequenceDiagramRenderOptions,
  SequenceFragment,
  SequenceMessage,
  SequenceParticipantGroup,
  SequenceStep,
} from "./types.js"
export type SequenceGrid = DiagramCanvas<SequenceCellStyle>

export type SequenceStyleColors = Partial<Record<AnsiSequenceCellStyle, RGBA>> & {
  noteBg?: RGBA
  fragmentLabelBg?: RGBA
  pulse?: RGBA
}

const NOTE_HORIZONTAL_PADDING = 1
const GROUP_HORIZONTAL_PADDING = 2
const FRAGMENT_HORIZONTAL_OVERHANG = 3
const SEQUENCE_BORDER = BorderChars.rounded
const FADE_STEPS = DIAGRAM_FADE_STEPS
const PULSE_STYLES = {
  request: [
    "requestPulseFade1",
    "requestPulseFade2",
    "requestPulseFade3",
    "requestPulseFade4",
    "requestPulseFade5",
    "requestPulse",
  ],
  response: [
    "responsePulseFade1",
    "responsePulseFade2",
    "responsePulseFade3",
    "responsePulseFade4",
    "responsePulseFade5",
    "responsePulse",
  ],
} as const satisfies Record<MessageStyle, readonly SequenceCellStyle[]>
const DEFAULT_THEME_RGB = {
  participant: [228, 239, 232],
  lifeline: [111, 138, 126],
  group: [76, 99, 89],
  request: [134, 225, 200],
  response: [230, 177, 126],
  requestPulse: [221, 255, 246],
  responsePulse: [255, 232, 205],
  fragment: [154, 184, 169],
  fragmentLabelBg: [28, 43, 36],
  noteFg: [215, 229, 221],
  noteBg: [36, 56, 47],
} as const satisfies Record<string, DiagramRgb>
const DEFAULT_ANSI_THEME: Required<Record<AnsiSequenceCellStyle, string>> = {
  participant: ansiFg(DEFAULT_THEME_RGB.participant),
  lifeline: ansiFg(DEFAULT_THEME_RGB.lifeline),
  group: ansiFg(DEFAULT_THEME_RGB.group),
  request: ansiFg(DEFAULT_THEME_RGB.request),
  response: ansiFg(DEFAULT_THEME_RGB.response),
  fragment: ansiFg(DEFAULT_THEME_RGB.fragment),
  fragmentLabel: `${ansiFg(DEFAULT_THEME_RGB.fragment)}${ansiBg(DEFAULT_THEME_RGB.fragmentLabelBg)}`,
  note: `${ansiFg(DEFAULT_THEME_RGB.noteFg)}${ansiBg(DEFAULT_THEME_RGB.noteBg)}`,
  ...createAnsiFadeTheme("request", DEFAULT_THEME_RGB.lifeline, DEFAULT_THEME_RGB.request),
  ...createAnsiFadeTheme("response", DEFAULT_THEME_RGB.lifeline, DEFAULT_THEME_RGB.response),
  ...createAnsiPulseTheme("request", DEFAULT_THEME_RGB.request, DEFAULT_THEME_RGB.requestPulse),
  ...createAnsiPulseTheme("response", DEFAULT_THEME_RGB.response, DEFAULT_THEME_RGB.responsePulse),
}
function createAnsiFadeTheme(style: MessageStyle, from: DiagramRgb, to: DiagramRgb): Record<FadeStyle, string> {
  return createAnsiRampTheme(numberedStyleKeys(`${style}Fade`, FADE_STEPS), from, to) as Record<FadeStyle, string>
}

function createAnsiPulseTheme(
  style: MessageStyle,
  from: DiagramRgb,
  to: DiagramRgb,
): Record<MessagePulseStyle | PulseFadeStyle, string> {
  return createAnsiPeakAndRampTheme(`${style}Pulse`, numberedStyleKeys(`${style}PulseFade`, FADE_STEPS), from, to)
}

function visualLength(value: string): number {
  return diagramTextWidth(value)
}

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

function arrowHeadX(toX: number, direction: 1 | -1, head: SequenceArrowHead | undefined): number {
  return head === undefined ? toX : toX - direction
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

function renderGridText(grid: SequenceGrid): string {
  return grid.toString()
}

function styleColor(style: SequenceCellStyle | undefined, colors: SequenceStyleColors): RGBA | undefined {
  if (style === "noteBadge") return colors.note
  if (style === "fragmentLabel") return colors.fragment
  return style ? colors[style] : undefined
}

function styleBackgroundColor(style: SequenceCellStyle | undefined, colors: SequenceStyleColors): RGBA | undefined {
  if (style === "fragmentLabel") return colors.fragmentLabelBg
  return style === "noteBadge" ? colors.noteBg : undefined
}

function createColorFadeTheme(
  style: MessageStyle,
  from: RGBA | undefined,
  to: RGBA | undefined,
): Record<FadeStyle, RGBA | undefined> {
  return createColorRampTheme(numberedStyleKeys(`${style}Fade`, FADE_STEPS), from, to) as Record<
    FadeStyle,
    RGBA | undefined
  >
}

function createPulseStyleColors(
  style: MessageStyle,
  from: RGBA | undefined,
  to: RGBA | undefined,
): Partial<Record<MessagePulseStyle | PulseFadeStyle, RGBA | undefined>> {
  return createColorPeakAndRamp(`${style}Pulse`, numberedStyleKeys(`${style}PulseFade`, FADE_STEPS), from, to)
}

export function resolveSequenceStyleColors(colors: SequenceStyleColors): SequenceStyleColors {
  const requestPulse = colors.pulse ?? brightenColor(colors.request, 0.65)
  const responsePulse = colors.pulse ?? brightenColor(colors.response, 0.65)

  return {
    ...colors,
    ...createColorFadeTheme("request", colors.lifeline, colors.request),
    ...createColorFadeTheme("response", colors.lifeline, colors.response),
    ...createPulseStyleColors("request", colors.request, requestPulse),
    ...createPulseStyleColors("response", colors.response, responsePulse),
  }
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
  const bottomLength = rightX - centerX
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

function styleAnsi(
  style: SequenceCellStyle | undefined,
  theme: Required<SequenceDiagramAnsiTheme>,
): string | undefined {
  if (style === "noteBadge") return theme.note
  return style ? theme[style] : undefined
}

function renderGridAnsi(grid: SequenceGrid, theme: SequenceDiagramAnsiTheme = {}): string {
  const resolvedTheme = { ...DEFAULT_ANSI_THEME, ...theme }
  return renderDiagramGridAnsi(grid, (run) => styleAnsi(run.style, resolvedTheme))
}

export function renderGridStyledText(grid: SequenceGrid, colors: SequenceStyleColors): StyledText {
  return renderDiagramGridStyledText(
    grid,
    (run) => styleColor(run.style, colors),
    (run) => styleBackgroundColor(run.style, colors),
  )
}

function centeredStart(center: number, text: string): number {
  return center - Math.floor(visualLength(text) / 2)
}

function noteLabelText(label: string): string {
  const padding = " ".repeat(NOTE_HORIZONTAL_PADDING)
  return `${padding}${label}${padding}`
}

function messageLabelText(message: SequenceMessage): string {
  return message.number === undefined ? message.label : `${message.number}. ${message.label}`
}

function participantHeaderWidth(label: string): number {
  return Math.max(5, visualLength(label) + 4)
}

function fragmentLabelText(fragment: SequenceFragment): string {
  if (fragment.kind === "end") {
    return ""
  }

  const prefix = fragment.kind === "loop" ? "↻ loop" : fragment.kind
  return ` ${prefix}: ${fragment.label} `
}

function messageLabelLines(label: string): string[] {
  const lines = label.split(/(?:<br\s*\/?\s*>|\\n)/i).map((line) => line.trimEnd())
  return lines.length > 0 ? lines : [""]
}

function labelLinesWidth(lines: string[]): number {
  return lines.reduce((max, line) => Math.max(max, visualLength(line)), 0)
}

function messageLabelWidth(label: string): number {
  return labelLinesWidth(messageLabelLines(label))
}

function messageWidth(message: SequenceMessage): number {
  return messageLabelWidth(messageLabelText(message))
}

function selfMessageLoopWidth(message: SequenceMessage): number {
  return selfMessageLoopWidthForLines(messageLabelLines(messageLabelText(message)))
}

function selfMessageLoopWidthForLines(labelLines: string[]): number {
  return Math.max(10, labelLinesWidth(labelLines) + 4)
}

function getStepHeight(step: SequenceStep): number {
  if (step.type === "note") return 3
  if (step.type === "activation") return 0
  if (step.type === "fragment") return 2
  return messageLabelLines(messageLabelText(step.message)).length + (step.message.from === step.message.to ? 3 : 2)
}

function createParticipantIndexMap(diagram: SequenceDiagram): Map<string, number> {
  return new Map(diagram.participants.map((participant, index) => [participant.id, index]))
}

function getParticipantIndexes(participantIndexes: Map<string, number>, participantIds: string[]): number[] {
  return participantIds
    .map((participantId) => participantIndexes.get(participantId) ?? -1)
    .filter((index) => index >= 0)
}

interface SequenceGroupRange {
  group: SequenceParticipantGroup
  startIndex: number
  endIndex: number
}

interface SequenceGroupBounds {
  group: SequenceParticipantGroup
  leftX: number
  rightX: number
}

interface SequenceHorizontalBounds {
  leftX: number
  rightX: number
}

interface ActiveFragmentFrame {
  bounds: SequenceHorizontalBounds
  boundaryY: number
}

interface PendingFragmentFrame {
  startIndex: number
  bounds: SequenceHorizontalBounds
}

function groupLabelText(group: SequenceParticipantGroup): string {
  return group.label ? ` ${group.label} ` : ""
}

function getGroupRanges(diagram: SequenceDiagram, participantIndexes: Map<string, number>): SequenceGroupRange[] {
  return diagram.groups.flatMap((group) => {
    const indexes = getParticipantIndexes(participantIndexes, group.participantIds)
    if (indexes.length === 0) return []

    return [
      {
        group,
        startIndex: Math.min(...indexes),
        endIndex: Math.max(...indexes),
      },
    ]
  })
}

function resolveGroupBounds(
  diagram: SequenceDiagram,
  centers: number[],
  participantIndexes: Map<string, number>,
  groupRanges: SequenceGroupRange[],
): SequenceGroupBounds[] {
  return groupRanges.map((range) => {
    let contentLeftX = centers[range.startIndex]!
    let contentRightX = centers[range.endIndex]!

    for (let i = range.startIndex; i <= range.endIndex; i++) {
      const participant = diagram.participants[i]!
      const headerWidth = participantHeaderWidth(participant.label)
      const headerStartX = centers[i]! - Math.floor(headerWidth / 2)
      contentLeftX = Math.min(contentLeftX, headerStartX)
      contentRightX = Math.max(contentRightX, headerStartX + headerWidth - 1)
    }

    for (const message of diagram.messages) {
      const participantIndex = participantIndexes.get(message.from)
      if (participantIndex === undefined || participantIndex !== participantIndexes.get(message.to)) continue
      if (participantIndex < range.startIndex || participantIndex > range.endIndex) continue
      contentRightX = Math.max(contentRightX, centers[participantIndex]! + selfMessageLoopWidth(message))
    }

    let leftX = contentLeftX - GROUP_HORIZONTAL_PADDING
    let rightX = contentRightX + GROUP_HORIZONTAL_PADDING
    const minWidth = visualLength(groupLabelText(range.group)) + 4
    const width = rightX - leftX + 1

    if (width < minWidth) {
      const extraWidth = minWidth - width
      leftX -= Math.floor(extraWidth / 2)
      rightX += Math.ceil(extraWidth / 2)
    }

    return { group: range.group, leftX, rightX }
  })
}

function expandHorizontalBounds(bounds: SequenceHorizontalBounds, leftX: number, rightX: number): void {
  bounds.leftX = Math.min(bounds.leftX, leftX)
  bounds.rightX = Math.max(bounds.rightX, rightX)
}

function getDiagramContentBounds(
  diagram: SequenceDiagram,
  centers: number[],
  participantIndexes: Map<string, number>,
): SequenceHorizontalBounds {
  const bounds: SequenceHorizontalBounds = { leftX: 0, rightX: 0 }

  for (let i = 0; i < diagram.participants.length; i++) {
    const participant = diagram.participants[i]!
    const headerWidth = participantHeaderWidth(participant.label)
    const labelStartX = centers[i]! - Math.floor(headerWidth / 2)
    expandHorizontalBounds(bounds, labelStartX, labelStartX + headerWidth - 1)
  }

  for (const message of diagram.messages) {
    const fromIndex = participantIndexes.get(message.from) ?? -1
    const toIndex = participantIndexes.get(message.to) ?? -1
    if (fromIndex < 0 || toIndex < 0) continue

    const fromX = centers[fromIndex]!
    const toX = centers[toIndex]!
    if (fromIndex === toIndex) {
      expandHorizontalBounds(bounds, fromX, fromX + selfMessageLoopWidth(message))
      continue
    }

    const leftX = Math.min(fromX, toX)
    const rightX = Math.max(fromX, toX)
    const labelStartX = leftX + 2
    expandHorizontalBounds(bounds, leftX, Math.max(rightX, labelStartX + messageWidth(message) - 1))
  }

  for (const step of diagram.steps) {
    if (step.type !== "note") continue

    const indexes = getParticipantIndexes(participantIndexes, step.note.over)
    if (indexes.length === 0) continue

    const leftX = centers[Math.min(...indexes)]!
    const rightX = centers[Math.max(...indexes)]!
    const centerX = Math.floor((leftX + rightX) / 2)
    const noteText = noteLabelText(step.note.label)
    const noteStartX = centeredStart(centerX, noteText)
    expandHorizontalBounds(bounds, noteStartX, noteStartX + visualLength(noteText) - 1)
  }

  return bounds
}

function getFragmentFrameBounds(
  centers: number[],
  fragment: SequenceFragment,
  nestingDepth = 0,
): SequenceHorizontalBounds | undefined {
  const leftParticipantX = centers[0]
  const rightParticipantX = centers[centers.length - 1]
  if (leftParticipantX === undefined || rightParticipantX === undefined) return undefined

  const leftX = leftParticipantX - FRAGMENT_HORIZONTAL_OVERHANG + nestingDepth
  const participantRightX = rightParticipantX + FRAGMENT_HORIZONTAL_OVERHANG - nestingDepth
  const label = fragmentLabelText(fragment)
  const rightX = Math.max(participantRightX, leftX + 2 + visualLength(label) + 1)
  return { leftX, rightX }
}

function getFragmentBounds(boundsByStep: Iterable<SequenceHorizontalBounds>): SequenceHorizontalBounds {
  const bounds: SequenceHorizontalBounds = { leftX: 0, rightX: 0 }

  for (const fragmentBounds of boundsByStep) {
    expandHorizontalBounds(bounds, fragmentBounds.leftX, fragmentBounds.rightX)
  }

  return bounds
}

function getFragmentFrameBoundsByStep(centers: number[], steps: SequenceStep[]): Map<number, SequenceHorizontalBounds> {
  const boundsByStep = new Map<number, SequenceHorizontalBounds>()
  const activeFrames: PendingFragmentFrame[] = []

  for (const [index, step] of steps.entries()) {
    if (step.type !== "fragment") continue
    const bounds = getFragmentFrameBounds(centers, step.fragment, activeFrames.length)
    if (!bounds) continue

    if (step.fragment.kind === "alt" || step.fragment.kind === "loop") {
      activeFrames.push({ startIndex: index, bounds: { ...bounds } })
      continue
    }

    const frame = activeFrames[activeFrames.length - 1]
    if (!frame) continue
    expandHorizontalBounds(frame.bounds, bounds.leftX, bounds.rightX)
    if (step.fragment.kind !== "end") continue

    activeFrames.pop()
    boundsByStep.set(frame.startIndex, frame.bounds)
    const parent = activeFrames[activeFrames.length - 1]
    if (parent) expandHorizontalBounds(parent.bounds, frame.bounds.leftX, frame.bounds.rightX)
  }

  for (const frame of activeFrames) boundsByStep.set(frame.startIndex, frame.bounds)
  return boundsByStep
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

function renderParticipantGroups(grid: SequenceGrid, groupBounds: SequenceGroupBounds[], bottomY: number): void {
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

    const label = groupLabelText(bounds.group)
    if (label) {
      setText(grid, bounds.leftX + 2, 0, label, "group")
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
  centers: number[],
  fragment: SequenceFragment,
  y: number,
  borderStyle: BorderStyle,
  frameBounds?: SequenceHorizontalBounds,
): SequenceHorizontalBounds | undefined {
  const bounds = frameBounds ?? getFragmentFrameBounds(centers, fragment)
  if (!bounds) return
  const border = BorderChars[borderStyle]
  const { leftX, rightX } = bounds
  const label = fragmentLabelText(fragment)

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
  return bounds
}

function renderSelfMessage(
  grid: SequenceGrid,
  centerX: number,
  topRow: number,
  labelLines: string[],
  head: SequenceArrowHead | undefined,
  style: MessageStyle,
  pulseFrame: number | undefined,
  pulseLength: number,
  pulseGap: number,
): void {
  const rightX = centerX + selfMessageLoopWidthForLines(labelLines)
  const bottomRow = topRow + labelLines.length + 1

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
  setCell(grid, arrowHeadX(centerX, -1, head), bottomRow, arrowHeadChar(head, -1), style)
  setCell(grid, rightX, bottomRow, SEQUENCE_BORDER.bottomRight, style)
  if (pulseFrame !== undefined) {
    drawSelfMessagePulse(grid, centerX, rightX, topRow, bottomRow, style, pulseFrame, pulseLength, pulseGap)
  }
}

function resolveParticipantCenters(
  diagram: SequenceDiagram,
  participantIndexes: Map<string, number>,
  minParticipantGap: number,
): number[] {
  const gaps = Array.from({ length: Math.max(0, diagram.participants.length - 1) }, (_, index) => {
    const left = diagram.participants[index]!
    const right = diagram.participants[index + 1]!
    return Math.max(
      minParticipantGap,
      Math.ceil(participantHeaderWidth(left.label) / 2) + Math.ceil(participantHeaderWidth(right.label) / 2) + 6,
    )
  })

  for (const message of diagram.messages) {
    const fromIndex = participantIndexes.get(message.from) ?? -1
    const toIndex = participantIndexes.get(message.to) ?? -1
    if (fromIndex === toIndex && fromIndex >= 0 && fromIndex < diagram.participants.length - 1) {
      const nextParticipant = diagram.participants[fromIndex + 1]!
      gaps[fromIndex] = Math.max(
        gaps[fromIndex]!,
        selfMessageLoopWidth(message) + Math.ceil(visualLength(nextParticipant.label) / 2) + 2,
      )
      continue
    }
    if (fromIndex < 0 || toIndex < 0 || Math.abs(fromIndex - toIndex) !== 1) continue

    const gapIndex = Math.min(fromIndex, toIndex)
    gaps[gapIndex] = Math.max(gaps[gapIndex]!, messageWidth(message) + 6)
  }

  for (const step of diagram.steps) {
    if (step.type !== "note") continue

    const indexes = getParticipantIndexes(participantIndexes, step.note.over)
    if (indexes.length !== 2 || Math.abs(indexes[0]! - indexes[1]!) !== 1) continue

    const gapIndex = Math.min(indexes[0]!, indexes[1]!)
    gaps[gapIndex] = Math.max(gaps[gapIndex]!, visualLength(noteLabelText(step.note.label)) + 4)
  }

  const centers: number[] = []
  const firstLabel = diagram.participants[0]?.label ?? ""
  centers[0] = Math.max(1, Math.floor(participantHeaderWidth(firstLabel) / 2))

  for (let i = 1; i < diagram.participants.length; i++) {
    centers[i] = centers[i - 1]! + gaps[i - 1]!
  }

  return centers
}

export function layoutSequenceDiagram(content: string, options: SequenceDiagramRenderOptions = {}): SequenceGrid {
  const diagram = parseMermaidSequenceDiagram(content)
  if (diagram.participants.length === 0) return createGrid(0, 0)
  const participantIndexes = createParticipantIndexMap(diagram)
  const fragmentBorderStyle = options.fragmentBorderStyle ?? DEFAULT_FRAGMENT_BORDER_STYLE
  const pulseFrame = normalizeSequencePulseFrame(options.pulseFrame)
  const pulseLength = normalizeSequencePulseLength(options.pulseLength)
  const pulseGap = normalizeSequencePulseGap(options.pulseGap)

  let centers = resolveParticipantCenters(
    diagram,
    participantIndexes,
    options.minParticipantGap ?? DEFAULT_MIN_PARTICIPANT_GAP,
  )
  const groupRanges = getGroupRanges(diagram, participantIndexes)
  let groupBounds = resolveGroupBounds(diagram, centers, participantIndexes, groupRanges)
  let contentBounds = getDiagramContentBounds(diagram, centers, participantIndexes)
  let fragmentFrameBounds = getFragmentFrameBoundsByStep(centers, diagram.steps)
  let fragmentBounds = getFragmentBounds(fragmentFrameBounds.values())
  const groupLeftOverflow = groupBounds.reduce((leftmostX, bounds) => Math.min(leftmostX, bounds.leftX), 0)
  const leftOverflow = Math.min(groupLeftOverflow, contentBounds.leftX, fragmentBounds.leftX, 0)

  if (leftOverflow < 0) {
    centers = centers.map((center) => center - leftOverflow)
    groupBounds = resolveGroupBounds(diagram, centers, participantIndexes, groupRanges)
    contentBounds = getDiagramContentBounds(diagram, centers, participantIndexes)
    fragmentFrameBounds = getFragmentFrameBoundsByStep(centers, diagram.steps)
    fragmentBounds = getFragmentBounds(fragmentFrameBounds.values())
  }

  const hasGroups = groupBounds.length > 0
  const groupRowOffset = hasGroups ? 1 : 0
  const participantHeaderTopY = groupRowOffset
  const participantHeaderY = participantHeaderTopY + 1
  const participantRuleY = participantHeaderTopY + 2
  const lifelineStartY = participantRuleY + 1
  const stepStartY = lifelineStartY + 1
  const groupWidth = groupBounds.reduce((width, bounds) => Math.max(width, bounds.rightX + 1), 0)
  const width = Math.max(contentBounds.rightX + 1, groupWidth, fragmentBounds.rightX + 1)
  const baseHeight = stepStartY + diagram.steps.reduce((total, step) => total + getStepHeight(step), 0)
  const height = hasGroups ? Math.max(5, baseHeight + 1) : Math.max(3, baseHeight)
  const grid = createGrid(width, height)

  if (hasGroups) {
    renderParticipantGroups(grid, groupBounds, height - 1)
  }

  for (let i = 0; i < diagram.participants.length; i++) {
    const participant = diagram.participants[i]!
    const center = centers[i]!
    const headerWidth = participantHeaderWidth(participant.label)
    const headerLeftX = center - Math.floor(headerWidth / 2)
    const headerRightX = headerLeftX + headerWidth - 1

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
    setText(grid, centeredStart(center, participant.label), participantHeaderY, participant.label, "participant")
    setCell(grid, center, participantRuleY, SEQUENCE_BORDER.topT, "lifeline")

    const lifelineEndY = hasGroups ? height - 2 : height - 1
    for (let y = lifelineStartY; y <= lifelineEndY; y++) {
      setCell(grid, center, y, SEQUENCE_BORDER.vertical, "lifeline")
    }
  }

  let stepY = stepStartY
  const activeFragmentFrames: ActiveFragmentFrame[] = []

  for (const [stepIndex, step] of diagram.steps.entries()) {
    if (step.type === "activation") {
      continue
    }

    if (step.type === "note") {
      const stepHeight = getStepHeight(step)
      const indexes = getParticipantIndexes(participantIndexes, step.note.over)
      if (indexes.length === 0) continue

      const leftX = centers[Math.min(...indexes)]!
      const rightX = centers[Math.max(...indexes)]!
      const centerX = Math.floor((leftX + rightX) / 2)
      const noteText = noteLabelText(step.note.label)
      const labelRow = stepY + 1
      setText(grid, centeredStart(centerX, noteText), labelRow, noteText, "noteBadge")
      stepY += stepHeight
      continue
    }

    if (step.type === "fragment") {
      const stepHeight = getStepHeight(step)
      if (step.fragment.kind === "alt" || step.fragment.kind === "loop") {
        const bounds = renderFragment(
          grid,
          centers,
          step.fragment,
          stepY,
          fragmentBorderStyle,
          fragmentFrameBounds.get(stepIndex),
        )
        if (bounds) {
          activeFragmentFrames.push({ bounds, boundaryY: stepY })
        }
      } else if (step.fragment.kind === "else") {
        const activeFrame = activeFragmentFrames[activeFragmentFrames.length - 1]
        if (activeFrame) {
          drawFragmentWalls(grid, activeFrame.bounds, activeFrame.boundaryY + 1, stepY - 1, fragmentBorderStyle)
          renderFragment(grid, centers, step.fragment, stepY, fragmentBorderStyle, activeFrame.bounds)
          activeFrame.boundaryY = stepY
        } else {
          renderFragment(grid, centers, step.fragment, stepY, fragmentBorderStyle)
        }
      } else {
        const activeFrame = activeFragmentFrames.pop()
        if (activeFrame) {
          drawFragmentWalls(grid, activeFrame.bounds, activeFrame.boundaryY + 1, stepY - 1, fragmentBorderStyle)
          renderFragment(grid, centers, step.fragment, stepY, fragmentBorderStyle, activeFrame.bounds)
        } else {
          renderFragment(grid, centers, step.fragment, stepY, fragmentBorderStyle)
        }
      }
      stepY += stepHeight
      continue
    }

    const labelRow = stepY
    const message = step.message
    const stepHeight = getStepHeight(step)
    const messageStyle: MessageStyle = message.style === "dashed" ? "response" : "request"
    const labelLines = messageLabelLines(messageLabelText(message))
    const arrowRow = labelRow + labelLines.length
    const fromIndex = participantIndexes.get(message.from) ?? -1
    const toIndex = participantIndexes.get(message.to) ?? -1
    if (fromIndex < 0 || toIndex < 0) continue

    if (fromIndex === toIndex) {
      renderSelfMessage(
        grid,
        centers[fromIndex]!,
        stepY,
        labelLines,
        message.head,
        messageStyle,
        pulseFrame,
        pulseLength,
        pulseGap,
      )
      stepY += stepHeight
      continue
    }

    const fromX = centers[fromIndex]!
    const toX = centers[toIndex]!
    const leftX = Math.min(fromX, toX)
    const rightX = Math.max(fromX, toX)
    const labelStart = leftX + 2

    for (let lineIndex = 0; lineIndex < labelLines.length; lineIndex++) {
      setText(grid, labelStart, labelRow + lineIndex, labelLines[lineIndex]!, messageStyle)
    }

    for (let x = leftX + 1; x < rightX; x++) {
      setCell(grid, x, arrowRow, SEQUENCE_BORDER.horizontal, messageStyle)
    }

    if (toX > fromX) {
      setArrowDepartureFade(grid, fromX, arrowRow, 1, messageStyle)
      const headX = arrowHeadX(toX, 1, message.head)
      setCell(grid, headX, arrowRow, arrowHeadChar(message.head, 1), messageStyle)
      if (pulseFrame !== undefined) {
        drawStraightPulse(
          grid,
          fromX + FADE_STEPS.length,
          headX,
          arrowRow,
          1,
          messageStyle,
          pulseFrame,
          pulseLength,
          pulseGap,
        )
      }
    } else {
      setArrowDepartureFade(grid, fromX, arrowRow, -1, messageStyle)
      const headX = arrowHeadX(toX, -1, message.head)
      setCell(grid, headX, arrowRow, arrowHeadChar(message.head, -1), messageStyle)
      if (pulseFrame !== undefined) {
        drawStraightPulse(
          grid,
          headX,
          fromX - FADE_STEPS.length,
          arrowRow,
          -1,
          messageStyle,
          pulseFrame,
          pulseLength,
          pulseGap,
        )
      }
    }

    stepY += stepHeight
  }

  return grid
}

export function renderSequenceDiagram(content: string, options: SequenceDiagramRenderOptions = {}): string {
  return renderGridText(layoutSequenceDiagram(content, options))
}

export function renderSequenceDiagramAnsi(content: string, options: SequenceDiagramAnsiOptions = {}): string {
  return renderGridAnsi(layoutSequenceDiagram(content, options), options.theme)
}
