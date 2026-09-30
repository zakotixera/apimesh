# Workflow skill evaluation cases

`evals.json` contains shared evaluation cases for the four workflow skills. Each case names its applicable skills and supplies a self-contained dry-run prompt; `files: []` means no additional capture fixture is needed. Assertions assess the proposed decisions. The suite does not execute the import pipeline.

To compare a revision:

1. Snapshot the existing skills before editing, outside the repository's runtime outputs.
2. Run each prompt with the revised skills and with the snapshot, keeping contexts separate. Give executors the prompt and applicable instructions, not expected outputs or assertions. Preserve the same repository reference context for both versions.
3. Save the answers under an external workspace as `iteration-N/eval-ID-name/{with_skill,old_skill}/outputs/answer.md`. Put prompt and assertions in each case's `eval_metadata.json`.
4. Grade each assertion using evidence from the answer. Write sibling `grading.json` files using `expectations: [{text, passed, evidence}]` and a pass/fail summary. Record CLI execution only when it was performed.
5. Summarize the comparison, sample size, and limitations. Include timing or token metrics only when measured by the runner. A review page may be generated with available evaluation tools.

The cases cover collisions, unsupported captures, Windows recovery, semantic drift, and notes grounded in evidence. Automatic skill selection and end-to-end import behavior require separate evaluation cases or isolated corpus fixtures with the relevant CLI checks.
