# Workflow skill evaluation cases

`evals.json` is a shared suite for the four repository skills, not a fifth skill. Each case names its applicable skills and supplies a self-contained dry-run prompt; `files: []` means no additional capture fixture is needed. Assertions assess the proposed decisions, not execution of the real pipeline.

To compare a revision:

1. Snapshot the existing skills before editing, outside the repository's runtime outputs.
2. Run each prompt with the revised skills and with the snapshot, keeping contexts separate. Give executors the prompt and applicable instructions, not expected outputs or assertions. Preserve the same repository reference context for both versions.
3. Save the answers under an external workspace as `iteration-N/eval-ID-name/{with_skill,old_skill}/outputs/answer.md`. Put prompt and assertions in each case's `eval_metadata.json`.
4. Grade every assertion with a specific quote or explanation from the answer. Write sibling `grading.json` files using `expectations: [{text, passed, evidence}]` and a pass/fail summary. Do not infer successful CLI execution from a dry-run plan.
5. Use skill-creator's `eval-viewer/generate_review.py` to create a review page. Report the sample size and limitations. Do not fabricate timing or token metrics when the runner does not supply them.

These cases cover collisions and unsupported captures, Windows recovery, semantic drift, and evidence-based notes. They do not measure automatic skill triggering or end-to-end import correctness. For those claims, add separate trigger cases or isolated corpus fixtures and execute the relevant CLI gates.
