import type { RGBA } from "@opentui/core"
import {
  ansiBg,
  ansiFg,
  brightenColor,
  createAnsiPeakAndRampTheme,
  createAnsiRampTheme,
  createColorPeakAndRamp,
  createColorRampTheme,
  DIAGRAM_FADE_STEPS,
  numberedStyleKeys,
  type DiagramRgb,
} from "../core/color/style.js"
import type {
  AnsiSequenceCellStyle,
  FadeStyle,
  MessagePulseStyle,
  MessageStyle,
  PulseFadeStyle,
  SequenceCellStyle,
  SequenceDiagramAnsiTheme,
} from "./types.js"

export type SequenceStyleColors = Partial<Record<AnsiSequenceCellStyle, RGBA>> & {
  noteBg?: RGBA
  fragmentLabelBg?: RGBA
  pulse?: RGBA
}

export const SEQUENCE_FADE_STEPS = DIAGRAM_FADE_STEPS
export const SEQUENCE_PULSE_STYLES = {
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

function createAnsiFadeTheme(style: MessageStyle, from: DiagramRgb, to: DiagramRgb): Record<FadeStyle, string> {
  return createAnsiRampTheme(numberedStyleKeys(`${style}Fade`, SEQUENCE_FADE_STEPS), from, to) as Record<
    FadeStyle,
    string
  >
}

function createAnsiPulseTheme(
  style: MessageStyle,
  from: DiagramRgb,
  to: DiagramRgb,
): Record<MessagePulseStyle | PulseFadeStyle, string> {
  return createAnsiPeakAndRampTheme(
    `${style}Pulse`,
    numberedStyleKeys(`${style}PulseFade`, SEQUENCE_FADE_STEPS),
    from,
    to,
  )
}

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

function createColorFadeTheme(
  style: MessageStyle,
  from: RGBA | undefined,
  to: RGBA | undefined,
): Record<FadeStyle, RGBA | undefined> {
  return createColorRampTheme(numberedStyleKeys(`${style}Fade`, SEQUENCE_FADE_STEPS), from, to) as Record<
    FadeStyle,
    RGBA | undefined
  >
}

function createPulseStyleColors(
  style: MessageStyle,
  from: RGBA | undefined,
  to: RGBA | undefined,
): Partial<Record<MessagePulseStyle | PulseFadeStyle, RGBA | undefined>> {
  return createColorPeakAndRamp(`${style}Pulse`, numberedStyleKeys(`${style}PulseFade`, SEQUENCE_FADE_STEPS), from, to)
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

export function sequenceStyleColor(
  style: SequenceCellStyle | undefined,
  colors: SequenceStyleColors,
): RGBA | undefined {
  if (style === "noteBadge") return colors.note
  if (style === "fragmentLabel") return colors.fragment
  return style ? colors[style] : undefined
}

export function sequenceStyleBackgroundColor(
  style: SequenceCellStyle | undefined,
  colors: SequenceStyleColors,
): RGBA | undefined {
  if (style === "fragmentLabel") return colors.fragmentLabelBg
  return style === "noteBadge" ? colors.noteBg : undefined
}

export function resolveSequenceAnsiTheme(
  theme: SequenceDiagramAnsiTheme = {},
): Required<Record<AnsiSequenceCellStyle, string>> {
  return { ...DEFAULT_ANSI_THEME, ...theme }
}
