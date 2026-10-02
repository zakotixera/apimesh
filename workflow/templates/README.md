# Collection starters

Copy `collection.json` and `glossary.json` to the consuming application root when creating a collection. Keep the originals in the pinned toolchain; they are excluded from collection discovery. Artifact directory contracts live in [ARCHITECTURE.md](../../ARCHITECTURE.md). Set the display name, add application origins and authentication names, and add glossary terms only when evidence establishes their meaning. Origins and vocabulary start empty; no endpoint, business code, authentication requirement, or outcome is prescribed.

These files are structurally valid starters, not a completed collection. Canonical variants must reference registered glossary terms, and replay requires recordings. Test-only vocabulary is created by the compatibility harness and never copied into these templates. See [DEVELOPMENT.md](../../DEVELOPMENT.md) and the [data definitions](../../schema/README.md).

Endpoint and example templates are intentionally absent: their required identities, meanings, and recordings need capture evidence. Use the schemas to construct them. Omit auth, parameter type, and requiredness when unknown; keep recorded values and body metadata intact. Generated docs and agent references preserve those distinctions.
