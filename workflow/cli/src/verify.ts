import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Command } from 'commander';
import { resolvePaths } from './lib/paths';
import { writeJsonStable } from './lib/fsx';
import { assertUnlinkedPath, outputSnapshot } from './lib/output-snapshot';

interface VerifyOptions { committed?: boolean; strict: boolean; timeout: string }

function checkCommitted(root: string): void {
  const git = (...args: string[]): string => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`verify --committed requires a Git repository with a commit: ${result.stderr.trim()}`);
    return result.stdout;
  };
  git('rev-parse', '--verify', 'HEAD');
  const changed = git('status', '--porcelain=v1', '--untracked-files=all', '--', 'dist/');
  const ignored = git('ls-files', '--others', '--ignored', '--exclude-standard', '--', 'dist/');
  if (changed.trim() || ignored.trim()) throw new Error('Generated outputs differ from committed dist/. Render, review and commit the outputs before verify --committed.');
}

/** Run existing commands in isolated processes so their failures cannot be reset by a later stage. */
export function verifyCommand(): Command {
  return new Command('verify')
    .description('Validate strictly, render twice, compare all output bytes and replay recordings')
    .option('--committed', 'Require dist/ to match Git HEAD before and after rendering')
    .option('--no-strict', 'Allow validation warnings (errors still fail)')
    .option('--timeout <ms>', 'Replay per-request timeout in milliseconds', '10000')
    .action((options: VerifyOptions, command: Command) => {
      const paths = resolvePaths(undefined, command.optsWithGlobals().root);
      const stages: Array<{ stage: string; status: 'passed' | 'failed' }> = [];
      const report = { command: 'verify', ok: false, strict: options.strict, committed: !!options.committed, files: 0, stages };
      const reportFile = path.join(paths.reports, 'verify.json');
      assertUnlinkedPath(reportFile, paths.root);
      const stage = (name: string, action: () => void): void => {
        try { action(); stages.push({ stage: name, status: 'passed' }); }
        catch (error) { stages.push({ stage: name, status: 'failed' }); throw error; }
      };
      const run = (...args: string[]): void => {
        const result = spawnSync(process.execPath, [path.join(__dirname, 'cli.js'), '--root', paths.root, ...args], { cwd: paths.root, stdio: 'inherit' });
        if (result.error) throw result.error;
        if (result.status !== 0) throw new Error(`verify: ${args[0]} failed (${result.signal ?? result.status})`);
      };
      try {
        stage('output-paths', () => { outputSnapshot(paths.dist, paths.root); });
        if (options.committed) stage('committed-before', () => checkCommitted(paths.root));
        stage('validate', () => run('validate', ...(options.strict ? ['--strict'] : [])));
        stage('render-first', () => run('render', '--all'));
        if (options.committed) stage('committed-first', () => checkCommitted(paths.root));
        const before = outputSnapshot(paths.dist, paths.root);
        stage('render-second', () => run('render', '--all'));
        stage('stability', () => {
          const after = outputSnapshot(paths.dist, paths.root);
          if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error('Generated file paths or bytes changed between renders');
          report.files = after.length;
        });
        if (options.committed) stage('committed-second', () => checkCommitted(paths.root));
        stage('replay', () => run('test', '--timeout', options.timeout));
        report.ok = true;
        console.log(`verify: PASS / ${report.files} stable files / local replay passed (report: .reports/verify.json)`);
      } finally {
        writeJsonStable(reportFile, report);
      }
    });
}
