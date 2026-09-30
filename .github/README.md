# GitHub automation

[CI](workflows/ci.yml) runs on pushes, pull requests, merge queue entries, and manual dispatches. It builds the CLI, runs the full test suite, validates canonical data, renders twice, and runs Postman against the local replay server on Node.js 20, 22, and 24. Node 20 remains covered because it is the CLI's declared minimum version.

Both render passes must leave the committed `dist/` tree unchanged, including additions and deletions. Validation still gates CI through its exit code; disposable reports in gitignored `.reports/` are excluded from the generated-artifact check. Tests must discover at least one test. The final `gate` job succeeds only when every runtime passes; use `gate` as the required branch protection check.

Runs have time limits, read-only repository permissions, and no persisted checkout credentials. A newer pull request run cancels an older run for the same pull request. Actions are pinned to commit hashes; [Dependabot](dependabot.yml) checks actions and CLI dependencies weekly.

To reproduce a runtime's checks locally, use the matching Node.js version and run from `workflows/cli/`:

```sh
npm ci
npm run build
npm exec -- vitest run --passWithNoTests=false
npm run apic -- validate
npm run apic -- render --all
git status --short --untracked-files=all -- ../../dist/
npm run apic -- render --all
git status --short --untracked-files=all -- ../../dist/
npm run apic -- test
```

Each `git status` must be empty. After changing canonical inputs or renderers, regenerate and commit all affected artifacts before pushing.
