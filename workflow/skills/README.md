# Workflow skills

Repository-specific agent instructions for semantic decisions and pipeline orchestration. Preserve the skill names when invoking or updating them.

| Request | Skill | Result |
|---|---|---|
| Import HAR files through validation, rendering, and replay; resume a failed run | [pipeline](pipeline/SKILL.md) | Verified outputs and a review handoff / PR when in scope |
| Classify sanitized drafts or merge response variants | [classify](classify/SKILL.md) | Canonical definitions, examples, and necessary glossary additions |
| Explain an endpoint or refresh its usage notes | [notes](notes/SKILL.md) | Short, evidence-based `notes.md` |
| Assess capture differences or apply drift fixes | [drift](drift/SKILL.md) | Per-change adjudication; canonical patches when requested |

Skills own canonical edits and delegate deterministic work to the [CLI](../cli/README.md). Generated artifacts remain CLI-owned.

Each skill begins with the [shared contracts](references/contracts.md), then loads the schemas and references needed for its task. These are repository-coupled skills, not standalone packages.

Current integration limits are explicit: extraction `bodyMeta` is not accepted by the example schema, and the filename convention cannot store distinct recordings of the same HTTP/code/variant tuple. Preserve blocked drafts and report partial completion instead of losing evidence.

See the [pipeline instructions](pipeline/SKILL.md) for handoffs; each `SKILL.md` defines its executable instructions. [Evaluation cases](evals/evals.json) cover cross-skill decisions and recovery paths; they are dry-run exercises, not a substitute for the CLI's corpus and replay tests.
