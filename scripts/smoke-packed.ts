import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

async function run(command: string[], cwd: string, stdin?: string): Promise<string> {
  const process = Bun.spawn(command, {
    cwd,
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (exitCode !== 0) throw new Error(`Command failed: ${command.join(" ")}\n${stderr}`)
  return stdout
}

const root = process.cwd()
const consumer = await mkdtemp(join(tmpdir(), "merman-consumer-"))

try {
  const packOutput = await run(["bun", "pm", "pack", "--destination", consumer], root)
  const tarball = packOutput
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.endsWith(".tgz"))
  if (!tarball) throw new Error("bun pack did not return a tarball path")

  await Bun.write(join(consumer, "package.json"), JSON.stringify({ private: true, type: "module" }))
  await run(["npm", "install", "--ignore-scripts", "--no-audit", "--no-fund", tarball, "@opentui/core@0.2.2"], consumer)

  const library = await run(
    [
      "bun",
      "--eval",
      'import { MermaidSyntaxError, parse, render } from "@kitlangton/merman"; const parsed = parse("flowchart LR\\n  A --> B\\n  classDef bad fill:red"); if (parsed.kind !== "flowchart" || parsed.diagram.nodes.length !== 2) throw new Error("parse smoke failed"); let syntaxRejected = false; try { parse("flowchart LR\\n  A --- B") } catch (error) { syntaxRejected = true; if (!(error instanceof MermaidSyntaxError) || error.lineNumber !== 2) throw new Error("diagnostic smoke failed") } if (!syntaxRejected) throw new Error("diagnostic was not thrown"); console.log(render("flowchart LR\\n  A --> B", { color: false }))',
    ],
    consumer,
  )
  if (!library.includes("A") || !library.includes("B")) throw new Error("plain rendering smoke failed")

  const cli = await run(["bun", "node_modules/.bin/merman", "--no-color"], consumer, "flowchart LR\n  A --> B")
  if (!cli.includes("A") || !cli.includes("B")) throw new Error("CLI smoke failed")

  await Bun.write(
    join(consumer, "opentui-smoke.ts"),
    `import { Flowchart, Sequence, State } from "@kitlangton/merman"
import plugin from "@kitlangton/merman/tui"
import { createTestRenderer } from "@opentui/core/testing"

async function assertRenderable(Renderable, initialContent, nextContent, expected, update) {
  const testRenderer = await createTestRenderer({ width: 100, height: 30 })
  try {
    const diagram = new Renderable(testRenderer.renderer, { id: "diagram", content: initialContent })
    testRenderer.renderer.root.add(diagram)
    await testRenderer.renderOnce()
    diagram.batchUpdate(() => {
      diagram.content = nextContent
      update(diagram)
    })
    await testRenderer.renderOnce()
    if (!testRenderer.captureCharFrame().includes(expected)) throw new Error(expected + " renderable smoke failed")
  } finally {
    testRenderer.renderer.destroy()
  }
}

await assertRenderable(Flowchart.Renderable, "flowchart LR\\n  A --> B", "flowchart LR\\n  X --> Y", "Y", (diagram) => {
  diagram.nodeColor = "#38bdf8"
  diagram.pulseFrame = 2
})
await assertRenderable(State.Renderable, "stateDiagram-v2\\n  A --> B", "stateDiagram-v2\\n  Ready --> Done", "Done", (diagram) => {
  diagram.stateColor = "#38bdf8"
  diagram.pulseFrame = 2
})
await assertRenderable(Sequence.Renderable, "sequenceDiagram\\n  Browser->>Server: request", "sequenceDiagram\\n  Browser->>Server: refreshed", "refreshed", (diagram) => {
  diagram.requestColor = "#38bdf8"
  diagram.pulseFrame = 2
})

const testRenderer = await createTestRenderer({ width: 40, height: 8 })
let registered = false
try {
  await plugin.tui({
    renderer: testRenderer.renderer,
    markdown: {
      registerCodeBlockRenderer(language, render) {
        if (language !== "mermaid" || typeof render !== "function") throw new Error("TUI renderer registration failed")
        registered = true
        return () => {}
      },
    },
  })
  if (!registered) throw new Error("TUI plugin smoke failed")
} finally {
  testRenderer.renderer.destroy()
}
`,
  )
  await run(["bun", "opentui-smoke.ts"], consumer)
} finally {
  await rm(consumer, { recursive: true, force: true })
}
