# Workflow

The execution layer for turning recorded HAR traffic into the canonical corpus and generated outputs.

- [cli/](cli/README.md) owns deterministic extraction, validation, rendering, drift detection, and replay testing.
- [skills/](skills/README.md) owns semantic classification, notes, drift decisions, and pipeline orchestration.
- [templates/](templates/README.md) supplies schema-checked collection metadata starters.

At runtime, skills write canonical data; the CLI writes extraction drafts and generated outputs. CI invokes the CLI from [the repository workflow](../.github/workflows/ci.yml).

See the [pipeline instructions](skills/pipeline/SKILL.md) for stages, handoffs, and failure handling.
