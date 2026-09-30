import type { BodyNode, BodyNodeType, DriftChange } from './types';

export interface BodyChange {
  kind: DriftChange['kind'];
  path: string;
  detail: string;
}

/** Compare observed data with a BodyNode, not with the node's metadata keys. */
export function compareBody(body: unknown, schema: BodyNode | null, at = '$'): BodyChange[] {
  if (!schema || !schema.type) return [];
  const actual: BodyNodeType = body === null ? 'null' : Array.isArray(body) ? 'array' : typeof body as BodyNodeType;
  const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
  if (!expected.includes(actual)) {
    return [{ kind: 'breaking', path: at, detail: `Observed type ${actual}; expected ${expected.join(' | ')}` }];
  }
  if (actual === 'array') {
    if (!schema.items) return [];
    const changes = (body as unknown[]).flatMap((item) => compareBody(item, schema.items!, `${at}[]`));
    return [...new Map(changes.map((change) => [JSON.stringify(change), change])).values()];
  }
  if (actual !== 'object' || !schema.properties) return [];
  const value = body as Record<string, unknown>;
  const changes: BodyChange[] = [];
  for (const key of Object.keys(value).sort()) {
    const field = `${at}[${JSON.stringify(key)}]`;
    if (!Object.hasOwn(schema.properties, key)) {
      changes.push({ kind: 'non-breaking', path: field, detail: 'New observed field' });
    } else {
      changes.push(...compareBody(value[key], schema.properties[key], field));
    }
  }
  for (const key of Object.keys(schema.properties).sort()) {
    if (!Object.hasOwn(value, key)) {
      // BodyNode has no required-field contract. Absence in one sample is advisory.
      changes.push({ kind: 'noise', path: `${at}[${JSON.stringify(key)}]`, detail: 'Field absent in this sample; requiredness is unknown' });
    }
  }
  return changes;
}
