# Workflow skill shared contracts

Read this file before applying a workflow skill. It defines shared responsibilities and data handling rules. Field definitions are maintained in the repository schemas and classification instructions.

## Paths and sources of truth

- Repository paths in instructions (`apis/`, `schema/`, `.raw/`, `.reports/`, `sources/`, `dist/`, `collection.json`, `glossary.json`) are relative to the root containing both `collection.json` and `workflow/`.
- Markdown links are relative to the file containing the link. The skills operate in a populated collection repository with its schemas, CLI, and related skills available.
- Follow the ownership rules below. Read the [classification instructions](../classify/SKILL.md) for semantic rules, the relevant [schemas](../../../schema/) for accepted fields, and [CLI documentation](../../cli/README.md) for commands and implementation limits. Load only the sections needed for the task.
- If documentation, examples, schemas, or implementation disagree, report the discrepancy and its effect. Preserve capture evidence and validation requirements; format changes require corresponding schema and consumer updates within the task scope.

## Ownership

| Resource | Writer | Rule |
|---|---|---|
| `sources/*.har` | Recording provider | Preserve source captures and read them as input |
| `.raw/` drafts and manifest | CLI extract | Skills consume them; choose a fresh output directory on ownership conflicts |
| `apis/**/definition.json`, `examples/*.json` | classify / drift | Edit only evidence-backed, in-scope canonical data |
| `apis/**/notes.md` | notes | Explain behavior supported by definitions and recordings |
| `glossary.json` | classify / drift | Shared semantic vocabulary; numeric hints are not assertions |
| `collection.json` | Relevant semantic maintenance | Drift may update version/changelog for confirmed breaking changes; other metadata changes need task scope |
| Repository-root `dist/**` | CLI | Update inputs or renderers, then regenerate consumer artifacts |
| Repository-root `.reports/**` | CLI | Disposable, gitignored diagnostics; regenerate rather than repair manually |

Pipeline coordinates these responsibilities and uses classify or drift for canonical edits. Related skills can be followed within the same session. Preserve unrelated work already present in the checkout.

## Evidence and compatibility

- Use sanitized extraction drafts and canonical examples for semantic work. Preserve placeholders and redaction markers. Keep original credentials and other unmasked sensitive values out of canonical data and reports.
- The canonical example schema currently rejects extraction's optional `bodyMeta`. Retain affected drafts and report the compatibility issue. Preserve metadata and stored JSON text; removing metadata, replacing text with parsed objects, or moving metadata to an ignored `x-` field would lose information needed by consumers.
- Examples in these instructions are synthetic. Derive endpoint paths, authentication names, business codes, and meanings from the current collection and its recordings.
- Keep API identity, semantic slugs, and existing recordings stable. Do not infer authentication requirements, parameter requiredness, or guaranteed behavior from one observation.
- The example filename is exactly `<http>.<codeN|http-only>.<variant>.json`; variant is a glossary slug. Each tuple has one filename under the current model. Preserve both inputs when distinct recordings collide; storing both requires an explicit change to the model rather than a filename suffix or overwrite.
- Consumers need explicit support for data stored in `x-` extension fields.

## Serialization and validation

Use UTF-8 without BOM, LF, two-space JSON indentation, and a final newline. Use the data model's semantic field order; sort maps by key. Preserve semantic array order, keep observation arrays unique, and order example references by capture time. Variant `examples` is its last standard field.

From `workflow/cli`, use the built local CLI through `npm run apic -- <command>`. Dependencies and build instructions are in the CLI documentation. Explicit input and output paths resolve from the current working directory; default artifact paths resolve from the repository root.

Resolve validation errors before reporting the affected operation complete. Report warnings; they block validation only in strict mode. Track import coverage separately from data validity. Local replay verifies recordings and generated assertions; live service behavior is outside its scope.

## Handoff

Report task scope, files changed, supporting evidence, verification performed, warnings, and unresolved observations with their locations and next action. Mark partial completion explicitly. Use the response, PR description, or another user-requested destination for the handoff; `dist/` and `.reports/` remain reserved for CLI output.
