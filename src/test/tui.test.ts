import { expect, test } from "bun:test"
import { createTestRenderer } from "@opentui/core/testing"
import plugin from "../tui.js"

test("provides an OpenCode TUI plugin that registers Mermaid fences", async () => {
  const { renderer } = await createTestRenderer({ width: 40, height: 8 })
  let called = false
  const api = {
    renderer,
    markdown: {
      registerCodeBlockRenderer(language: string, render: unknown) {
        expect(language).toBe("mermaid")
        expect(typeof render).toBe("function")
        called = true
        return () => {}
      },
    },
  }

  await plugin.tui(api)
  expect(called).toBe(true)
  renderer.destroy()
})
