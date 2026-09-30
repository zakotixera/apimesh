import { describe, expect, it } from 'vitest';
import { maskConfigFromCollection, maskCookieHeader, maskUrl, scanPlaceholders } from '../src/lib/mask';
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
  bases: { web: 'https://api.example.invalid' },
  auth: {
    SESSION_ID: { kind: 'cookie', name: 'SESSION_ID', doc: '' },
    csrf_token: { kind: 'cookie', name: 'csrf_token', doc: '' },
  },
  changelog: [],
};

describe('masking', () => {
  it('masks registered cookie values inside a Cookie header', () => {
    const cfg = maskConfigFromCollection(collection);
    expect(maskCookieHeader('SESSION_ID=secret; other=1; csrf_token=csrf', cfg)).toBe(
      'SESSION_ID={{SESSION_ID}}; other=1; csrf_token={{csrf_token}}',
    );
  });

  it('masks registered query values without percent-encoding the placeholder', () => {
    const cfg = maskConfigFromCollection(collection);
    expect(maskUrl('https://api.example.invalid/x?a=1&SESSION_ID=secret', cfg)).toBe(
      'https://api.example.invalid/x?a=1&SESSION_ID={{SESSION_ID}}',
    );
  });

  it('scans placeholders recursively', () => {
    const found = [...scanPlaceholders({ h: '{{A}}', list: ['{{B}}'] })].sort();
    expect(found).toEqual(['A', 'B']);
  });
});
