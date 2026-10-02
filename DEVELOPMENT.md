# Use and develop apimesh

apimesh supplies a reusable CLI, schemas, semantic skills and metadata starters. Each consuming repository owns its recordings, canonical data, vocabulary and generated artifacts. The complete layout and artifact contracts are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Vendor the toolchain

Requirements: Git, Node.js **20+**, and npm. From an application repository, pin apimesh as a submodule:

```sh
git submodule add https://github.com/ZakoTixera/apimesh.git vendor/apimesh
git submodule update --init --recursive
npm --prefix vendor/apimesh/workflow/cli ci
npm --prefix vendor/apimesh/workflow/cli run build
node vendor/apimesh/workflow/cli/dist/cli.js --help
```

A source copy or subtree also works. Keep `schema/` and `workflow/` together and retain the license. The CLI is distributed as source with this repository, not as a standalone npm package. Its compiled files alone are insufficient. Make changes to shared tooling upstream, then update the application's pinned revision.

## Initialize collection metadata

Copy `vendor/apimesh/workflow/templates/collection.json` and `glossary.json` to the application root. There is no initialization command. Create `sources/` for recordings; classification creates `apis/`, and CLI commands create their output directories when needed. Do not copy placeholder artifact trees into vendor.

Set the collection's `name`, semantic `version`, and `bases` (stable origin labels mapped to actual API origins). The optional `auth` registry declares header/cookie names to mask. Use the same actual name as both registry key and entry `name`, for example:

```json
{
  "name": "Catalog API collection",
  "version": "0.1.0",
  "bases": { "web": "https://api.example.invalid" },
  "auth": {
    "SESSION_ID": {
      "kind": "cookie",
      "name": "SESSION_ID",
      "doc": "Session cookie replaced by a placeholder in recordings."
    }
  },
  "changelog": []
}
```

Store descriptions, never credential values. Registered names also participate in query/body masking; generic redaction applies additional rules. Start with the empty glossary and add terms only when recordings establish meaning. Every canonical variant must reference a registered term; HTTP 200 or business code 0 alone does not establish success.

Add these patterns to the application's `.gitignore`:

```gitignore
.raw/
.reports/
node_modules/
vendor/apimesh/workflow/cli/dist/
```

Track reviewed `sources/`, `collection.json`, `glossary.json`, `apis/`, and generated collection `dist/`. The root `dist/` is distinct from compiled CLI code inside vendor.

## Run against a collection

Run commands from the application root:

```sh
node vendor/apimesh/workflow/cli/dist/cli.js --root . validate
node vendor/apimesh/workflow/cli/dist/cli.js --root . extract "sources/catalog-list.har" "sources/catalog-missing.har" --account test-account
```

Replace the sample HAR names with actual files. `--root` targets exactly that directory and requires both metadata files. It never falls back to a parent. Without `--root`, the CLI discovers the nearest collection from the current directory, including when run inside a vendored CLI directory. Templates are excluded. An incomplete nested collection fails rather than selecting a parent collection.

Input paths and explicit `--out` paths resolve from the caller's working directory, even with `--root`. Defaults resolve under the collection. `npm --prefix ... run apic` changes the working directory to the CLI package; use the direct `node` invocation above when supplying application-relative paths. An optional application package script can wrap that invocation.

Keep private originals outside published repositories. Review HAR files before committing: extraction writes masked drafts without changing originals, and arbitrary text or binary bodies may still contain sensitive data.

Pass every HAR in an intended batch to one extraction call. Extraction replaces its manifest-managed set; separate calls do not accumulate drafts. The CLI does not expand globs. If existing drafts are edited or unowned, preserve them and choose a fresh directory:

```sh
node vendor/apimesh/workflow/cli/dist/cli.js --root . extract "sources/catalog-list.har" --out .raw/import-02
```

## Classify recorded behavior

Ask an agent to follow `vendor/apimesh/workflow/skills/classify/SKILL.md` for the actual draft directory, or `pipeline/SKILL.md` for the complete workflow. State the input scope and whether the result should remain local or become a PR. The same instructions can be followed manually. Classification is a semantic stage, not a CLI subcommand.

Definitions and examples belong at `apis/<host>/<path>/`, using actual URL hosts, globally unique API IDs, and stable variant slugs. See [canonical layout](ARCHITECTURE.md#canonical-api-corpus) for host escaping, filenames and legacy migration. Different methods or HTTP/HTTPS origins at one host/path still require a modeling decision; preserve conflicting evidence and report unresolved frames.

Preserve JSON text, body metadata, HTTP metadata and existing recording names. Distinct recordings of one outcome use stable filename suffixes; identical examples can be reused. Missing bodies, binary requests and uncaptured uploads may prevent replay. Do not invent observations to complete an import. Optional notes must be grounded in evidence.

## Verify collection changes

After classification, run:

```sh
node vendor/apimesh/workflow/cli/dist/cli.js --root . validate
node vendor/apimesh/workflow/cli/dist/cli.js --root . render --all
node vendor/apimesh/workflow/cli/dist/cli.js --root . test
```

Resolve validation errors, retain warnings in the handoff, and use `validate --strict` when warnings should fail. Render again and compare every generated path and byte, including untracked files. For example, in PowerShell after the first render:

```powershell
function Get-OutputSnapshot {
  Get-ChildItem -LiteralPath 'dist/docs', 'dist/agent', 'dist/postman' -File -Recurse |
    Sort-Object FullName |
    ForEach-Object { $_.FullName + ' ' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
}
$beforeRender = @(Get-OutputSnapshot)
node vendor/apimesh/workflow/cli/dist/cli.js --root . render --all
if ($LASTEXITCODE -ne 0) { throw 'Render failed' }
$afterRender = @(Get-OutputSnapshot)
if (Compare-Object -ReferenceObject $beforeRender -DifferenceObject $afterRender) {
  throw 'Generated file paths or contents changed between renders'
}
```

Application CI should check out submodules, install/build the pinned CLI, validate, render twice, check `git status --porcelain=v1 --untracked-files=all -- dist/` after each render, and replay. This checks committed-output synchronization in addition to render determinism. Upstream [CI](.github/workflows/ci.yml) tests the toolchain with disposable synthetic collections; it does not validate downstream application data.

`test` exercises every canonical recording with Newman against a temporary local server. It does not test live service availability. For interactive Postman use, run `serve`, import the generated collection and replay environment, and keep the server running. Use `serve --port 4011` and update the environment's `baseUrl` when needed. Generated `dist/docs/usage.md` describes live setup separately.

Review source evidence, canonical changes and artifacts before staging specific files. A completed import has no unresolved target frames and passes validation, stability and replay checks. Report partial imports as partial; successful checks on accepted frames do not prove full coverage.

## Maintain and upgrade

Add later captures as new source files. Compare them with `node vendor/apimesh/workflow/cli/dist/cli.js --root . drift "sources/catalog-update.har"`, then follow the vendored drift skill to interpret reports. Exit code 0 means comparison completed, not that no behavior changed. Apply only supported changes in scope, update collection version history as appropriate, and repeat the checks.

For an existing fork, preserve root metadata, sources, APIs and artifacts. Add the pinned toolchain under vendor, update scripts/CI/agent references, and remove old root `workflow/` and `schema/` copies once their local tooling changes have been reconciled upstream. Update links to deleted directory READMEs to [ARCHITECTURE.md](ARCHITECTURE.md) in the vendored checkout. Custom application schemas do not override the pinned toolchain schemas. No canonical format change is required for vendoring itself.

Upgrade by selecting a reviewed vendor revision, reinstalling dependencies and rebuilding, then validating, regenerating, checking stability and replaying the application. Commit the vendor pin and any regenerated artifacts together after review.

## Develop the toolchain

From this repository's `workflow/cli`:

```sh
npm ci
npm run build
npm run typecheck
npm test
```

The full suite includes schemas, template validity, extraction, drift, deterministic rendering, replay and vendor isolation. To check a real HAR without importing or semantically classifying it, run `npm run test:har -- "/absolute/path/to/capture.har"`. The harness creates and removes a temporary collection and checks processing compatibility and capture fidelity.

`npm run test:ablation -- --out "/absolute/path/to/reports"` runs controlled removals in temporary toolchain copies. Without `--out`, reports go to the discovered collection's `.reports/`, or OS temporary storage when developing the standalone toolchain. It never uses vendor as the default report destination.

Change schema, validators, affected skills and consumers together when evolving data formats. Keep English and Chinese READMEs aligned. Change renderers or canonical inputs and regenerate; never repair generated artifacts by hand.
