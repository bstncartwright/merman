import type { StateDiagramBoxBounds as BoxBounds } from "./layout.js"
import type { StateDiagram, StateDiagramTransition } from "./types.js"
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
  | (StateTransitionRoutePlanBase & { kind: "vertical-elbow"; hasReverse: boolean })
  | (StateTransitionRoutePlanBase & { kind: "vertical" })

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
      return [{ ...base, kind: "vertical-elbow", hasReverse: hasReverseTransition(diagram, transition) }]
    }
    if (feedback) return [{ ...base, kind: "bottom-feedback", railY: feedbackLaneY }]
    return [{ ...base, kind: "horizontal-forward", leftToRight: from.centerX <= to.centerX }]
  })
}
