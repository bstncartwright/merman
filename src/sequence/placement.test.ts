import { describe, expect, test } from "bun:test"
import { diagramTextWidth } from "../core/text.js"
import { parseMermaidSequenceDiagram } from "./parser.js"
import { createSequencePlacementPlan } from "./placement.js"

describe("createSequencePlacementPlan", () => {
  test("expands one fragment frame for a longer else label", () => {
    const plan = createSequencePlacementPlan(
      parseMermaidSequenceDiagram(`sequenceDiagram
  A->>B: start
  alt ok
    A->>B: yes
  else validation failed with a substantially longer explanation
    B-->>A: no
  end`),
    )
    const fragments = plan.steps.filter((step) => step.type === "fragment")

    expect(fragments).toHaveLength(3)
    expect(fragments.map((fragment) => fragment.bounds.rightX)).toEqual([
      fragments[0]!.bounds.rightX,
      fragments[0]!.bounds.rightX,
      fragments[0]!.bounds.rightX,
    ])
    expect(fragments[1]!.labelText).toContain("validation failed")
  })

  test("includes non-adjacent message and note labels within planned width", () => {
    const plan = createSequencePlacementPlan(
      parseMermaidSequenceDiagram(`sequenceDiagram
  participant A
  participant B
  participant C
  A->>C: this message needs room past the final participant
  Note over A,C: this note also needs full horizontal room`),
    )
    const message = plan.steps.find((step) => step.type === "message")!
    const note = plan.steps.find((step) => step.type === "note")!

    const messageWidth = Math.max(...message.labelLines.map(diagramTextWidth))
    expect(message.labelX + messageWidth).toBeLessThanOrEqual(plan.width)
    expect(note.textX + diagramTextWidth(note.text)).toBeLessThanOrEqual(plan.width)
  })

  test("allocates group space around a contained self-message loop", () => {
    const plan = createSequencePlacementPlan(
      parseMermaidSequenceDiagram(`sequenceDiagram
  box Backend
    participant Service
    Service->>Service: Check Permissions
  end`),
    )
    const group = plan.groups[0]!
    const message = plan.steps.find((step) => step.type === "selfMessage")!

    expect(group.leftX).toBeGreaterThanOrEqual(0)
    expect(group.rightX).toBeGreaterThanOrEqual(message.rightX + 2)
    expect(plan.width).toBeGreaterThan(group.rightX)
  })
})
