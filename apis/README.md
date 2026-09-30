# Canonical API corpus

The authoritative endpoint definitions and masked recordings used to generate consumer outputs.

Each endpoint directory contains `definition.json`, `examples/`, and optional `notes.md`. Skills own canonical edits; the CLI reads this corpus for validation, rendering, drift detection, and replay testing.

Directories follow static endpoint paths. Example filenames include HTTP status, business code, and variant slug, such as `200.code0.ok.json`.

See the [schemas](../schema/) for accepted formats and the [classification instructions](../workflow/skills/classify/SKILL.md) for naming rules, or [generated documentation](../dist/docs/README.md) to browse the APIs.
