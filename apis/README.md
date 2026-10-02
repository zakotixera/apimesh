# Canonical API corpus

The authoritative endpoint definitions and masked recordings used to generate consumer outputs.

Each endpoint directory contains `definition.json`, `examples/`, and optional `notes.md`. Skills own canonical edits; the CLI reads this corpus for validation, rendering, drift detection, and replay testing.

Definitions include `endpoint.url` (origin and path) and request `headers`, `query`, `body` sections. Parameter descriptions are optional and contain only supported meanings. Examples retain request `headers`, `query`, `body` and response `headers`, `body`; absent bodies omit `bodyMeta`. Cookies remain solely in masked Cookie/Set-Cookie headers, including repeated header values. There is no separate `cookies` field.

Directories group static endpoint paths by their actual host:

```text
apis/
  api.example.invalid/
    catalog/items/
      definition.json
      examples/200.code0.ok.json
      notes.md
  auth.example.invalid/
    catalog/items/
      definition.json
      examples/200.code0.ok.json
```

For `https://api.example.invalid/catalog/items`, use `apis/api.example.invalid/catalog/items/` and set `endpoint.url` to that URL. Host categories come from the URL, not the labels in `collection.bases`. Preserve globally unique API identifiers across hosts. Each host/path directory supports one method and origin; different methods or HTTP/HTTPS origins sharing the same host/path still require a modeling decision. The `/` endpoint lives directly in its host directory.

Host directory names use `encodeURIComponent(new URL(endpoint.url).host)`, keeping DNS names readable and escaping ports and IPv6 brackets/colons (for example, `localhost%3A8080` and `%5B%3A%3A1%5D%3A8080`). Escape a trailing dot as `%2E`; for Windows device names such as `con`, percent-encode the first character (`%63on`). The CLI's `endpointDirectory` helper implements this convention. Endpoint path segments retain their existing static spelling and must be representable as directories.

Example filenames include HTTP status, business code, and variant slug, such as `200.code0.ok.json`.

To migrate a path-only collection, add `endpoint.url` from its recordings, move each entire endpoint directory under its host, and preserve API IDs, example filenames, and variant references. Split mixed-host definitions using their recorded origins before moving them. Update any handwritten path links, then run `validate`, `render --all`, and `test`. Legacy path-only directories produce `legacy-api-directory` warnings (`--strict` fails on warnings); incorrect host directories are errors. Rendering uses the new artifact layout while keeping canonical links pointed at their actual source files.

Examples support `request.httpMeta.httpVersion`, `response.httpMeta.httpVersion`, and `response.httpMeta.entryTime`. HTTP versions retain the captured labels (for example, `HTTP/1.1` or `h2`); `entryTime` is the HAR entry's total elapsed time in milliseconds. Extraction fills these automatically when available. Unknown values are omitted, and legacy examples may omit `httpMeta` entirely. Body representation remains in `bodyMeta`.

See the [schemas](../schema/) for accepted formats and the [classification instructions](../workflow/skills/classify/SKILL.md) for naming rules, or [generated documentation](../dist/docs/README.md) to browse the APIs.
