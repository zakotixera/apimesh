import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';

const require = createRequire(import.meta.url);
const { runChecks, requireSuccessfulJobs } = require('../scripts/ci.cjs');
const toolkit = path.resolve(import.meta.dirname, '../../..');
const script = path.join(toolkit, 'workflow/cli/scripts/ci.cjs');

describe('CI process boundary', () => {
  it('builds before tests with the pinned local tools, regardless of caller cwd', () => {
    const run = vi.fn(() => ({ status: 0 }));
    runChecks(run);
    expect(run).toHaveBeenCalledTimes(2);
    const [build, test] = run.mock.calls as unknown as Array<[string, string[], { cwd: string; shell: boolean }]>;
    expect(build[0]).toBe(process.execPath);
    expect(build[1]).toContain('-p');
    expect(test[0]).toBe(process.execPath);
    expect(test[1]).toContain('--passWithNoTests=false');
    for (const call of [build, test]) {
      expect(path.isAbsolute(call[1][0])).toBe(true);
      expect(fs.existsSync(call[1][0])).toBe(true);
      expect(call[2]).toMatchObject({ cwd: path.join(toolkit, 'workflow/cli'), shell: false });
    }
  });

  it.each([
    { status: 2 },
    { status: null, signal: 'SIGTERM' },
    { status: null },
    { error: new Error('Cannot launch compiler') },
  ])('stops before tests when the build cannot succeed: %j', (failure) => {
    const run = vi.fn(() => failure);
    expect(() => runChecks(run)).toThrow();
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('propagates test failures after a successful build', () => {
    const run = vi.fn().mockReturnValueOnce({ status: 0 }).mockReturnValueOnce({ status: 1 });
    expect(() => runChecks(run)).toThrow('CI test failed');
  });
});

describe('required CI gate', () => {
  it('requires every named job to succeed', () => {
    expect(() => requireSuccessfulJobs(JSON.stringify({ checks: { result: 'success' }, additional: { result: 'success' } }))).not.toThrow();
    expect(() => requireSuccessfulJobs(JSON.stringify({ checks: { result: 'success' }, additional: { result: 'failure' } }))).toThrow('additional: failure');
  });

  it.each(['failure', 'cancelled', 'skipped', 'unknown', '', null])('fails closed for job result %j', (result) => {
    expect(() => requireSuccessfulJobs(JSON.stringify({ checks: { result } }))).toThrow();
  });

  it.each([undefined, '', 'invalid', 'null', '{}', '[]', 'true', '{"checks":null}', '{"checks":{}}'])('rejects missing or malformed needs: %j', (raw) => {
    expect(() => requireSuccessfulJobs(raw)).toThrow();
  });

  it('enforces the gate via its standalone entry point without loading installed tools', () => {
    for (const [result, status] of [['success', 0], ['skipped', 1]] as const) {
      const child = spawnSync(process.execPath, [script, 'gate'], {
        cwd: toolkit, encoding: 'utf8', env: { ...process.env, CI_NEEDS: JSON.stringify({ checks: { result } }) },
      });
      expect(child.status, child.stderr).toBe(status);
    }
    expect(spawnSync(process.execPath, [script, 'unknown'], { encoding: 'utf8' }).status).toBe(1);
  });
});

describe('GitHub workflow boundaries', () => {
  const upstream = parse(fs.readFileSync(path.join(toolkit, '.github/workflows/ci.yml'), 'utf8'));
  const collection = parse(fs.readFileSync(path.join(toolkit, 'workflow/templates/application/.github/workflows/verify.yml.tmpl'), 'utf8'));

  it.each([['toolchain', upstream], ['collection', collection]])('%s uses Ubuntu/Bash and only delegates commands', (_name, workflow) => {
    expect(workflow.defaults.run.shell).toBe('bash');
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(['push', 'pull_request', 'merge_group', 'workflow_dispatch']));
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow.jobs) as any[]) {
      expect(job['runs-on']).toBe('ubuntu-latest');
      for (const step of job.steps) {
        if (step.run) {
          expect(step.run).toMatch(/^(npm (ci|test|run [a-z-]+)|node scripts\/ci\.cjs gate)( -- --committed)?$/);
        }
        if (step.uses) expect(step.uses).toMatch(/@[a-f0-9]{40}$/);
      }
    }
  });

  it('keeps every upstream job behind the stable gate and executes it even on failures', () => {
    const gate = upstream.jobs.gate;
    const dependencies = Array.isArray(gate.needs) ? gate.needs : [gate.needs];
    expect(dependencies.sort()).toEqual(Object.keys(upstream.jobs).filter((key) => key !== 'gate').sort());
    expect(gate.if).toBe('${{ always() }}');
    expect(gate.steps.at(-1)).toMatchObject({ env: { CI_NEEDS: '${{ toJSON(needs) }}' }, run: 'node scripts/ci.cjs gate' });
    expect(upstream.jobs.checks.strategy.matrix.node).toContain(20);
  });
});
