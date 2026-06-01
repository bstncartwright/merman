import { describe, expect, test } from "bun:test"
import { GALLERY_CASES } from "../../examples/src/gallery-cases.js"
import { render } from "../index.js"

describe("rendering gallery", () => {
  for (const entry of GALLERY_CASES) {
    test(entry.title, () => {
      expect(render(entry.content, { color: false })).toMatchSnapshot()
    })
  }
})
