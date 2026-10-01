# Canonical API corpus

The authoritative endpoint definitions and masked recordings used to generate consumer outputs.

Each endpoint directory contains `definition.json`, `examples/`, and optional `notes.md`. Skills own canonical edits; the CLI reads this corpus for validation, rendering, drift detection, and replay testing.

Definitions include `endpoint.url` (origin and path) and request `headers`, `query`, `body` sections. Parameter descriptions are optional and contain only supported meanings. Examples retain request `headers`, `query`, `body` and response `headers`, `body`; absent bodies omit `bodyMeta`. Cookies remain solely in masked Cookie/Set-Cookie headers, including repeated header values. There is no separate `cookies` field.

Directories follow static endpoint paths. Example filenames include HTTP status, business code, and variant slug, such as `200.code0.ok.json`.

Examples support `request.httpMeta.httpVersion`, `response.httpMeta.httpVersion`, and `response.httpMeta.entryTime`. HTTP versions retain the captured labels (for example, `HTTP/1.1` or `h2`); `entryTime` is the HAR entry's total elapsed time in milliseconds. Extraction fills these automatically when available. Unknown values are omitted, and legacy examples may omit `httpMeta` entirely. Body representation remains in `bodyMeta`.

See the [schemas](../schema/) for accepted formats and the [classification instructions](../workflow/skills/classify/SKILL.md) for naming rules, or [generated documentation](../dist/docs/README.md) to browse the APIs.
