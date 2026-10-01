# Canonical data definitions

Schemas describe application-neutral data shapes and representation invariants. They contain no application hosts, endpoint names, business meanings, sample recordings, or exporter configuration. Starter templates begin with empty origins and vocabulary; fixtures supply their own test data.

| Layer | Defines | Does not establish |
|---|---|---|
| JSON Schema | Accepted fields, types, identifiers, and body/metadata combinations | Cross-file agreement, replay capability, or semantic truth |
| Canonical validation | References, unique variant slugs, registered vocabulary, endpoint identity, redundant observations, and declared body types | Whether every source observation was imported |
| Capture fidelity | Exported method, URL, payload representation, and saved response agree with sanitized extraction evidence | Original unmasked wire bytes or a complete HTTP-header comparison |
| Replay | Generated requests match local canonical recordings and execute assertions | Fidelity to extraction evidence when both exporter and server share the same mistake |
| Semantic classification | Evidence-backed meaning and variant membership | Meaning inferred solely from HTTP status, business code, or a passing test |

`Definition` describes one method/path and its semantic response variants. `Example` preserves one sanitized observation. A variant slug identifies meaning; a recording suffix identifies an observation and must not change that meaning. HTTP and numeric business-code arrays summarize observations; they do not assert every Cartesian combination. Recorded pairs provide the comparison evidence.

`code` is the integer projection of a numeric response `code` or `errno`, otherwise `null`; other application status fields remain in the body. `null` here means no supported numeric business code, not success. Glossary entries are application-owned vocabulary, and may be absent during initialization. Every used variant still needs a registered glossary term.

Omitted `auth`, parameter `type`, and parameter `required` mean unknown. Explicit `auth: none` and `required: false` are assertions that need evidence. A parameter's `default` stores an observed value, not a guaranteed server default. Renderers must preserve these distinctions. Renderers omit unknown auth; parameter tables use a dash only when a known-data column has missing entries.

`BodyNode` describes observed types, object properties, and array item shapes. `schema: null` means no trustworthy shape is known; it does not mean the response body is JSON null. `{ "type": "null" }` describes a known null value. This type tree does not establish field requiredness. `properties` applies only when the node includes type `object`; `items` applies only when it includes type `array`. Omitted child shapes are unknown, and `items: null` records an unknown item shape.

Validation checks declared types recursively against each referenced example, parsing captured JSON text for analysis without changing storage. Additional object fields and absent fields are allowed; neither a closed-object contract nor requiredness is inferred. Missing and binary captures are not checked as JSON/text shapes. Structurally invalid documents are reported before semantic checks; other files are still checked and a validation report is written.

Human-readable templates label parameter `default` as **observed value**, omit unknown-only columns, and show compact response field/type tables. Agent endpoint detail files preserve request definitions and response shapes without filling in unknown declarations. Agent index format 2 is a compact manifest that links those files; all JSON file references are repository-relative. Starter files contain only collection metadata and empty vocabulary; endpoint definitions must come from evidence.

| Body representation | Stored body | Meaning |
|---|---|---|
| `text` / source `text` | String | Captured text, including JSON text; retain numeric literals and whitespace |
| `json` / source `text` | JSON value | Explicitly parsed JSON, including JSON null |
| `params` / source `params` | Ordered request parameter array | Preserve repeated names and any uncaptured file descriptors |
| `base64` / source `text` | Base64 string | Binary capture representation, independent of transport compression |
| `text` / source `missing` | `null` | Body was not captured; never invent it |
| Metadata absent | Legacy JSON value | Legacy interpretation; absence does not prove safe removal of metadata from a newer capture |

Schema-valid missing bodies and binary requests may be unsupported by the current replay exporter. Consumer limitations belong in tooling and diagnostics, not in application-specific schema exceptions. HAR bodies are already decoded; compression/header adaptation belongs in exports and replay, while canonical evidence is preserved.

See the [ablation results and procedure](../workflow/cli/test/ABLATIONS.md) for evidence behind these boundaries.

### Capture field alignment

Captures include request `headers`, `query`, `body` and response `headers`, `body`. Empty headers use `{}`, query pairs use `[]`, and absent bodies use `null`. Cookies stay exclusively in masked Cookie/Set-Cookie headers; repeated headers use string arrays so values and attributes survive without a second cookie representation. Query pairs preserve order, duplicate names and empty values. Omit `bodyMeta` when no body exists; preserve it for captured text (including empty text) and explicit missing-capture evidence.

Definitions include `endpoint.url` (absolute origin and pathname, no query/fragment), validated against each example. Request header summaries retain observations common to all recordings. Include empty request `headers`, `query` and `body` sections as `{}`. Parameter `desc` is optional: use it only for a supported meaning, never for requiredness, unknown-data disclaimers or a repetition of the parameter name.

Generated docs contain endpoint identity, parameter observations, response field/type tables and recording links. Omit unknown-only columns, empty sections and repeated capture boilerplate. Raw request recipes and header dumps stay out of docs; complete captures remain in canonical files and executable requests in Postman. Agent details carry parameter definitions and response shapes, with canonical links for capture headers.
