# Build an application API collection

Fork apimesh to maintain recorded API behavior for a specific application. Add application metadata and HAR recordings, classify the observations into canonical definitions and examples, then generate documentation, Agent references, and Postman artifacts.

The upstream repository supplies the CLI, schemas, skills, and directory structure. Your fork supplies `collection.json`, `glossary.json`, recordings under `sources/`, and the resulting application data. Collection commands and the full CI workflow require these inputs; an unpopulated fork is not a completed collection.

## 1. Fork and clone

On the apimesh GitHub page, select **Fork**, choose your account or organization, and give the fork an application-specific name such as `catalog-api-collection`. See [GitHub's fork instructions](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo).

Clone your fork and create a working branch. Replace `YOUR-OWNER`, `catalog-api-collection`, and `UPSTREAM-OWNER` with the actual repository names:

```sh
git clone https://github.com/YOUR-OWNER/catalog-api-collection.git
cd catalog-api-collection
git remote add upstream https://github.com/UPSTREAM-OWNER/apimesh.git
git switch -c setup/collection
git remote -v
```

`origin` should point to your application collection; `upstream` should point to apimesh. Keep application data and collection changes in your fork. The upstream remote provides access to future tooling updates.

Install Git, Node.js **20+**, and npm. Use an agent that can read the repository's [workflow skills](workflow/skills/README.md) for classification and semantic review, or follow those instructions manually. Classification is not a CLI subcommand.

## 2. Add collection metadata

Create both files below at the repository root, alongside `workflow/` and `schema/`. The examples describe a synthetic catalog application; replace the name, host, authentication fields, and vocabulary with those relevant to your application.

### `collection.json`

```json
{
  "name": "Catalog API collection",
  "version": "0.1.0",
  "bases": {
    "web": "https://api.example.invalid"
  },
  "auth": {
    "Authorization": {
      "kind": "header",
      "name": "Authorization",
      "doc": "Authentication header, replaced with a placeholder in recordings."
    },
    "SESSION_ID": {
      "kind": "cookie",
      "name": "SESSION_ID",
      "doc": "Session cookie, replaced with a placeholder in recordings."
    }
  },
  "changelog": []
}
```

| Field | How to use it |
|---|---|
| `name` | Application collection name used in generated outputs |
| `version` | Semantic version of your collection |
| `bases` | Origin labels mapped to API base URLs; capture host matching determines the example's `origin` |
| `auth` | Optional registry of header and cookie names to mask; omit unused entries or the whole field |
| `changelog` | Version history entries containing `version`, `date` (`YYYY-MM-DD`), and `notes`; an empty initial history is valid |

Use actual header or cookie names as both the `auth` key and its `name`. The masker derives placeholders such as `{{SESSION_ID}}` from `name`, while validation checks registration keys. Store descriptions here, never credential values. Registered names also participate in query and body masking; the CLI applies additional generic redaction rules.

Add each API host to `bases` with a stable label. An explicit `extract --origin` value should match one of these labels. Postman currently uses one `baseUrl` for all requests, so collections spanning several hosts require selecting the appropriate host when used outside managed replay.

The full contract is in [collection.schema.json](schema/collection.schema.json).

### `glossary.json`

```json
{
  "domains": [
    {
      "slug": "ok",
      "meaning": "The requested operation completed successfully."
    }
  ]
}
```

The [glossary schema](schema/glossary.schema.json) requires at least one domain. Start with a semantic term relevant to your application, then add terms as recordings establish additional outcomes. Slugs use lowercase letters, digits, and hyphens. Optional `known-codes` and `http-shapes` arrays provide classification hints; leave them out until supported by evidence. A response is not classified as successful solely because it has HTTP 200 or business code 0.

Keep the existing `workflow/` and `schema/` directories. The CLI locates the collection root by finding both `collection.json` and `workflow/`; there is no initialization command that creates these files.

## 3. Build and check the CLI

From the repository root:

```sh
cd workflow/cli
npm ci
npm run build
npm run apic -- --help
npm exec -- vitest run --passWithNoTests=false
npm run apic -- validate
```

Run each command only after the preceding command succeeds. Validation at this stage checks your metadata and any existing canonical data. It does not establish that an API collection is complete. Replay requires canonical recordings and will fail while none exist.

Subsequent CLI commands in this guide run from `workflow/cli`. Relative input paths and explicit `--out` paths resolve from that directory. Default output paths resolve from the repository root.

## 4. Record application traffic

Record requests and responses using browser developer tools or another HAR-compatible recorder. Capture the application actions you intend to document, including relevant successful and unsuccessful outcomes. Include request and response bodies where available, and keep capture timestamps.

Place the HAR files in the root `sources/` directory with distinct names, for example:

```text
sources/
  catalog-list.har
  catalog-item-missing.har
```

Review source files before committing them. `sources/` is tracked, and extraction writes masked copies without changing the original HAR. Automatic masking does not guarantee removal of sensitive content from arbitrary text or binary bodies. Keep private originals outside the published repository; add only recordings reviewed for sharing, and preserve those source files during subsequent processing.

## 5. Extract and classify

Pass every HAR in the intended batch to one extraction command:

```sh
npm run apic -- extract "../../sources/catalog-list.har" "../../sources/catalog-item-missing.har" --account test-account
```

`--account` is a non-sensitive label describing the recording context. It does not supply authentication. The command writes grouped YAML drafts into root `.raw/` and an extraction report into `.reports/`.

Each extraction replaces the set of files managed by its output manifest. Supply the whole batch in one call; separate calls do not accumulate drafts. The CLI expects explicit file paths and does not expand globs.

If a draft has been edited or lacks a valid ownership manifest, preserve it and use a fresh output directory:

```sh
npm run apic -- extract "../../sources/catalog-list.har" "../../sources/catalog-item-missing.har" --account test-account --out ../../.raw/import-02
```

Use an unused directory name and give that exact directory to the classification step.

Ask your agent to follow [classify](workflow/skills/classify/SKILL.md), for example:

> Follow workflow/skills/classify/SKILL.md to classify the current drafts in .raw/ for this application. Preserve recorded evidence, use collection.json and glossary.json, and report unresolved observations. Run validation after applying supported changes. Keep the results local.

Alternatively, after adding the metadata and HAR files, ask the agent to follow [pipeline](workflow/skills/pipeline/SKILL.md) for extraction through verification in one task. Specify the HAR paths and whether you want local results or a PR in your fork.

**Current compatibility limit:** extraction includes `bodyMeta` for captured bodies, but the canonical example schema does not yet accept that field. Ordinary HAR imports can therefore stop at classification. Retain affected drafts and report the blocker; completing those imports requires a coordinated schema and consumer update. Do not remove metadata, replace stored JSON text with parsed objects, or move metadata into ignored extension fields to make validation pass. Other supported frames may proceed, with the import reported as partial.

Classification creates application data such as:

```text
apis/
  catalog/
    items/
      definition.json
      examples/
        200.code0.ok.json
      notes.md
```

This layout is illustrative; create definitions and examples only from your application's evidence. For `/catalog/items`, the definition belongs in `apis/catalog/items/`. Each definition has a unique dotted API identifier, structured `endpoint.method` and `endpoint.path`, a source description, and semantic response variants. Each variant references glossary terms and recorded examples. Example filenames follow `<http>.<codeN|http-only>.<variant>.json`; use `http-only` when the business code is `null`.

The current model supports one definition per path directory and one example filename per HTTP/code/variant combination. Conflicting methods or hosts, and distinct recordings sharing one filename, need a modeling decision before import. Preserve both inputs and report the conflict.

Use the optional [notes](workflow/skills/notes/SKILL.md) skill for brief explanations grounded in definitions and examples. Schemas and detailed merge rules remain in [schema/](schema/) and the classification instructions.

## 6. Validate, generate, and replay

After supported observations have been classified, run from `workflow/cli`:

```sh
npm run apic -- validate
npm run apic -- render --all
npm run apic -- test
```

Resolve validation errors before continuing. Review warnings; use `validate --strict` if warnings should fail the check. Rendering generates these root directories:

| Directory | Output |
|---|---|
| `dist/docs/` | API pages and `summary.md` |
| `dist/agent/` | Agent metadata, indexes, and schema copies |
| `dist/postman/` | `endpoints.postman_collection.json` and `replay.postman_environment.json` |

Edit canonical inputs or renderer source, then regenerate outputs. `apic test` starts a local replay server, checks generated requests against recordings, and shuts the server down. It requires every canonical recording to be exercised. Passing replay does not verify live application availability.

Also verify that two renders produce the same file paths and bytes, including untracked files. For example, in PowerShell from `workflow/cli`, after the first render:

```powershell
function Get-OutputSnapshot {
  Get-ChildItem -LiteralPath '../../dist/docs', '../../dist/agent', '../../dist/postman' -File -Recurse |
    Sort-Object FullName |
    ForEach-Object { $_.FullName + ' ' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
}
$beforeRender = @(Get-OutputSnapshot)
npm run apic -- render --all
if ($LASTEXITCODE -ne 0) { throw 'Render failed' }
$afterRender = @(Get-OutputSnapshot)
if (Compare-Object -ReferenceObject $beforeRender -DifferenceObject $afterRender) {
  throw 'Generated file paths or contents changed between renders'
}
```

Expected new output may differ from Git HEAD during an import. Compare consecutive renders for determinism; compare against committed output for repository synchronization.

## 7. Review and publish the collection

Return to the repository root with `cd ../..`. Review the source recordings, metadata, canonical data, and generated outputs. Update your fork's README with the application scope, recording context, and links to its generated documentation.

Stage the intended files explicitly. For the example batch:

```sh
git add collection.json glossary.json apis/ dist/ sources/catalog-list.har sources/catalog-item-missing.har
git diff --cached --stat
git diff --cached
git diff --cached --check
```

Stage README changes separately if made. Keep `.raw/`, `.reports/`, `workflow/cli/dist/`, and `node_modules/` out of commits; they are temporary or regenerable local outputs.

Once review and the required checks pass:

```sh
git commit -m "feat: add initial catalog API collection"
git push -u origin setup/collection
```

Open the PR against your application's fork and confirm its base repository. Enable GitHub Actions in the fork if needed. The [CI workflow](.github/workflows/ci.yml) builds and tests the CLI on Node 20, 22, and 24, validates canonical data, renders twice, checks committed output synchronization, and runs replay. Its `gate` job succeeds only when every runtime passes. Adding HAR files alone is insufficient: classification and committed generated artifacts must also be complete.

A completed import has no unresolved target frames, passes validation and replay, produces stable output, and includes the reviewed data and artifacts in the commit. If only a supported subset was imported, list the remaining drafts and blockers in the PR.

## 8. Maintain the application collection

Add later captures as new source files. Repeat the import process for new observations, preserving stable API identifiers, semantic slugs, and existing recordings.

To compare a new capture with the current canonical data, run from `workflow/cli`:

```sh
npm run apic -- drift "../../sources/catalog-update.har"
```

Use [drift](workflow/skills/drift/SKILL.md) to assess `.reports/drift-*.json` against the recordings. Exit code 0 means the command completed; it does not mean no behavior changed. Apply supported changes within the task scope, update collection version history according to your release policy, and repeat validation, rendering, stability checks, and replay.

When incorporating upstream tooling changes, review schema and CLI compatibility with your application data, run `npm ci` if dependencies changed, rebuild, and repeat the same checks before publishing updated outputs.
