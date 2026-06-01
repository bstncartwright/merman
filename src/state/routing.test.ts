import { describe, expect, test } from "bun:test"
import { activeTransitionIndex } from "./active-transition.js"
import type { StateDiagramBoxBounds } from "./layout.js"
import { parseMermaidStateDiagram } from "./parser.js"
import { createStateTransitionRoutePlans } from "./routing.js"
import { prepareVisibleStateDiagram, type StateVisibleDiagram } from "./visible-model.js"

function bounds(id: string, centerX: number, centerY: number): StateDiagramBoxBounds {
  return { id, left: centerX - 2, top: centerY - 1, width: 5, height: 3, centerX, centerY }
}

describe("createStateTransitionRoutePlans", () => {
  test("classifies horizontal transition behavior before painting", () => {
    const diagram: StateVisibleDiagram = {
      direction: "LR",
      states: ["A", "B", "C"].map((id) => ({ id, label: id, kind: "state" })),
      transitions: [
        { from: "A", to: "B", label: "forward" },
        { from: "B", to: "C", label: "branch" },
        { from: "C", to: "A", label: "reset" },
        { from: "B", to: "B", label: "retry" },
      ],
      composites: [],
      notes: [],
    }
    const placements = new Map([
      ["A", bounds("A", 4, 4)],
      ["B", bounds("B", 14, 4)],
      ["C", bounds("C", 24, 10)],
    ])

    const plans = createStateTransitionRoutePlans(diagram, placements, 18)

    expect(plans.map((plan) => [plan.transition.label, plan.kind])).toEqual([
      ["forward", "horizontal-forward"],
      ["branch", "vertical-elbow"],
      ["reset", "bottom-feedback"],
      ["retry", "self"],
    ])
    expect(plans.find((plan) => plan.kind === "bottom-feedback")).toMatchObject({ railY: 18 })
  })

  test("retains visible-model source transitions for active composite paths", () => {
    const visible = prepareVisibleStateDiagram(
      parseMermaidStateDiagram(`stateDiagram-v2
  [*] --> Authenticated: login
  state Authenticated {
    [*] --> Idle
  }`),
    )
    const placements = new Map([
      ["__start", bounds("__start", 4, 4)],
      ["Idle", bounds("Idle", 14, 4)],
    ])
    const entry = createStateTransitionRoutePlans(visible, placements, 12).find(
      (plan) => plan.transition.from === "__start",
    )

    expect(entry?.transition.sourceTransitions).toHaveLength(2)
    expect(activeTransitionIndex(entry!.transition, entry!.transition.sourceTransitions!)).toBe(0)
  })
})
