# apic CLI

Reads application collection data and toolchain-owned schemas; writes extraction drafts and generated artifacts. Semantic decisions and canonical edits belong to [skills](../skills/README.md).

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

For a vendored installation, install and build from the application root with `npm --prefix vendor/apimesh/workflow/cli ci` and `npm --prefix vendor/apimesh/workflow/cli run build`, then run:

```sh
node vendor/apimesh/workflow/cli/dist/cli.js --root . validate
```

`--root <directory>` selects exactly that collection; without it, discovery walks upward from the working directory to the nearest collection metadata marker and requires both `collection.json` and `glossary.json`. Toolchain templates are excluded. The application does not need `workflow/` or `schema/`; schemas come from the executing CLI's toolchain. Keep the compiled CLI in its original layout beside `schema/` and the rest of `workflow/`.

Optional `npm link` exposes `apic`. `npm run apic -- <command>` works inside the CLI package for a nested vendor installation, but npm changes the working directory to that package: relative HAR paths and explicit roots must account for this. Direct `node` invocation from the application root avoids that ambiguity.

| Command | Responsibility |
|---|---|
| `init [--name <name>] [--dry-run]` | Create missing application setup files, preserving existing files |
| `extract [har...]` | Mask explicit HARs, or sorted direct HARs in collection `sources/`, into `.raw/` drafts |
| `validate` | Check canonical schemas and cross-references |
| `render` | Generate docs, agent, and Postman artifacts; defaults to all |
| `drift <har...>` | Compare captures with canonical definitions; write an advisory report |
| `test` | Check generated Postman requests against local recordings |
| `verify [--committed] [--no-strict]` | Strictly validate, render twice, compare paths/bytes, and replay; optionally enforce synchronization with HEAD |
| `serve [--port <port>]` | Keep a local replay server running for interactive Postman use (default: 4010) |

Use `<command> --help` for options. Input paths and explicit `--out` paths resolve from the current directory; default outputs resolve from the selected collection root. With direct invocation from the application root, use `sources/capture.har`. `--root` does not change the working directory.

`init` is the exception to metadata discovery: it targets `--root` or the current directory and accepts a directory without metadata. It creates collection/glossary starters, package scripts, Git defaults, CI, README, agent instructions and `sources/`. It rejects destinations inside the executing toolchain and linked output paths. Existing files are preserved without merging; reconcile them with `workflow/templates/application/` explicitly. An external toolchain initializes scripts for `vendor/apimesh`; a nested installation uses its own relative location. `--name` only affects a new collection file. `--dry-run` writes no application files. No Git, network, dependency installation or classification is performed by the CLI initializer.

The npm convenience command `npm --prefix vendor/apimesh/workflow/cli run init -- --root . --name "My APIs"` builds first, then restores `INIT_CWD` before resolving arguments. This special wrapper makes the proposed bootstrap command work from the application root; it does not change other npm scripts' working-directory behavior. Even a dry run through npm builds the toolchain first.

`verify` fails on warnings by default (`--no-strict` permits warnings), stops at the first failed stage, and writes `.reports/verify.json` with actual results. It rejects linked output paths, compares all `dist/` filenames and bytes, and passes `--timeout` to local replay. Empty collections fail replay. `--committed` requires a Git commit and checks staged, modified, deleted, untracked and ignored outputs before regeneration and after each render. Use ordinary verification while preparing local changes; commit reviewed outputs before enforcing synchronization. Reports describe verification of canonical recordings, not completeness or privacy of a HAR import. Rendering retains its normal replacement behavior.

## Output boundaries

Extraction uses `.apic-extract.json` to track filenames and hashes. It updates unchanged managed files, removes obsolete managed files, and preserves unrelated files. Modified or unowned output collisions are rejected; use a new `--out` directory for older drafts without a manifest. Symlink and junction output paths are rejected. Managed extraction output and each rendered group are staged and swapped as a unit.

Rendering replaces generated output groups while preserving their READMEs. Local `dist/` contains compiled JavaScript; collection-root `dist/` contains committed consumer artifacts. Extraction, validation, and drift diagnostics go to collection-root `.reports/`, which is gitignored and disposable. `apic render` does not generate reports.

Postman exports use `dist/postman/endpoints.postman_collection.json` and `replay.postman_environment.json`. Each recorded origin gets its own collection variable, using the matching `collection.bases` label when available. Hosts are taken from recordings, including hosts absent from collection metadata. The local replay environment sets `apicReplay=true` and `baseUrl=http://127.0.0.1:4010`; request scripts override their origin variable and select the exact recording only in replay mode. Request placeholder entries are listed but disabled so replay preserves their literal masked values.

For interactive use, run `node vendor/apimesh/workflow/cli/dist/cli.js --root . serve` from the application root, import both artifacts, and select the local replay environment. The loopback server stays available until Ctrl+C. Use `serve --port 4011` and update the environment's `baseUrl` if needed; `--port 0` prints an available port. `apic test` continues to own a temporary server for automated checks. For live use, create a separate environment with `apicReplay` absent or false, supply your own placeholder values, and override individual origin variables as needed. Generated `dist/docs/usage.md` documents the collection's request placeholders.

Human documentation links canonical examples and shows parameter and response field tables. Only long parameter values and response fields are expandable; raw request recipes and capture header dumps are omitted. Agent index format **2** is a compact discovery manifest; load the `detailFile` for request definitions, full response variants, and example paths. JSON file references use the collection repository root as their base (`pathBase: repository-root`). This replaces the previous inline request/schema layout; consumers must follow `detailFile`. The copied schemas describe canonical formats, not the generated index.

After upgrading from older exports, run `render --postman` before `test` and update imports or automation to the filenames above.

Body handling preserves captured text and JSON numeric literals during masking. Opaque binary and arbitrary text/XML are not guaranteed to be sanitized. The canonical [example schema](../../schema/example.schema.json) accepts optional `bodyMeta` for text, parsed JSON, request parameters, binary responses, and missing captures; it rejects inconsistent body/metadata combinations. Missing bodies, binary requests, and uncaptured file uploads cannot complete replay. Recorded URL queries may retain masking placeholders. HTTP/2 pseudo-headers are omitted from Postman requests; replay and saved responses omit original compression and length headers because HAR bodies are already decoded.

Extraction also adds `request.httpMeta` and `response.httpMeta`: `httpVersion` preserves each side's HAR protocol label, and response `entryTime` copies the HAR entry's total `time` in milliseconds (including zero and fractional values). Missing/blank protocol labels and unavailable or negative times are omitted. Legacy examples without metadata remain valid. Timing-only differences do not prevent deduplication; the earliest capture's metadata is retained. Metadata describes the capture and does not change replay timing or protocol negotiation.

Replay requires matching recorded requests and exercising every canonical recording. It verifies artifacts against captures, not live API availability.

## Verification

Run `npm run typecheck` and `npm run test:local` for focused CLI checks with synthetic fixtures. `npm test` builds the CLI first and also checks the shared schema contract, starter templates, complete workflow, collection root selection, and vendor isolation. Neither suite depends on application-specific endpoints or recordings. Both fail on empty suites.

GitHub workflows use Ubuntu runners and Bash. They own events, permissions, concurrency, the Node matrix, installation, and command invocation. `npm test` delegates to `scripts/ci.cjs check`, which runs the pinned compiler and Vitest in order and stops on any failed or interrupted process. `scripts/ci.cjs gate` consumes `CI_NEEDS` as JSON and requires every upstream job to report success, including rejecting skipped or cancelled jobs; it requires no installed dependencies. The stable `gate` job runs even when the matrix fails. `test/ci.test.ts` covers these process and result boundaries and checks both workflow contracts. Collection CI delegates verification to `apic verify` through the generated package scripts.

For a local capture compatibility check, run `npm run test:har -- "/absolute/path/to/capture.har"`. It creates a temporary collection from the empty starter templates, adds test-only origins and vocabulary, preserves all extracted recordings with stable filename suffixes, validates, compares extraction/render snapshots, replays every recording, independently checks capture fidelity, and checks baseline drift. It removes the temporary collection afterward and reports aggregate counts without capture values. This checks processing compatibility, not semantic classification; it does not import into `apis/` or modify source HAR files. Unsupported captures fail explicitly.

Run `npm run test:ablation` for controlled removals using synthetic data, or append `-- "/absolute/path/to/capture.har"` for local evidence. Use `--out /absolute/path/to/reports` to choose the report directory; defaults are collection `.reports/` or OS temporary storage when no collection is discovered. See [data definitions](../../schema/README.md). Schemas establish structural validity; replay capability, capture fidelity, and semantic classification are separate checks. Omitted auth/type/requiredness remains absent; generated docs omit unknown-only columns and unknown auth.

Example filenames accept `<http>.<codeN|http-only>.<variant>[.<recording-id>].json`. Existing names remain valid; use stable lowercase alphanumeric/hyphen suffixes for distinct recordings sharing an outcome. Validation checks request method and URL pathname against the owning definition. Drift uses observed HTTP/code pairs and reports ambiguous variant matches instead of choosing the first.

Validation reports malformed documents without running semantic checks on them. Variant slugs must be unique per definition, and referenced response bodies must agree with declared `BodyNode` types. Missing fields and additional fields are allowed because these observed shapes do not declare requiredness or closed objects. Documentation labels parameter values as observed and includes response shapes; agent endpoint detail files retain request definitions and unknown declarations.

Newman's pinned dependencies require three compatibility overrides: `postman-request` uses the version already required by Newman to remove `har-validator`; `serialised-error` uses UUID 8's supported `v4` API; and `postman-collection` uses Faker 6, which retains its CommonJS locale API. Dependency compatibility tests cover dynamic variables and decorated errors; replay tests cover HTTP requests. Recheck these overrides when upgrading Newman. Some upstream calls still emit API deprecation warnings.

After canonical changes, run `validate`, `render --all`, then `test`. See [CI](../../.github/workflows/ci.yml) for the full gate and the [pipeline instructions](../skills/pipeline/SKILL.md) for orchestration.

### Capture field alignment

Captures include request `headers`, `query`, `body` and response `headers`, `body`. Empty headers use `{}`, query pairs use `[]`, and absent bodies use `null`. Cookies stay exclusively in masked Cookie/Set-Cookie headers; repeated headers use string arrays so values and attributes survive without a second cookie representation. Query pairs preserve order, duplicate names and empty values. Omit `bodyMeta` when no body exists; preserve it for captured text (including empty text) and explicit missing-capture evidence.

Definitions include `endpoint.url` (absolute origin and pathname, no query/fragment), validated against each example. Request header summaries retain observations common to all recordings. Include empty request `headers`, `query` and `body` sections as `{}`. Parameter `desc` is optional: use it only for a supported meaning, never for requiredness, unknown-data disclaimers or a repetition of the parameter name.

Generated docs contain endpoint identity, parameter observations, response field/type tables and recording links. Omit unknown-only columns, empty sections and repeated capture boilerplate. Raw request recipes and header dumps stay out of docs; complete captures remain in canonical files and executable requests in Postman. Agent details carry parameter definitions and response shapes, with canonical links for capture headers.

## Host categories and artifact layout

Canonical definitions live in `apis/<host>/<path>/`, with `endpoint.url` identifying the actual origin and path. Different hosts may maintain the same endpoint path independently. See the [canonical layout and migration guide](../../ARCHITECTURE.md#canonical-api-corpus). Legacy path-only directories produce migration warnings; strict validation fails until they are moved.

Docs and agent details mirror that hierarchy under `dist/docs/endpoints/` and `dist/agent/endpoints/`, using `index.md` and `index.json` per endpoint. Shared indexes, usage documentation, and schema copies stay outside those endpoint directories. Postman groups recordings by host, then endpoint. Run `render --all` after upgrading and follow the generated index links; see the [distribution layout](../../ARCHITECTURE.md#distribution-outputs).
