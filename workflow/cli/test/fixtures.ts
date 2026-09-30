import fs from 'node:fs';
import path from 'node:path';
import type { LoadedCorpus } from '../src/lib/canonical';
import { projectPaths } from '../src/lib/paths';
import type { Example, ExampleRequest } from '../src/lib/types';

export const testRoot = path.resolve(import.meta.dirname);
export function temporaryDirectory(): string {
  return fs.mkdtempSync(path.join(testRoot, '.cli-test-'));
}
export function removeTemporaryDirectory(dir: string): void {
  const resolved = path.resolve(dir);
  if (path.dirname(resolved) !== testRoot || !path.basename(resolved).startsWith('.cli-test-')) {
    throw new Error('Refusing to remove a path outside the test directory');
  }
  fs.rmSync(resolved, { recursive: true, force: true });
}

export function example(request: Partial<ExampleRequest> = {}): Example {
  return {
    http: 200, code: 0, captured: '2026-01-01T00:00:00Z', account: 'anonymous',
    request: { method: 'POST', url: 'https://example.invalid/x?a=1&a=2', body: { item: 1 },
      headers: { 'content-type': 'application/json' }, ...request },
    response: { status: 200, body: { code: 0, data: 'recorded' } },
  };
}

export function corpus(examples: Example[]): LoadedCorpus {
  return {
    paths: projectPaths(testRoot),
    collection: { name: 'test', version: '1.0.0', bases: { web: 'https://example.invalid' }, changelog: [] },
    glossary: { domains: [] },
    apis: [{
      dir: '', file: '', relFile: '', relDir: 'x',
      definition: { api: 'x.test', name: 'Test', endpoint: { method: 'POST', path: '/x' }, source: 'test',
        responses: [{ variant: 'ok', status: 'success', codes: [0], http: [200], schema: null,
          examples: examples.map((_, i) => `${i}.json`) }] },
      examples: examples.map((data, i) => ({ name: `${i}.json`, file: '', relFile: '', data })),
    }],
  };
}
