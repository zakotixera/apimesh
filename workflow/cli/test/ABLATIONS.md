# Contract ablations

Run from `workflow/cli`:

```sh
npm run test:ablation
npm run test:ablation -- "../../sources/capture.har"
```

The runner builds isolated copies of the compiled CLI, schemas, templates, and compatibility harness. It runs a baseline, then removes exactly one listed factor in each copy. It never edits production code, the Git index, or source HAR files. Each copy and its temporary canonical collection are deleted afterward. The experiment fails if the baseline fails or a mutation target changes; individual ablations may pass or fail without presupposing the result.

Aggregate reports are written to `.reports/ablation-synthetic.json` and `.reports/ablation-har.json`. Reports include input hashes, runtime, passed stages, and the first observed failure; no captured values or endpoint names are included. `npm test` runs the smaller definition/capture ablation regressions, not all destructive mutations.

## Measured results

Measured on Windows with Node 24.18.1: one baseline plus seven removals on each of two datasets, one run per condition. The synthetic dataset contains three recordings. The supplied HAR contains 34 recordings across 17 endpoints, including 23 JSON requests. These are behavioral experiments, not timing benchmarks or statistical estimates.

| Removed factor | Synthetic result | Supplied HAR result | Interpretation |
|---|---|---|---|
| Nothing | Pass | All 34 pass | Baseline includes independent capture fidelity |
| Schema accepts `bodyMeta` | Validation fails | Validation fails | Captured representation needs a place in the data contract |
| Metadata in canonical copies | Replay passes; 3 fidelity mismatches | Replay passes; 23 fidelity mismatches | Optional legacy compatibility does not justify erasing capture metadata |
| Recording suffix | Collision rejected | Collision rejected | Outcome identity alone cannot distinguish repeated recordings |
| Masked-URL allowance | Validation fails | Validation fails | Sanitized URL values are not necessarily strict URI literals |
| Request pseudo-header filtering | Pass | Pass | No necessity demonstrated by these Newman runs; filter remains an export normalization rule |
| Response compression-header filtering | Replay fails | Replay fails | Decoded capture bodies must not be advertised as compressed transport bytes |
| Test-only glossary registration | Canonical validation fails | Canonical validation fails | Empty starter vocabulary is valid; referenced terms still require registration |

Deleting metadata double-encodes JSON request text when the legacy serializer sees a JSON Content-Type. The replay server derives its expected request from the same altered canonical data, so both sides agree on the wrong payload. The independent fidelity oracle compares exports against the original sanitized extraction snapshot, without using production serializers. It covers method, URL, request payload, and saved response content; it does not claim exhaustive header or live-service validation.

Separate field ablations removed auth, parameter type, and requiredness individually. Before correction, renderers substituted `none`, `string`, and `false`. Regression tests now require unknown/omitted output while retaining explicit `none` and `false`. Additional tests show missing and binary request captures remain schema-valid even when replay cannot export them.

These experiments do not establish semantic variant correctness, unknown API behavior, or support for every capture format. The [data definitions](../../../schema/README.md) specify the boundaries. Fixture vocabulary and observed host lists stay in the test harness; universal templates remain empty.
