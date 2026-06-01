import { render } from "@kitlangton/merman"
import { GALLERY_CASES } from "./gallery-cases.js"

for (const entry of GALLERY_CASES) {
  process.stdout.write(`\n=== ${entry.title} ===\n\n`)
  process.stdout.write(`${render(entry.content, { color: false })}\n`)
}
