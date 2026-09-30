# Workflow skill shared contracts

Read this file at the start of each workflow skill. It centralizes shared boundaries; field details remain in repository schemas and the classification instructions.

## Paths and sources of truth

- Repository paths in instructions (`apis/`, `schema/`, `.raw/`, `.reports/`, `sources/`, `dist/`, `collection.json`, `glossary.json`) are relative to the root containing both `collection.json` and `workflow/`.
- Markdown links are relative to the file containing the link. These skills depend on this repository; copying a single skill elsewhere does not copy its schemas, CLI, or sibling skills.
- Follow the ownership rules below. Read the [classification instructions](../classify/SKILL.md) for semantic rules, the relevant [schemas](../../../schema/) for accepted fields, and [CLI documentation](../../cli/README.md) for commands and implementation limits. Load only the sections needed for the task.
- If design prose, examples, schemas, or implementation disagree, identify the discrepancy and its effect. Do not silently migrate a format or weaken validation. An implementation limitation is not permission to lose capture evidence.

## Ownership

| Resource | Writer | Rule |
|---|---|---|
| `sources/*.har` | Human recording | Read as input; do not rewrite source captures |
| `.raw/` drafts and manifest | CLI extract | Skills consume them; choose a fresh output directory on ownership conflicts |
| `apis/**/definition.json`, `examples/*.json` | classify / drift | Edit only evidence-backed, in-scope canonical data |
| `apis/**/notes.md` | notes | Human explanation; cannot override JSON facts |
| `glossary.json` | classify / drift | Shared semantic vocabulary; numeric hints are not assertions |
| `collection.json` | Relevant semantic maintenance | Drift may update version/changelog for confirmed breaking changes; other metadata changes need task scope |
| Repository-root `dist/**` | CLI | Never repair generated consumer artifacts manually |
| Repository-root `.reports/**` | CLI | Disposable, gitignored diagnostics; regenerate rather than repair manually |

Pipeline invokes these responsibilities; it is not a second canonical writer. Following a sibling skill does not require spawning an agent. Preserve unrelated work already present in the checkout.

## Evidence and compatibility

- Read sanitized extraction drafts and canonical examples for semantic work. Preserve placeholders and redaction markers; never reconstruct credentials or quote raw secrets in reports.
- Extraction's optional `bodyMeta` is currently not accepted by the canonical example schema. Retain affected drafts and report the integration blocker. Do not remove metadata, parse-and-replace stored JSON text, or hide metadata behind an ignored `x-` key to force a passing import.
- Keep API identity, semantic slugs, and existing recordings stable. Do not infer authentication requirements, parameter requiredness, or guaranteed behavior from one observation.
- The example filename is exactly `<http>.<codeN|http-only>.<variant>.json`; variant is a glossary slug. One tuple has one filename under the current model. Different recordings colliding on that name require an explicit modeling decision, not an invented suffix or overwrite.
- `x-` fields are an extension mechanism, not an alternate storage format consumers automatically understand.

## Serialization and gates

Use UTF-8 without BOM, LF, two-space JSON indentation, and a final newline. Use the data model's semantic field order; sort maps by key. Preserve semantic array order, keep observation arrays unique, and order example references by capture time. Variant `examples` is its last standard field.

From `workflow/cli`, use the built local CLI through `npm run apic -- <command>`. Dependencies and build instructions are in the CLI documentation. Explicit input and output paths resolve from the current working directory; default artifact paths resolve from the repository root.

Validation errors block completion; warnings are reported and block only when strict mode is requested. Successful validation of existing canonical does not mean every input frame was imported. Likewise, local replay verifies recordings and generated assertions, not the live service.

## Handoff

Conclude with task scope, files changed, evidence behind semantic decisions, verification actually run, warnings, and unresolved observations with their locations and next action. Mark partial work explicitly. Do not invent report files under CLI-owned `dist/` or `.reports/`; use the response or PR description unless the user requested another destination.
