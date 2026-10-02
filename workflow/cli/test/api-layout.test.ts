import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { endpointDirectory } from '../src/lib/api-layout';
import { renderDocs } from '../src/renderers/docs';
import { renderAgent } from '../src/renderers/agent';
import { renderPostman } from '../src/renderers/postman';
import { projectPaths } from '../src/lib/paths';
import { corpus, example } from './fixtures';

describe('host categories', () => {
  it.each([
    ['https://api.example.invalid/catalog/items', 'api.example.invalid/catalog/items'],
    ['https://API.example.invalid/', 'api.example.invalid'],
    ['http://localhost:8080/x', 'localhost%3A8080/x'],
    ['http://[::1]:8080/x', '%5B%3A%3A1%5D%3A8080/x'],
    ['https://api.example.invalid./x', 'api.example.invalid%2E/x'],
    ['http://con/x', '%63on/x'],
  ])('maps %s to a portable host directory', (url, expected) => {
    expect(endpointDirectory(url)).toBe(expected);
  });

  it('keeps hosts, root endpoints and shared index names distinct with working links', () => {
    const data = corpus([]);
    data.paths = projectPaths(path.resolve(import.meta.dirname, '../../..'));
    data.apis = ['https://a.invalid/', 'https://a.invalid/summary', 'https://b.invalid/summary',
      'http://localhost:8080/summary', 'http://[::1]:8080/summary'].map((url, i) => {
      const api = corpus([example({ url })]).apis[0];
      api.definition.api = `host.endpoint-${i}`;
      api.definition.endpoint = { method: 'POST', path: new URL(url).pathname, url };
      api.relDir = endpointDirectory(url);
      return api;
    });
    const docs = renderDocs(data);
    const agent = renderAgent(data);
    const files = [...docs, ...agent];
    const targets = new Set(files.map((f) => `dist/${f.path}`));
    for (const api of data.apis) {
      targets.add(`apis/${api.relDir}/definition.json`);
      targets.add(`apis/${api.relDir}/examples/0.json`);
    }
    expect(targets.has('dist/docs/endpoints/a.invalid/index.md')).toBe(true);
    expect(targets.has('dist/agent/endpoints/b.invalid/summary/index.json')).toBe(true);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    for (const file of files.filter((f) => f.path.endsWith('.md'))) {
      for (const match of file.content.matchAll(/\]\(([^)]+)\)/g)) {
        if (match[1].startsWith('#')) continue;
        // Usage also links the independently generated Postman artifacts.
        const target = path.posix.normalize(path.posix.join('dist', path.posix.dirname(file.path), decodeURIComponent(match[1])));
        expect(targets.has(target) || target.startsWith('dist/postman/'), target).toBe(true);
      }
    }
    const entries = JSON.parse(agent[0].content).apis;
    for (const entry of entries) {
      expect(targets.has(entry.detailFile)).toBe(true);
      expect(targets.has(entry.docsFile)).toBe(true);
      expect(targets.has(entry.definitionFile)).toBe(true);
    }
    const postman = JSON.parse(renderPostman(data)[0].content);
    expect(postman.item.map((host: { name: string }) => host.name)).toEqual(['[::1]:8080', 'a.invalid', 'b.invalid', 'localhost:8080']);
    expect(postman.item.find((host: { name: string }) => host.name === 'a.invalid').item).toHaveLength(2);
    expect(renderDocs(data)).toEqual(docs);
    expect(renderAgent(data)).toEqual(agent);
  });
});
