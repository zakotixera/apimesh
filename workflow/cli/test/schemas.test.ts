import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { projectPaths } from '../src/lib/paths';
import { loadSchemas } from '../src/lib/schemas';
import { corpus } from './fixtures';

// Exercise the shared schema contract without loading any application corpus.
const schemas = loadSchemas(projectPaths(path.resolve(import.meta.dirname, '../../..')));

describe('canonical JSON schemas', () => {
  it('accepts a synthetic endpoint definition', () => {
    expect(schemas.definition(corpus([]).apis[0].definition)).toEqual([]);
  });

  it('rejects an unknown key on a variant', () => {
    const definition = corpus([]).apis[0].definition;
    definition.responses[0] = { ...definition.responses[0], bogus: 1 } as typeof definition.responses[0];
    expect(schemas.definition(definition).length).toBeGreaterThan(0);
  });
});
