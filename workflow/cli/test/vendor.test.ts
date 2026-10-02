import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { corpus, example, removeTemporaryDirectory, temporaryDirectory } from './fixtures';
import { walk } from '../src/lib/fsx';

const dirs: string[] = [];
const toolkit = path.resolve(import.meta.dirname, '../../..');
afterEach(() => dirs.splice(0).forEach(removeTemporaryDirectory));
function scratch() { const dir = temporaryDirectory(); dirs.push(dir); return dir; }
function write(root: string, name: string, data: unknown) {
  const file = path.join(root, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data));
}
function snapshot(root: string) {
  return walk(root).map((file) => [path.relative(root, file), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
}
function vendor(root: string) {
  for (const dir of ['schema', 'workflow/cli/dist', 'workflow/cli/scripts', 'workflow/templates']) {
    fs.cpSync(path.join(toolkit, dir), path.join(root, dir), { recursive: true });
  }
}
function invoke(vendorRoot: string, cwd: string, args: string[]) {
  return spawnSync(process.execPath, [path.join(vendorRoot, 'workflow/cli/dist/cli.js'), ...args], {
    cwd, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, NODE_PATH: [path.join(toolkit, 'workflow/cli/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) },
  });
}
function check(result: ReturnType<typeof invoke>) {
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr + result.stdout).toBe(0);
}
function populate(root: string) {
  const ex = example();
  ex.request.query = [{ name: 'a', value: '1' }, { name: 'a', value: '2' }];
  ex.response.headers = { 'content-type': 'application/json' };
  const data = corpus([ex]);
  const definition = data.apis[0].definition;
  definition.endpoint.url = 'https://example.invalid/x';
  definition.request = { headers: {}, query: {}, body: {} };
  definition.responses[0].examples = ['200.code0.ok.json'];
  write(root, 'collection.json', data.collection);
  write(root, 'glossary.json', { domains: [{ slug: 'ok', meaning: 'Synthetic success' }] });
  write(root, 'apis/example.invalid/x/definition.json', definition);
  write(root, 'apis/example.invalid/x/examples/200.code0.ok.json', ex);
  write(root, 'sources/capture with spaces.har', { log: { version: '1.2', entries: [{
    startedDateTime: ex.captured,
    request: { method: ex.request.method, url: ex.request.url,
      headers: [{ name: 'content-type', value: 'application/json' }],
      postData: { mimeType: 'application/json', text: JSON.stringify(ex.request.body) } },
    response: { status: 200, headers: [{ name: 'content-type', value: 'application/json' }],
      content: { mimeType: 'application/json', text: JSON.stringify(ex.response.body) } },
  }] } });
  // Collection-local schema copies must never control validation or exports.
  write(root, 'schema/example.schema.json', { not: {} });
}

describe('vendored and external toolchains', () => {
  it.each([true, false])('runs the full workflow without writing to the toolchain (nested: %s)', (nested) => {
    const base = scratch();
    const root = path.join(base, 'application with spaces');
    const installed = nested ? path.join(root, 'vendor/apimesh') : path.join(base, 'external toolkit');
    vendor(installed);
    populate(root);
    const vendorBefore = snapshot(installed);
    const sourceBefore = snapshot(path.join(root, 'sources'));
    const canonicalBefore = snapshot(path.join(root, 'apis'));
    const run = (...args: string[]) => { const result = invoke(installed, root, args); check(result); return result; };

    run('--root', '.', 'extract', 'sources/capture with spaces.har');
    expect(walk(path.join(root, '.raw')).length).toBeGreaterThan(0);
    run('--root', '.', 'validate');
    run('--root', '.', 'render', '--all');
    const first = snapshot(path.join(root, 'dist'));
    run('render', '--all', '--root', '.');
    expect(snapshot(path.join(root, 'dist'))).toEqual(first);
    const usage = fs.readFileSync(path.join(root, 'dist/docs/usage.md'), 'utf8');
    expect(usage).toContain(nested ? 'node "vendor/apimesh/workflow/cli/dist/cli.js" --root . serve' : 'apic --root . serve');
    expect(usage).not.toContain(base);
    expect(JSON.parse(fs.readFileSync(path.join(root, 'dist/agent/schema/example.schema.json'), 'utf8')))
      .toEqual(JSON.parse(fs.readFileSync(path.join(installed, 'schema/example.schema.json'), 'utf8')));
    run('--root', '.', 'drift', 'sources/capture with spaces.har');
    run('--root', '.', 'test');
    run('--root', '.', 'verify', '--no-strict');

    // Explicit roots from unrelated directories must work; relative inputs/outputs stay caller-relative.
    check(invoke(installed, base, ['--root', root, 'extract', path.relative(base, path.join(root, 'sources/capture with spaces.har')), '--out', 'custom drafts']));
    expect(walk(path.join(base, 'custom drafts')).length).toBeGreaterThan(0);
    expect(fs.existsSync(path.join(root, 'custom drafts'))).toBe(false);
    check(invoke(installed, path.join(root, 'apis/example.invalid'), ['validate']));
    if (nested) {
      check(invoke(installed, path.join(installed, 'workflow/templates'), ['validate']));
    }
    expect(snapshot(installed)).toEqual(vendorBefore);
    expect(snapshot(path.join(root, 'sources'))).toEqual(sourceBefore);
    expect(snapshot(path.join(root, 'apis'))).toEqual(canonicalBefore);

    // A copied installation uses its own pinned schemas, not the developer checkout's.
    write(installed, 'schema/example.schema.json', { not: {} });
    expect(invoke(installed, root, ['validate']).status).toBe(1);
  }, 60000);

  it('fails at an explicit missing collection instead of writing to its populated ancestor', () => {
    const root = scratch(); populate(root);
    const empty = path.join(root, 'empty'); fs.mkdirSync(empty);
    const before = snapshot(root);
    const result = invoke(toolkit, root, ['--root', empty, 'validate']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Missing collection.json: ${path.join(empty, 'collection.json')}`);
    expect(snapshot(root)).toEqual(before);
  });
});
