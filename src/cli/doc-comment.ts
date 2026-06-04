export function formatTypeScriptDocComment(diagram: string): string {
  return ["/**", formatTypeScriptDocCommentBody(diagram), " */"].join("\n")
}

export function formatTypeScriptDocCommentBody(diagram: string, indentation = " ", newline = "\n"): string {
  const prefix = `${indentation}*`
  return diagram
    .split("\n")
    .map((line) => (line === "" ? prefix : `${prefix} ${line}`))
    .join(newline)
}
