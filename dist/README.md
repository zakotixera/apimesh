# Distribution outputs

Consumer artifacts produced by the CLI. Generated files are intended to be committed and consumed directly; update their inputs and regenerate them.

- [docs/](docs/README.md): human-readable API documentation.
- [agent/](agent/README.md): compact API and variant metadata for agents.
- [postman/](postman/README.md): importable collection and environment.

Endpoint artifacts share the same host/path hierarchy as canonical data. Shared navigation and setup files stay at each consumer's root:

```text
dist/
  docs/
    summary.md
    usage.md
    endpoints/<host>/<path>/index.md
  agent/
    index.json
    summary.md
    endpoints/<host>/<path>/index.json
    schema/*.schema.json
  postman/
    endpoints.postman_collection.json
    replay.postman_environment.json
```

For root endpoints, omit `<path>/`. Postman folders follow host → endpoint → recording. Keeping endpoint pages under `endpoints/` avoids collisions with shared files such as `summary.md` or `usage.md`. Agent index format 2 includes `host` and links the new detail paths; consumers should follow those links instead of constructing filenames from API IDs. Regenerate with `apic render --all` after upgrading, and update external links or Postman imports. Old generated files are removed during rendering; top-level handwritten READMEs are preserved. Legacy definitions without a single known host render under `endpoints/_legacy/` until migrated.

Extraction, validation, and drift diagnostics are disposable workflow outputs in gitignored `.reports/`, outside the distribution.

Directory READMEs are handwritten and preserved by rendering. The summaries in `docs/` and `agent/` are generated indexes of their artifacts.
