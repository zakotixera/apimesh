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
- The canonical example schema accepts optional `bodyMeta` and checks its representation against the stored body. Preserve metadata and JSON text, including numeric literals. Missing bodies and uncaptured multipart files remain explicit; schema validity does not make them replayable. Retain such drafts as unresolved when the requested workflow requires replay.
- Preserve `request.httpMeta` and `response.httpMeta` when copying extracted frames into examples. Each side's `httpVersion` is its captured HAR label; response `entryTime` is the HAR entry's elapsed `time` in milliseconds, not a timestamp. Missing values remain omitted; never infer them from headers, `captured`, or the replay server. Timing-only differences do not require another recording; retain the earliest capture's metadata.
- Examples in these instructions are synthetic. Derive endpoint paths, authentication names, business codes, and meanings from the current collection and its recordings.
- Keep API identity, semantic slugs, and existing recordings stable. Do not infer authentication requirements, parameter requiredness, or guaranteed behavior from one observation.
- Example filenames are `<http>.<codeN|http-only>.<variant>[.<recording-id>].json`; variant is a glossary slug. The optional recording ID is a lowercase alphanumeric/hyphen slug (for example, a digest of the sanitized frame). Keep existing filenames stable. Reuse an identical recording; give distinct recordings stable suffixes without overwriting or renumbering existing files. Every filename must be referenced by exactly one variant.
- Consumers need explicit support for data stored in `x-` extension fields.

## Serialization and validation

Use UTF-8 without BOM, LF, two-space JSON indentation, and a final newline. Use the data model's semantic field order; sort maps by key. Preserve semantic array order, keep observation arrays unique, and order example references by capture time. Variant `examples` is its last standard field.

From `workflow/cli`, use the built local CLI through `npm run apic -- <command>`. Dependencies and build instructions are in the CLI documentation. Explicit input and output paths resolve from the current working directory; default artifact paths resolve from the repository root.

Resolve validation errors before reporting the affected operation complete. Report warnings; they block validation only in strict mode. Track import coverage separately from data validity. Local replay verifies recordings and generated assertions; live service behavior is outside its scope.

Each definition has unique variant slugs. Declared response types must accommodate every referenced, analyzable recording; merge observed type differences into unions without asserting field requiredness. BodyNode `properties` requires an object type and `items` requires an array type. Additional and absent fields remain allowed. Validation reports malformed documents before attempting cross-file checks on their contents.

## Handoff

Report task scope, files changed, supporting evidence, verification performed, warnings, and unresolved observations with their locations and next action. Mark partial completion explicitly. Use the response, PR description, or another user-requested destination for the handoff; `dist/` and `.reports/` remain reserved for CLI output.

### Capture field alignment

Captures include request `headers`, `query`, `body` and response `headers`, `body`. Empty headers use `{}`, query pairs use `[]`, and absent bodies use `null`. Cookies stay exclusively in masked Cookie/Set-Cookie headers; repeated headers use string arrays so values and attributes survive without a second cookie representation. Query pairs preserve order, duplicate names and empty values. Omit `bodyMeta` when no body exists; preserve it for captured text (including empty text) and explicit missing-capture evidence.

Definitions include `endpoint.url` (absolute origin and pathname, no query/fragment), validated against each example. Request header summaries retain observations common to all recordings. Include empty request `headers`, `query` and `body` sections as `{}`. Parameter `desc` is optional: use it only for a supported meaning, never for requiredness, unknown-data disclaimers or a repetition of the parameter name.

Generated docs contain endpoint identity, parameter observations, response field/type tables and recording links. Omit unknown-only columns, empty sections and repeated capture boilerplate. Raw request recipes and header dumps stay out of docs; complete captures remain in canonical files and executable requests in Postman. Agent details carry parameter definitions and response shapes, with canonical links for capture headers.
