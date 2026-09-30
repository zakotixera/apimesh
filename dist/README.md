# Distribution outputs

Consumer artifacts produced by the CLI. Generated files are intended to be committed and consumed directly; update their inputs and regenerate them.

- [docs/](docs/README.md): human-readable API documentation.
- [agent/](agent/README.md): compact API and variant metadata for agents.
- [postman/](postman/README.md): importable collection and environment.

Extraction, validation, and drift diagnostics are disposable workflow outputs in gitignored `.reports/`, outside the distribution.

Directory READMEs are handwritten and preserved by rendering. The summaries in `docs/` and `agent/` are generated indexes of their artifacts.
