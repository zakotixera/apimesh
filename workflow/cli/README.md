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

Use `<command> --help` for options. Input paths and explicit `--out` paths resolve from the current directory; default outputs resolve from the repository root. A capture path from here is `../../sources/capture.har`.

## Output boundaries

Extraction uses `.apic-extract.json` to track filenames and hashes. It updates unchanged managed files, removes obsolete managed files, and preserves unrelated files. Modified or unowned output collisions are rejected; use a new `--out` directory for older drafts without a manifest. Symlink and junction output paths are rejected. Writes are not transactional.

Rendering replaces generated output groups while preserving their READMEs. Local `dist/` contains compiled JavaScript; repository-root `dist/` contains committed consumer artifacts. Extraction, validation, and drift diagnostics go to repository-root `.reports/`, which is gitignored and disposable. `apic render` does not generate reports.

Postman exports always use `dist/postman/endpoints.postman_collection.json` and `dist/postman/replay.postman_environment.json`. Display names come from `collection.name`. The collection's default `baseUrl` uses the first base in codepoint-sorted key order, falling back to local replay when no bases are configured. The environment overrides it with `http://127.0.0.1:4010`. Requests share one `baseUrl`; select the intended host when inspecting a mesh with multiple API hosts. `apic test` overrides it with a temporary local replay server.

After upgrading from older exports, run `render --postman` before `test` and update imports or automation to the filenames above.

Body handling preserves captured text and JSON numeric literals during masking. Opaque binary and arbitrary text/XML are not guaranteed to be sanitized. CLI support for `bodyMeta` is not yet accepted by the canonical [example schema](../../schema/example.schema.json).

Replay requires matching recorded requests and exercising every canonical recording. It verifies artifacts against captures, not live API availability.

## Verification

Run `npm run typecheck` and `npm run test:local` for CLI-local checks with synthetic fixtures. `npm test` also checks synthetic definitions against the repository's shared schemas. Neither suite depends on application-specific endpoints or recordings.

Newman's pinned dependencies require three compatibility overrides: `postman-request` uses the version already required by Newman to remove `har-validator`; `serialised-error` uses UUID 8's supported `v4` API; and `postman-collection` uses Faker 6, which retains its CommonJS locale API. Dependency compatibility tests cover dynamic variables and decorated errors; replay tests cover HTTP requests. Recheck these overrides when upgrading Newman. Some upstream calls still emit API deprecation warnings.

After canonical changes, run `validate`, `render --all`, then `test`. See [CI](../../.github/workflows/ci.yml) for the full gate and the [pipeline instructions](../skills/pipeline/SKILL.md) for orchestration.
