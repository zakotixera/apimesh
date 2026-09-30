/** Validate syntax without using parsed numbers or object assignments in the result. */
export function jsonTokens(text: string): RegExpMatchArray[] {
  JSON.parse(text);
  return [...text.matchAll(/"(?:\\.|[^"\\])*"|true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|[{}\[\]:,]/g)];
}

/** Normalize whitespace and object-key order without rounding numeric literals. */
export function jsonSignature(text: string): string {
  const tokens = jsonTokens(text);
  let cursor = 0;
  const read = (): string => {
    const token = tokens[cursor++][0];
    if (token === '{') {
      const entries: Array<[string, string]> = [];
      while (tokens[cursor][0] !== '}') {
        const key = JSON.stringify(JSON.parse(tokens[cursor++][0]));
        cursor += 1;
        entries.push([key, read()]);
        if (tokens[cursor][0] === ',') cursor += 1;
      }
      cursor += 1;
      entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
      return `{${entries.map(([key, value]) => `${key}:${value}`).join(',')}}`;
    }
    if (token === '[') {
      const values: string[] = [];
      while (tokens[cursor][0] !== ']') {
        values.push(read());
        if (tokens[cursor][0] === ',') cursor += 1;
      }
      cursor += 1;
      return `[${values.join(',')}]`;
    }
    return token.startsWith('"') ? JSON.stringify(JSON.parse(token)) : token;
  };
  return read();
}
