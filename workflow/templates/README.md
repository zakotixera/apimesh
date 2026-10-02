# Collection starters and application scaffolding

Run `npm --prefix vendor/apimesh/workflow/cli run init -- --root . --name "My APIs"` from an application root after installing dependencies. The npm entry point builds the CLI and restores the caller directory before resolving `--root`. Direct `apic init` uses its actual working directory. Add `--dry-run` to preview application writes.

`application/` contains versioned `.tmpl` sources for package scripts, Git defaults, CI, README and agent instructions. Initialization substitutes the relative vendor path and creates only missing files, preserving existing content without merging. Reconcile existing setup files explicitly; templates are not an update manifest. Originals in `sources/` are ignored by default; generated root `dist/` is committed. Verification and extraction run in the pinned CLI, so applications do not need copied `scripts/*.cjs` implementations.

Application-specific preprocessing stays in the application. No completed `IMPORT.md` is copied: an import handoff must describe actual source coverage, unresolved records and checks. `.reports/verify.json` records checks run by `apic verify`, not semantic coverage or privacy certification.

Copy `collection.json` and `glossary.json` to the consuming application root when creating a collection. Keep the originals in the pinned toolchain; they are excluded from collection discovery. Artifact directory contracts live in [ARCHITECTURE.md](../../ARCHITECTURE.md). Set the display name, add application origins and authentication names, and add glossary terms only when evidence establishes their meaning. Origins and vocabulary start empty; no endpoint, business code, authentication requirement, or outcome is prescribed.

These files are structurally valid starters, not a completed collection. Canonical variants must reference registered glossary terms, and replay requires recordings. Test-only vocabulary is created by the compatibility harness and never copied into these templates. See [DEVELOPMENT.md](../../DEVELOPMENT.md) and the [data definitions](../../schema/README.md).

Endpoint and example templates are intentionally absent: their required identities, meanings, and recordings need capture evidence. Use the schemas to construct them. Omit auth, parameter type, and requiredness when unknown; keep recorded values and body metadata intact. Generated docs and agent references preserve those distinctions.
