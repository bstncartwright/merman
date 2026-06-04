import { readFile, writeFile } from "node:fs/promises"
import { formatTypeScriptDocCommentBody } from "./doc-comment.js"

const DOC_COMMENT_PATTERN = /\/\*\*[\s\S]*?\*\//g
const MERMAID_FENCE_PATTERN = /^([ \t]*)\*[ \t]?```mermaid[ \t]*(\r?\n)([\s\S]*?)^\1\*[ \t]?```[ \t]*$/gm

export async function replaceTypeScriptMermaidFences(
  path: string,
  render: (source: string) => string,
): Promise<number> {
  const content = await readFile(path, "utf8")
  let count = 0
  const updated = content.replace(DOC_COMMENT_PATTERN, (comment) =>
    comment.replace(MERMAID_FENCE_PATTERN, (_, indentation: string, newline: string, body: string) => {
      const source = (body.endsWith(newline) ? body.slice(0, -newline.length) : body)
        .split(newline)
        .map((line) => {
          const prefix = `${indentation}*`
          if (!line.startsWith(prefix)) throw new Error(`Invalid Mermaid doc-comment block in ${path}.`)
          return line.slice(prefix.length).replace(/^[ \t]/, "")
        })
        .join("\n")
      count += 1
      return formatTypeScriptDocCommentBody(render(source), indentation, newline)
    }),
  )

  if (count === 0) throw new Error(`No Mermaid doc-comment fences found in ${path}.`)
  if (updated !== content) await writeFile(path, updated, "utf8")
  return count
}
