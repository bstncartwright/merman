import { describe, expect, test } from "bun:test"

async function runCli(args: string[], stdin?: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const process = Bun.spawn(["bun", "src/cli/main.ts", ...args], {
    stdin: stdin === undefined ? "ignore" : new Blob([stdin]),
    stdout: "pipe",
    stderr: "pipe",
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  return { stdout, stderr, exitCode }
}

describe("merman CLI", () => {
  test("renders plain flowcharts from stdin", async () => {
    const result = await runCli(["--no-color"], "flowchart LR\n  A[Start] --> B[Done]")

    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe("")
    expect(result.stdout).toContain("Start")
    expect(result.stdout).toContain("Done")
    expect(result.stdout).not.toContain("\u001b[")
  })

  test("honors explicit kind for positional state input", async () => {
    const result = await runCli(["--no-color", "--kind", "state", "A --> B"])

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain(" A ")
    expect(result.stdout).toContain(" B ")
  })

  test("reports unsupported source without rendering output", async () => {
    const result = await runCli(["--no-color", "not a diagram"])

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("Could not detect diagram kind")
  })

  test("reports unsupported syntax with its input line", async () => {
    const result = await runCli([], "flowchart LR\n  A --> B\n  A --- B")

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain('Unsupported syntax in flowchart diagram at line 3: "A --- B"')
  })
})
