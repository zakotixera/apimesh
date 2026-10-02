import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { corpus, example } from './fixtures';
import { outputSnapshot } from '../src/lib/output-snapshot';

const toolkit = path.resolve(import.meta.dirname, '../../..');
const cli = path.join(toolkit, 'workflow/cli/dist/cli.js');
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('apimesh-bootstrap-')) throw new Error('Unsafe test cleanup');
    fs.rmSync(root, { recursive: true, force: true });
  }
});
function scratch() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apimesh-bootstrap-'));
  roots.push(root);
  return root;
}
function invoke(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [cli, '--root', root, ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });
}
function pass(result: ReturnType<typeof invoke>) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr + result.stdout).toBe(0);
}
function write(root: string, file: string, data: unknown) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(data));
}
function populate(root: string) {
  const ex = example({ query: [{ name: 'a', value: '1' }, { name: 'a', value: '2' }] });
  ex.response.headers = { 'content-type': 'application/json' };
  const data = corpus([ex]);
  const def = data.apis[0].definition;
  def.endpoint.url = 'https://example.invalid/x';
  def.request = { headers: {}, query: {}, body: {} };
  def.responses[0].examples = ['200.code0.ok.json'];
  def.responses[0].schema = { type: 'object', properties: { code: { type: 'number' }, data: { type: 'string' } } };
  write(root, 'collection.json', data.collection);
  write(root, 'glossary.json', { domains: [{ slug: 'ok', meaning: 'Synthetic success' }] });
  write(root, 'apis/example.invalid/x/definition.json', def);
  write(root, 'apis/example.invalid/x/examples/200.code0.ok.json', ex);
}
function git(root: string, ...args: string[]) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
}

describe('collection bootstrap', () => {
  it('previews without writes, initializes valid starters, and preserves every existing file on repeat', () => {
    const root = scratch();
    pass(invoke(root, 'init', '--name', 'Display "name"', '--dry-run'));
    expect(fs.readdirSync(root)).toEqual([]);
    pass(invoke(root, 'init', '--name', 'Display "name"'));
    pass(invoke(root, 'validate', '--strict'));
    expect(JSON.parse(fs.readFileSync(path.join(root, 'collection.json'), 'utf8')).name).toBe('Display "name"');
    expect(fs.existsSync(path.join(root, 'IMPORT.md'))).toBe(false);
    expect(fs.existsSync(path.join(root, 'scripts'))).toBe(false);
    const workflow = parse(fs.readFileSync(path.join(root, '.github/workflows/verify.yml'), 'utf8'));
    expect(workflow.jobs.verify.steps.at(-1).run).toBe('npm run verify -- --committed');
    fs.writeFileSync(path.join(root, 'package.json'), 'custom package bytes\r\n');
    const before = outputSnapshot(root);
    pass(invoke(root, 'init', '--name', 'Different name'));
    expect(outputSnapshot(root)).toEqual(before);
    expect(invoke(root, 'verify').status).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.reports/verify.json'), 'utf8'))).toMatchObject({ ok: false, stages: expect.arrayContaining([{ stage: 'replay', status: 'failed' }]) });
  }, 30000);

  it('preflights all collisions and rejects toolchain destinations without partial writes', () => {
    const root = scratch();
    fs.mkdirSync(path.join(root, 'package.json'));
    expect(invoke(root, 'init').status).toBe(1);
    expect(fs.readdirSync(root)).toEqual(['package.json']);
    const result = invoke(toolkit, 'init', '--dry-run');
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('outside the toolchain');
  });

  it('rejects junctions before writing through them', () => {
    const root = scratch();
    const outside = scratch();
    fs.symlinkSync(outside, path.join(root, '.github'), process.platform === 'win32' ? 'junction' : 'dir');
    expect(invoke(root, 'init').status).toBe(1);
    expect(fs.readdirSync(outside)).toEqual([]);
    expect(fs.existsSync(path.join(root, 'collection.json'))).toBe(false);
  });

  it('restores npm caller cwd and supports a vendor path containing spaces', () => {
    const root = scratch();
    const vendor = path.join(root, 'vendor/shared toolkit');
    for (const dir of ['schema', 'workflow/templates', 'workflow/cli/dist', 'workflow/cli/scripts']) {
      fs.cpSync(path.join(toolkit, dir), path.join(vendor, dir), { recursive: true });
    }
    const pkg = JSON.parse(fs.readFileSync(path.join(toolkit, 'workflow/cli/package.json'), 'utf8'));
    // The compiled fixture is already built; exercise the real npm init entry point.
    delete pkg.scripts.preinit;
    write(vendor, 'workflow/cli/package.json', pkg);
    const env = { ...process.env, NODE_PATH: path.join(toolkit, 'workflow/cli/node_modules') };
    const npm = process.env.npm_execpath!;
    expect(npm).toBeTruthy();
    const runNpm = (...args: string[]) => spawnSync(process.execPath, [npm, ...args], { cwd: root, env, encoding: 'utf8', timeout: 30000 });
    const before = outputSnapshot(vendor);
    pass(runNpm('--prefix', 'vendor/shared toolkit/workflow/cli', 'run', 'init', '--', '--root', '.', '--name', 'Via npm'));
    expect(outputSnapshot(vendor)).toEqual(before);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'collection.json'), 'utf8')).name).toBe('Via npm');
    pass(runNpm('run', 'validate', '--', '--strict'));
    populate(root);
    pass(runNpm('run', 'verify'));
    expect(outputSnapshot(vendor)).toEqual(before);
  }, 60000);
});

describe('shared verification', () => {
  it('stops on validation failure before rendering existing outputs', () => {
    const root = scratch();
    pass(invoke(root, 'init'));
    write(root, 'collection.json', { invalid: true });
    write(root, 'dist/docs/keep.json', { handwritten: true });
    const before = outputSnapshot(path.join(root, 'dist'));
    expect(invoke(root, 'verify').status).toBe(1);
    expect(outputSnapshot(path.join(root, 'dist'))).toEqual(before);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.reports/verify.json'), 'utf8')).stages.at(-1)).toEqual({ stage: 'validate', status: 'failed' });
  });

  it('verifies locally and rejects staged, untracked, ignored and stale committed outputs', () => {
    const root = scratch();
    pass(invoke(root, 'init'));
    populate(root);
    const canonical = outputSnapshot(path.join(root, 'apis'));
    pass(invoke(root, 'verify'));
    expect(outputSnapshot(path.join(root, 'apis'))).toEqual(canonical);
    git(root, 'init');
    git(root, 'add', '.');
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'fixture');
    pass(invoke(root, 'verify', '--committed'));
    for (const mode of ['untracked', 'staged', 'ignored']) {
      write(root, 'dist/extra.json', { mode });
      if (mode === 'staged') git(root, 'add', 'dist/extra.json');
      if (mode === 'ignored') fs.appendFileSync(path.join(root, '.gitignore'), '\n/dist/extra.json\n');
      expect(invoke(root, 'verify', '--committed').status, mode).toBe(1);
      expect(fs.existsSync(path.join(root, 'dist/extra.json'))).toBe(true);
      if (mode === 'staged') git(root, 'reset', '--', 'dist/extra.json');
      fs.unlinkSync(path.join(root, 'dist/extra.json'));
    }
    // Clean Git state can still contain stale artifacts: rendering must detect this.
    fs.appendFileSync(path.join(root, 'dist/docs/summary.md'), '\nStale committed text\n');
    git(root, 'add', 'dist/docs/summary.md');
    git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-m', 'stale output');
    expect(invoke(root, 'verify', '--committed').status).toBe(1);
    expect(JSON.parse(fs.readFileSync(path.join(root, '.reports/verify.json'), 'utf8')).stages.at(-1)).toEqual({ stage: 'committed-first', status: 'failed' });
  }, 60000);
});
