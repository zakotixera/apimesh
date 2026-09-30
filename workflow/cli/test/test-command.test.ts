import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canonical from '../src/lib/canonical';
import * as paths from '../src/lib/paths';
import * as replay from '../src/mock/replay';
import { testCommand } from '../src/test';
import { POSTMAN_COLLECTION_FILE, POSTMAN_ENVIRONMENT_FILE } from '../src/renderers/postman';
import { corpus, example, removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const run = vi.hoisted(() => vi.fn());
vi.mock('newman', () => ({ default: { run } }));
const directories: string[] = [];
const originalExitCode = process.exitCode;
afterEach(() => {
  vi.restoreAllMocks();
  run.mockReset();
  process.exitCode = originalExitCode;
  directories.splice(0).forEach(removeTemporaryDirectory);
});

function setup(remaining: string[] = [], failures = 0) {
  process.exitCode = 0;
  const root = temporaryDirectory();
  directories.push(root);
  const project = paths.projectPaths(root);
  for (const file of [POSTMAN_COLLECTION_FILE, POSTMAN_ENVIRONMENT_FILE]) {
    const target = path.join(project.dist, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, '{}');
  }
  vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
  vi.spyOn(canonical, 'loadCorpus').mockReturnValue(corpus([example()]));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const close = vi.fn(async () => {});
  vi.spyOn(replay, 'startReplayServer').mockResolvedValue({ url: 'http://127.0.0.1:1', close, remaining, failures });
  return close;
}

describe('test command failure accounting and cleanup', () => {
  it('fails when Newman executes zero assertions', async () => {
    const close = setup();
    run.mockImplementation((_options, callback) => callback(null, { run: { failures: [], stats: { assertions: { total: 0, failed: 0 } } } }));
    await testCommand().parseAsync([], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(close).toHaveBeenCalledOnce();
  });
  it('fails when stale artifacts omit canonical recordings despite passing assertions', async () => {
    setup(['x.test%3A0.json']);
    run.mockImplementation((_options, callback) => callback(null, { run: { failures: [], stats: { assertions: { total: 3, failed: 0 } } } }));
    await testCommand().parseAsync([], { from: 'user' });
    expect(process.exitCode).toBe(1);
  });
  it('fails on replay mismatches even when legacy assertions accept the response', async () => {
    setup([], 1);
    run.mockImplementation((_options, callback) => callback(null, { run: { failures: [], stats: { assertions: { total: 2, failed: 0 } } } }));
    await testCommand().parseAsync([], { from: 'user' });
    expect(process.exitCode).toBe(1);
    expect(run.mock.calls[0][0].ignoreRedirects).toBe(true);
  });
  it('closes the replay server when Newman throws synchronously', async () => {
    const close = setup();
    run.mockImplementation(() => { throw new Error('synthetic Newman startup failure'); });
    await expect(testCommand().parseAsync([], { from: 'user' })).rejects.toThrow('startup failure');
    expect(close).toHaveBeenCalledOnce();
  });
});
