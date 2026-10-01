# apic CLI

Reads repository data and schemas; writes extraction drafts and generated artifacts. Semantic decisions and canonical edits belong to [skills](../skills/README.md).

- [src/](src/) contains commands, shared processing, renderers, and the replay server.
- [test/](test/) contains regression tests and synthetic fixtures.

## Usage

Requires Node.js 20 or newer. From the repository root:

```sh
cd workflow/cli
npm ci
npm run build
npm run apic -- --help
```

Run commands with `npm run apic -- <command>` from this directory. Optional `npm link` exposes `apic` from any directory inside the repository.

| Command | Responsibility |
|---|---|
| `extract <har...>` | Mask and group HAR captures into `.raw/` drafts |
| `validate` | Check canonical schemas and cross-references |
| `render` | Generate docs, agent, and Postman artifacts; defaults to all |
| `drift <har...>` | Compare captures with canonical definitions; write an advisory report |
| `test` | Check generated Postman requests against local recordings |
| `serve [--port <port>]` | Keep a local replay server running for interactive Postman use (default: 4010) |

Use `<command> --help` for options. Input paths and explicit `--out` paths resolve from the current directory; default outputs resolve from the repository root. A capture path from here is `../../sources/capture.har`.

## Output boundaries

Extraction uses `.apic-extract.json` to track filenames and hashes. It updates unchanged managed files, removes obsolete managed files, and preserves unrelated files. Modified or unowned output collisions are rejected; use a new `--out` directory for older drafts without a manifest. Symlink and junction output paths are rejected. Writes are not transactional.

Rendering replaces generated output groups while preserving their READMEs. Local `dist/` contains compiled JavaScript; repository-root `dist/` contains committed consumer artifacts. Extraction, validation, and drift diagnostics go to repository-root `.reports/`, which is gitignored and disposable. `apic render` does not generate reports.

Postman exports use `dist/postman/endpoints.postman_collection.json` and `replay.postman_environment.json`. Each recorded origin gets its own collection variable, using the matching `collection.bases` label when available. Hosts are taken from recordings, including hosts absent from collection metadata. The local replay environment sets `apicReplay=true` and `baseUrl=http://127.0.0.1:4010`; request scripts override their origin variable and select the exact recording only in replay mode. Request placeholder entries are listed but disabled so replay preserves their literal masked values.

For interactive use, run `npm run apic -- serve`, import both artifacts, and select the local replay environment. The loopback server stays available until Ctrl+C. Use `serve --port 4011` and update the environment's `baseUrl` if needed; `--port 0` prints an available port. `apic test` continues to own a temporary server for automated checks. For live use, create a separate environment with `apicReplay` absent or false, supply your own placeholder values, and override individual origin variables as needed. Generated `dist/docs/usage.md` documents the collection's request placeholders.

Human documentation links canonical examples and shows parameter and response field tables. Only long parameter values and response fields are expandable; raw request recipes and capture header dumps are omitted. Agent index format **2** is a compact discovery manifest; load the `detailFile` for request definitions, full response variants, and example paths. JSON file references use the repository root as their base (`pathBase: repository-root`). This replaces the previous inline request/schema layout; consumers must follow `detailFile`. The copied schemas describe canonical formats, not the generated index.

After upgrading from older exports, run `render --postman` before `test` and update imports or automation to the filenames above.

Body handling preserves captured text and JSON numeric literals during masking. Opaque binary and arbitrary text/XML are not guaranteed to be sanitized. The canonical [example schema](../../schema/example.schema.json) accepts optional `bodyMeta` for text, parsed JSON, request parameters, binary responses, and missing captures; it rejects inconsistent body/metadata combinations. Missing bodies, binary requests, and uncaptured file uploads cannot complete replay. Recorded URL queries may retain masking placeholders. HTTP/2 pseudo-headers are omitted from Postman requests; replay and saved responses omit original compression and length headers because HAR bodies are already decoded.

Extraction also adds `request.httpMeta` and `response.httpMeta`: `httpVersion` preserves each side's HAR protocol label, and response `entryTime` copies the HAR entry's total `time` in milliseconds (including zero and fractional values). Missing/blank protocol labels and unavailable or negative times are omitted. Legacy examples without metadata remain valid. Timing-only differences do not prevent deduplication; the earliest capture's metadata is retained. Metadata describes the capture and does not change replay timing or protocol negotiation.

Replay requires matching recorded requests and exercising every canonical recording. It verifies artifacts against captures, not live API availability.

## Verification

Run `npm run typecheck` and `npm run test:local` for focused CLI checks with synthetic fixtures. `npm test` builds the CLI first and also checks the shared schema contract, starter templates, complete workflow, and collection/template detection. Neither suite depends on application-specific endpoints or recordings. Both fail on empty suites.

For a local capture compatibility check, run `npm run test:har -- "../../sources/capture.har"`. It creates a temporary collection from the empty starter templates, adds test-only origins and vocabulary, preserves all extracted recordings with stable filename suffixes, validates, compares extraction/render snapshots, replays every recording, independently checks capture fidelity, and checks baseline drift. It removes the temporary collection afterward and reports aggregate counts without capture values. This checks processing compatibility, not semantic classification; it does not import into `apis/` or modify source HAR files. Unsupported captures fail explicitly.

Run `npm run test:ablation` for controlled removals using synthetic data, or append `-- "../../sources/capture.har"` for local evidence. See [ablation results](test/ABLATIONS.md) and [data definitions](../../schema/README.md). Schemas establish structural validity; replay capability, capture fidelity, and semantic classification are separate checks. Omitted auth/type/requiredness remains absent; generated docs omit unknown-only columns and unknown auth.

Example filenames accept `<http>.<codeN|http-only>.<variant>[.<recording-id>].json`. Existing names remain valid; use stable lowercase alphanumeric/hyphen suffixes for distinct recordings sharing an outcome. Validation checks request method and URL pathname against the owning definition. Drift uses observed HTTP/code pairs and reports ambiguous variant matches instead of choosing the first.

Validation reports malformed documents without running semantic checks on them. Variant slugs must be unique per definition, and referenced response bodies must agree with declared `BodyNode` types. Missing fields and additional fields are allowed because these observed shapes do not declare requiredness or closed objects. Documentation labels parameter values as observed and includes response shapes; agent endpoint detail files retain request definitions and unknown declarations.

Newman's pinned dependencies require three compatibility overrides: `postman-request` uses the version already required by Newman to remove `har-validator`; `serialised-error` uses UUID 8's supported `v4` API; and `postman-collection` uses Faker 6, which retains its CommonJS locale API. Dependency compatibility tests cover dynamic variables and decorated errors; replay tests cover HTTP requests. Recheck these overrides when upgrading Newman. Some upstream calls still emit API deprecation warnings.

After canonical changes, run `validate`, `render --all`, then `test`. See [CI](../../.github/workflows/ci.yml) for the full gate and the [pipeline instructions](../skills/pipeline/SKILL.md) for orchestration.

### Capture field alignment

Captures include request `headers`, `query`, `body` and response `headers`, `body`. Empty headers use `{}`, query pairs use `[]`, and absent bodies use `null`. Cookies stay exclusively in masked Cookie/Set-Cookie headers; repeated headers use string arrays so values and attributes survive without a second cookie representation. Query pairs preserve order, duplicate names and empty values. Omit `bodyMeta` when no body exists; preserve it for captured text (including empty text) and explicit missing-capture evidence.

Definitions include `endpoint.url` (absolute origin and pathname, no query/fragment), validated against each example. Request header summaries retain observations common to all recordings. Include empty request `headers`, `query` and `body` sections as `{}`. Parameter `desc` is optional: use it only for a supported meaning, never for requiredness, unknown-data disclaimers or a repetition of the parameter name.

Generated docs contain endpoint identity, parameter observations, response field/type tables and recording links. Omit unknown-only columns, empty sections and repeated capture boilerplate. Raw request recipes and header dumps stay out of docs; complete captures remain in canonical files and executable requests in Postman. Agent details carry parameter definitions and response shapes, with canonical links for capture headers.
