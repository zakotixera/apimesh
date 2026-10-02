# Workflow skills

Agent instructions for semantic analysis and workflow coordination in a populated collection repository.

| Request | Skill | Result |
|---|---|---|
| Import HAR files through validation, rendering, and replay; resume a failed run | [pipeline](pipeline/SKILL.md) | Verified outputs and a review handoff / PR when in scope |
| Classify sanitized drafts or merge response variants | [classify](classify/SKILL.md) | Canonical definitions, examples, and necessary glossary additions |
| Explain an endpoint or refresh its usage notes | [notes](notes/SKILL.md) | Short, evidence-based `notes.md` |
| Assess capture differences or apply drift fixes | [drift](drift/SKILL.md) | Assessment of each change; canonical updates when requested |

Skills maintain canonical data and use the [CLI](../cli/README.md) for deterministic processing and artifact generation.

Each skill begins with the [shared contracts](references/contracts.md), then reads the schemas and references needed for its task. The repository's CLI, schemas, and related skills must be available.

The example schema supports capture `bodyMeta` and optional recording suffixes for multiple observations of one outcome. Preserve JSON text and existing filenames. Missing bodies, uncaptured uploads, and conflicting methods or HTTP/HTTPS origins in one host/path directory still require explicit unresolved handling; report those observations alongside completed work.

See the [pipeline instructions](pipeline/SKILL.md) for coordination and handoffs. [Evaluation cases](evals/evals.json) exercise semantic decisions and recovery plans through dry runs. CLI and replay tests separately verify execution behavior.
