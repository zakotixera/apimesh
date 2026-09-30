/** Deterministic JSON serialization: recursively sort object keys, preserve array order, indent by two spaces, and end with a newline. */

/** Compare strings without locale-dependent ordering. */
export function compareCodepoint(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Recursively sort object keys while preserving array order. */
export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortKeysDeep);
  }
  if (value !== null && typeof value === 'object') {
    const src = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(src).sort(compareCodepoint)) {
      out[key] = sortKeysDeep(src[key]);
    }
    return out;
  }
  return value;
}

/** Serialize stable JSON with a trailing newline. */
export function stableStringify(value: unknown, indent = 2): string {
  return `${JSON.stringify(sortKeysDeep(value), null, indent)}\n`;
}
