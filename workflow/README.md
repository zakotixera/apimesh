# Workflow

The execution layer for turning recorded HAR traffic into the canonical corpus and generated outputs.

- [cli/](cli/README.md) owns application initialization, deterministic extraction, validation, rendering, drift detection, replay testing, and shared verification.
- [skills/](skills/README.md) owns semantic classification, notes, drift decisions, and pipeline orchestration.
- [templates/](templates/README.md) supplies schema-checked metadata starters and application setup files for `apic init`.

At runtime, skills write canonical data; the CLI writes extraction drafts and generated outputs. Applications run the pinned CLI against their own collection root. [Toolchain CI](../.github/workflows/ci.yml) verifies synthetic collections and vendor isolation; application CI validates and replays application data. See [architecture](../ARCHITECTURE.md) for the ownership boundary.

See the [pipeline instructions](skills/pipeline/SKILL.md) for stages, handoffs, and failure handling.
