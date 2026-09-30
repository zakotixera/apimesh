import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(removeTemporaryDirectory));
function fixture() { const dir = temporaryDirectory(); dirs.push(dir); return dir; }
function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../scripts', script), ...args], {
    encoding: 'utf8', timeout: 60000,
  });
}

describe('template and complete workflow', () => {
  it('distinguishes templates from complete and partially configured collections', () => {
    const dir = fixture();
    expect(run('collection-mode.cjs', [dir]).stdout.trim()).toBe('template');
    fs.mkdirSync(path.join(dir, 'apis'));
    fs.writeFileSync(path.join(dir, 'apis/README.md'), 'documentation');
    expect(run('collection-mode.cjs', [dir]).stdout.trim()).toBe('template');
    fs.writeFileSync(path.join(dir, 'collection.json'), '{}');
    expect(run('collection-mode.cjs', [dir]).status).toBe(1);
    fs.writeFileSync(path.join(dir, 'glossary.json'), '{}');
    expect(run('collection-mode.cjs', [dir]).stdout.trim()).toBe('collection');
  });

  it.each(['apis/x/definition.json', 'dist/docs/x.md'])('does not skip checks when metadata is missing but %s remains', (name) => {
    const dir = fixture();
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{}');
    expect(run('collection-mode.cjs', [dir]).status).toBe(1);
  });

  it('extracts, validates, renders twice, replays every recording and compares baseline drift', () => {
    const dir = fixture();
    const file = path.join(dir, 'capture with spaces.har');
    const entry = (index: number, postData: object, content: object) => ({
      startedDateTime: `2026-01-01T00:00:0${index}Z`,
      request: { method: 'POST', url: 'https://example.invalid/recorded?token=synthetic-secret', postData,
        headers: [{ name: ':method', value: 'POST' }, { name: ':authority', value: 'example.invalid' }] },
      response: { status: 200, content, headers: [{ name: 'content-encoding', value: index % 2 ? 'br' : 'gzip' },
        { name: ':status', value: '200' }, { name: 'content-length', value: '12345' }] },
    });
    const har = { log: { version: '1.2', entries: [
      entry(0, { mimeType: 'application/json', text: '{"id":9007199254740993123,"password":"synthetic-secret"}' }, { mimeType: 'application/json', text: '{ "code": 0, "value": 1 }' }),
      entry(1, { mimeType: 'application/json', text: '{"id":9007199254740993124}' }, { mimeType: 'application/json', text: '{"code":0,"value":2}' }),
      entry(2, { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'q', value: 'one' }, { name: 'q', value: 'two' }] }, { mimeType: 'application/json', text: '{"message":"HTTP only"}' }),
      entry(3, { mimeType: 'multipart/form-data', params: [{ name: 'q', value: 'one' }, { name: 'q', value: 'two' }] }, { mimeType: 'application/json', text: 'null' }),
    ] } };
    fs.writeFileSync(file, JSON.stringify(har));
    const before = fs.readFileSync(file);
    const result = run('check-har.cjs', [file]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ sourceEntries: 4, recordings: 4, endpoints: 1, additionalRecordings: 2,
      validation: 'passed', extractionStability: 'passed', renderStability: 'passed', replay: 'passed', captureFidelity: 'passed', baselineDrift: 'none' });
    expect(fs.readFileSync(file)).toEqual(before);
  }, 60000);
});
