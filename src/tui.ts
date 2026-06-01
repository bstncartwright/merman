import type { MarkdownOptions, RenderContext } from "@opentui/core"
import { createMermaidMarkdownRenderer } from "./index.js"

interface OpenCodeTuiApi {
  renderer: RenderContext
  markdown: {
    registerCodeBlockRenderer: (language: string, render: NonNullable<MarkdownOptions["renderNode"]>) => () => void
  }
}

const plugin = {
  id: "kitlangton.merman",
  async tui(api: OpenCodeTuiApi): Promise<void> {
    api.markdown.registerCodeBlockRenderer("mermaid", createMermaidMarkdownRenderer(api.renderer))
  },
}

export default plugin
