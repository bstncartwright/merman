import type { BorderStyle } from "@opentui/core"
import {
  normalizeDiagramPositiveInt,
  normalizeDiagramPulseFrame,
  normalizeDiagramPulseGap,
  normalizeDiagramPulseLength,
} from "../core/animation/pulse.js"

export const DEFAULT_MIN_PARTICIPANT_GAP = 18
export const DEFAULT_FRAGMENT_BORDER_STYLE = "rounded" satisfies BorderStyle

export function normalizeSequenceMinParticipantGap(value: number | undefined): number {
  return normalizeDiagramPositiveInt(value, DEFAULT_MIN_PARTICIPANT_GAP)
}

export function normalizeSequencePulseFrame(value: number | undefined): number | undefined {
  return normalizeDiagramPulseFrame(value)
}

export function normalizeSequencePulseLength(value: number | undefined): number {
  return normalizeDiagramPulseLength(value)
}

export function normalizeSequencePulseGap(value: number | undefined): number {
  return normalizeDiagramPulseGap(value)
}
