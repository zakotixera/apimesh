# apimesh

**English** | [简体中文](README.zh-CN.md)

Agent-assisted HTTP recording maintenance, canonical modeling, and reproducible output generation.

## Design goals

- One canonical source for documentation, agent references, and replay fixtures.
- Recorded requests, responses, and metadata as evidence.
- Stable semantic identities for observed success and failure outcomes.
- Agent skills for interpretation; deterministic tools for processing.
- Human involvement at recording and review.
- Reproducible outputs and reviewable changes.

## Architecture

| Component | Responsibility | Output |
|---|---|---|
| Human | Record traffic; review changes | HAR captures; review decisions |
| Agent skills | Interpret observations; maintain canonical data; orchestrate stages | Definitions, examples, notes, metadata updates |
| `apic` CLI | Extract, mask, deduplicate, validate, render, compare, replay | Drafts, reports, consumer files |
| CI | Build, test, validate, check output consistency, replay | Verification results |

### Data model

| Concept | Purpose |
|---|---|
| Canonical | Maintained JSON definitions and examples shared by all renderers |
| Collection | Identity, version, origins, placeholder declarations, change history |
| Glossary | Shared semantic names and classification hints |
| Definition | Request description and observed response variants |
| Variant | Stable semantic slug, observed status/code values, example references |
| Example | Recorded request, response, and capture metadata after masking |
| Notes | Optional explanations grounded in recorded evidence |

### Contracts

- Skills maintain canonical data; the CLI generates consumer files.
- Renderers run without agent inference.
- Identical inputs produce identical file sets and bytes.
- Variant slugs identify meaning; status/code values record observations.
- Glossary entries guide naming; definitions govern variant membership.
- Unsupported or ambiguous observations remain explicit and unresolved.

## Workflow

| Stage | Executor | Result |
|---|---|---|
| 1. Record | Human | HAR source evidence |
| 2. Extract | `apic extract` | Masked, grouped, deduplicated YAML drafts |
| 3. Classify | `classify` skill | Canonical definitions and examples |
| 4. Validate | `apic validate` | Schema, identifier, reference, and consistency checks |
| 5. Render | `apic render --all` | Documentation, agent reference, Postman collection |
| 6. Verify stability | Repeat render and compare | Unchanged file set and bytes |
| 7. Replay | `apic test` | Newman assertions against local recordings |
| 8. Review | Human and CI | Reviewed changes and automated check results |

| Skill | Role |
|---|---|
| [`pipeline`](workflow/skills/pipeline/SKILL.md) | Stage orchestration, failure recovery, review handoff |
| [`classify`](workflow/skills/classify/SKILL.md) | Semantic classification and canonical merges |
| [`notes`](workflow/skills/notes/SKILL.md) | Optional evidence-based explanations |
| [`drift`](workflow/skills/drift/SKILL.md) | Interpretation of `apic drift` reports; requested canonical updates |

### Failure handling

- Validation errors: fix the responsible layer, then repeat affected checks.
- Warnings: retain in the review handoff.
- Ambiguous or unsupported observations: preserve drafts and report the reason.
- Partial imports: report accepted and unresolved observations separately.
- Drift: assess breaking changes, compatible additions, noise, and uncertainty before applying updates.

## Development

To create an application-specific API collection, follow the [fork and development guide](DEVELOPMENT.md).

Requirements: Node.js **20+**, npm; an agent following the repository skills for semantic workflow stages.

From the repository root:

```sh
cd workflow/cli
npm ci
npm run build
npm run apic -- --help
```

CLI checks, from `workflow/cli`:

```sh
npm run typecheck
npm test
```

CI tests a complete synthetic workflow even in this unpopulated template. Collection metadata starters are in [`workflow/templates/`](workflow/templates/README.md). To check a real HAR in a temporary collection, run `npm run test:har -- "../../sources/capture.har"`; this checks processing and replay without importing or semantically classifying the recordings.

### Contribution checks

| Change | Required follow-through |
|---|---|
| Canonical data | Validate, render, verify render stability, replay, review |
| CLI | Build, run relevant tests, repeat affected downstream checks |
| Data format | Update schemas, validator, affected skills, and consumers together |
| Generated behavior | Change the source or renderer, then regenerate |
| Project documentation | Keep English and Chinese READMEs aligned |

Verification scope: structural consistency, reproducibility, committed-output synchronization, and recorded-behavior replay. Live availability and unobserved behavior are outside replay coverage.

For interactive Postman replay, run `npm run apic -- serve` from `workflow/cli` and select the generated local replay environment. Each request preserves its recorded host for live use. The [artifact guide](dist/README.md) links consumer documentation.

## Project structure

| Path | Role |
|---|---|
| `workflow/skills/` | Semantic work and orchestration instructions |
| `workflow/cli/` | TypeScript executor, renderers, replay server, tests |
| `workflow/templates/` | Schema-checked collection metadata starters |
| `schema/` | Canonical JSON Schemas |
| `collection.json`, `glossary.json` | Shared metadata and vocabulary |
| `sources/` | HAR source recordings |
| `apis/<host>/<path>/` | Canonical definitions, examples, notes grouped by host |
| `.raw/`, `.reports/` | Temporary drafts and diagnostics |
| `dist/` | Consumer bundles with host-grouped endpoint files |
| `workflow/cli/dist/` | Compiled CLI code |
| `.github/workflows/` | CI configuration |

## Documentation

- Workflow: [execution layer](workflow/README.md), [skills](workflow/skills/README.md).
- Tooling: [CLI usage and limitations](workflow/cli/README.md), [CI](.github/workflows/ci.yml).

## License

[Apache License 2.0](LICENSE).
