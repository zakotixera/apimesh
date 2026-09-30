import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parse } from 'yaml';
import { extractCommand } from '../src/extract';
import { driftCommand } from '../src/drift';
import * as paths from '../src/lib/paths';
import { temporaryDirectory, removeTemporaryDirectory } from './fixtures';

const directories: string[] = [];
afterEach(() => { vi.restoreAllMocks(); directories.splice(0).forEach(removeTemporaryDirectory); });
function fixture() {
  const dir = temporaryDirectory();
  directories.push(dir);
  const project = paths.projectPaths(dir);
  vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  fs.writeFileSync(project.collectionFile, JSON.stringify({ name: 'test', version: '1', bases: { web: 'https://example.invalid' }, changelog: [] }));
  fs.writeFileSync(project.glossaryFile, JSON.stringify({ domains: [] }));
  const input = path.join(dir, 'input.har');
  fs.writeFileSync(input, JSON.stringify({ log: { version: '1.2', entries: [{
    startedDateTime: '2026-01-01T00:00:00Z',
    request: { method: 'POST', url: 'https://example.invalid/x', postData: {
      mimeType: 'application/x-www-form-urlencoded', text: 'password=synthetic-secret&q=1&q=2',
    } },
    response: { status: 200, content: { mimeType: 'application/json', text: '{ "code": 0, "data": { "count": 2 } }' } },
  }] } }));
  return { dir, project, input };
}
describe('CLI commands with isolated fixtures', () => {
  it('extracts sanitized metadata and repeats safely without deleting user files', async () => {
    const { project, input } = fixture();
    await extractCommand().parseAsync([input], { from: 'user' });
    fs.writeFileSync(path.join(project.extract, 'notes.txt'), 'handwritten');
    await extractCommand().parseAsync([input], { from: 'user' });
    const output = fs.readFileSync(path.join(project.extract, 'POST.x.yaml'), 'utf8');
    expect(output).not.toContain('synthetic-secret');
    const frame = parse(output).endpoints[0].frames[0];
    expect(frame.request.body).toBe('password=%3Credacted%3Asecret%3E&q=1&q=2');
    expect(frame.request.bodyMeta.mimeType).toBe('application/x-www-form-urlencoded');
    expect(frame.response.body).toBe('{ "code": 0, "data": { "count": 2 } }');
    expect(frame.code).toBe(0);
    expect(fs.readFileSync(path.join(project.extract, 'notes.txt'), 'utf8')).toBe('handwritten');
  });
  it('reports no drift for a captured JSON response matching the BodyNode schema', async () => {
    const { project, input } = fixture();
    const apiDir = path.join(project.apis, 'x');
    fs.mkdirSync(apiDir, { recursive: true });
    fs.writeFileSync(path.join(apiDir, 'definition.json'), JSON.stringify({
      api: 'x.test', name: 'Test', endpoint: { method: 'POST', path: '/x' }, source: 'test',
      responses: [{ variant: 'ok', status: 'ok', codes: [0], http: [200], schema: {
        type: 'object', properties: { code: { type: 'number' }, data: { type: 'object', properties: { count: { type: 'number' } } } },
      } }],
    }));
    await driftCommand().parseAsync([input], { from: 'user' });
    expect(JSON.parse(fs.readFileSync(path.join(project.reports, 'drift-input.json'), 'utf8')).changes).toEqual([]);
  });
});
