# CLI reports

Diagnostics produced by extraction, validation, and drift detection. The report formats are not frozen.

Commands write these reports directly; `apic render` does not regenerate them.

- `extract-*.json`: endpoint, frame, and duplicate counts from `apic extract`.
- `validate.json`: schema and cross-reference issues from `apic validate`.
- `drift-*.json`: advisory capture differences from `apic drift`, interpreted by the drift skill.
