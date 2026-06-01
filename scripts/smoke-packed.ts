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
} finally {
  await rm(consumer, { recursive: true, force: true })
}
