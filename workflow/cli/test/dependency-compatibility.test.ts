import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

// Newman pins older transitive packages; exercise the APIs covered by our overrides.
describe('Newman dependency compatibility', () => {
  it('generates every Postman dynamic variable with the overridden Faker version', () => {
    const generators = require('postman-collection/lib/superstring/dynamic-variables') as
      Record<string, { generator: () => unknown }>;
    expect(Object.keys(generators).length).toBeGreaterThan(0);
    for (const [name, { generator }] of Object.entries(generators)) {
      expect(typeof generator, name).toBe('function');
      const value = generator();
      expect(value, name).toBeDefined();
      expect(value, name).not.toBeNull();
    }
  });

  it('preserves decorated error reporting with the overridden UUID version', () => {
    const SerialisedError = require('serialised-error');
    const error = new SerialisedError(new Error('synthetic failure'), true);
    expect(error.name).toBe('Error');
    expect(error.message).toBe('synthetic failure');
    expect(error.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(error.stacktrace.length).toBeGreaterThan(0);
    expect(error.checksum).toMatch(/^[0-9a-f]{32}$/i);
  });
});
