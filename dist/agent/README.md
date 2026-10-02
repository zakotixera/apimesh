# Agent bundle

[Summary](summary.md) · [JSON index](index.json)

Index format **2** links endpoint details containing parameters, response shapes and recording references. Follow `definitionFile` for capture headers and each example's `file` for complete requests and responses.

Each index entry includes `host`. Details live at `endpoints/<host>/<path>/index.json`, matching the human documentation hierarchy; follow `detailFile` and `docsFile` for exact paths.

JSON paths are relative to the repository root (`pathBase: repository-root`). Parameter `default` values are observations. The `schema/` copies describe canonical source formats.

Regenerate with `apic render --agent`.
