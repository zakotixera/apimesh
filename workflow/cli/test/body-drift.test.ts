import { describe, expect, it } from 'vitest';
import { compareBody } from '../src/lib/body-drift';
import type { BodyNode } from '../src/lib/types';

const schema: BodyNode = { type: 'object', properties: {
  code: { type: 'number' }, data: { type: 'array', items: {
    type: 'object', properties: { value: { type: ['number', 'null'] } },
  } },
} };
describe('BodyNode drift', () => {
  it('does not compare data fields to type/properties metadata', () => {
    expect(compareBody({ code: 0, data: [{ value: 2 }, { value: null }] }, schema)).toEqual([]);
  });
  it('reports nested type changes with a stable path and deduplicates array observations', () => {
    expect(compareBody({ code: 0, data: [{ value: '2' }, { value: '3' }] }, schema)).toEqual([
      { kind: 'breaking', path: '$["data"][]["value"]', detail: 'Observed type string; expected number | null' },
    ]);
  });
  it('reports additions and keeps absence advisory without a required contract', () => {
    expect(compareBody({ code: 0, extra: 1 }, schema).map((c) => c.kind)).toEqual(['non-breaking', 'noise']);
  });
  it('handles root type changes, empty arrays and unknown item schemas', () => {
    expect(compareBody([], schema)[0].kind).toBe('breaking');
    expect(compareBody({ code: 0, data: [] }, schema)).toEqual([]);
    expect(compareBody([1, {}], { type: 'array', items: null })).toEqual([]);
    expect(compareBody({ anything: true }, null)).toEqual([]);
  });
});
