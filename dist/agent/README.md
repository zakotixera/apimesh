# Agent bundle

Start with the [summary](summary.md) or [compact JSON index](index.json). Index format **2** lists endpoint identities, observed origins, outcome summaries and file references. Full request definitions, response shapes and example references live in `endpoints/<api-id>.json`.

Load an index entry's `detailFile` only when needed. Every file reference in JSON is relative to the repository root (`pathBase: repository-root`), including `definitionFile`, `docsFile`, `notesFile` and each example's `file`. Canonical request/response bodies remain in `apis/` and are directly reachable through those paths. Distributing `dist/agent` alone does not include the canonical evidence.

Migration from format 1: request definitions and full variants moved from index entries into endpoint detail files. Unknown auth, types and requiredness remain omitted; a parameter's `default` is an observed value, not a server default.

The `schema/` copies describe canonical source formats, not the index. Regenerate with `apic render --agent`.
