import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { readJson } from '../src/lib/fsx';
import { maskConfigFromCollection, maskCookieHeader, maskUrl, scanPlaceholders } from '../src/lib/mask';
import { findRepoRoot, projectPaths } from '../src/lib/paths';
import { loadSchemas } from '../src/lib/schemas';
import { stableStringify } from '../src/lib/stable-json';
import type { Collection } from '../src/lib/types';

describe('stableStringify (I4 byte stability)', () => {
  it('sorts object keys deterministically and ends with a single newline', () => {
    const a = stableStringify({ b: 1, a: { d: 2, c: 3 } });
    const b = stableStringify({ a: { c: 3, d: 2 }, b: 1 });
    expect(a).toBe(b);
    expect(a.endsWith('\n')).toBe(true);
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"b"'));
  });

  it('preserves array order', () => {
    expect(stableStringify([3, 1, 2])).toBe('[\n  3,\n  1,\n  2\n]\n');
  });
});

const collection: Collection = {
  name: 'test',
  version: '0.0.0',
  bases: { web: 'https://api.bilibili.com' },
  auth: {
    SESSDATA: { kind: 'cookie', name: 'SESSDATA', doc: '' },
    bili_jct: { kind: 'cookie', name: 'bili_jct', doc: '' },
  },
  changelog: [],
};

describe('masking', () => {
  it('masks registered cookie values inside a Cookie header', () => {
    const cfg = maskConfigFromCollection(collection);
    expect(maskCookieHeader('SESSDATA=secret; other=1; bili_jct=csrf', cfg)).toBe(
      'SESSDATA={{SESSDATA}}; other=1; bili_jct={{bili_jct}}',
    );
  });

  it('masks registered query values without percent-encoding the placeholder', () => {
    const cfg = maskConfigFromCollection(collection);
    expect(maskUrl('https://api.bilibili.com/x?a=1&SESSDATA=secret', cfg)).toBe(
      'https://api.bilibili.com/x?a=1&SESSDATA={{SESSDATA}}',
    );
  });

  it('scans placeholders recursively', () => {
    const found = [...scanPlaceholders({ h: '{{A}}', list: ['{{B}}'] })].sort();
    expect(found).toEqual(['A', 'B']);
  });
});

describe('json schemas', () => {
  const paths = projectPaths(findRepoRoot());
  const schemas = loadSchemas(paths);

  it('accepts the seed definition', () => {
    const def = readJson(path.join(paths.apis, 'x', 'web-interface', 'view', 'definition.json'));
    expect(schemas.definition(def)).toEqual([]);
  });

  it('rejects an unknown key on a variant', () => {
    const def = {
      api: 'x.y',
      name: 'n',
      endpoint: { method: 'GET', path: '/x' },
      source: 's',
      responses: [
        { variant: 'ok', status: 'm', codes: [0], http: [200], schema: null, examples: [], bogus: 1 },
      ],
    };
    expect(schemas.definition(def).length).toBeGreaterThan(0);
  });
});
