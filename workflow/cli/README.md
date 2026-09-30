# apic CLI

The TypeScript executor for deterministic HAR extraction, corpus validation, output rendering, drift detection, and local replay testing.

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

Body handling preserves captured text and JSON numeric literals during masking. Opaque binary and arbitrary text/XML are not guaranteed to be sanitized. CLI support for `bodyMeta` is not yet accepted by the canonical [example schema](../../schema/example.schema.json).

Replay requires matching recorded requests and exercising every canonical recording. It verifies artifacts against captures, not live API availability.

## Verification

Run `npm run typecheck` and `npm run test:local` for CLI-local checks. `npm test` also includes tests using repository schemas and sample APIs.

After canonical changes, run `validate`, `render --all`, then `test`. See [CI](../../.github/workflows/ci.yml) for the full gate and the [pipeline instructions](../skills/pipeline/SKILL.md) for orchestration.
