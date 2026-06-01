# @kitlangton/merman

## 0.1.2

### Patch Changes

- 33a9c0d: Report unsupported structural Mermaid statements and malformed blocks with diagram kind, source line number, and offending input, explicitly ignore Flowchart presentation directives that do not apply to terminal themes, and document the supported syntax subset.
- 4f57a0b: Fix terminal-width rendering for wide and combined Unicode labels, correct reverse-direction and multiline state transition layout, size sequence fragment frames for their widest branch label, and normalize invalid sequence participant spacing. Improve live OpenTUI rendering by caching parsed diagrams and semantic grids for style-only updates, normalizing mutable state spacing consistently, and supporting batched Sequence option updates alongside Flowchart and State. Clarify that the current OpenTUI-backed package entrypoint requires Bun and constrain the supported OpenTUI peer range to tested versions.
