import type { Collection, Headers } from './types';

/** Replace registered authentication values with named placeholders. Parse cookies individually, match header profiles, and recursively mask query/body fields. */

export interface MaskConfig {
  cookies: Set<string>;
  headers: Set<string>;
  /** All registered cookie and header names used for query/body matching. */
  all: Set<string>;
}

export function placeholder(name: string): string {
  return `{{${name}}}`;
}

export function maskConfigFromCollection(collection: Collection): MaskConfig {
  const cookies = new Set<string>();
  const headers = new Set<string>();
  for (const [key, profile] of Object.entries(collection.auth ?? {})) {
    const name = profile?.name ?? key;
    if (profile?.kind === 'header') headers.add(name);
    else cookies.add(name);
  }
  const all = new Set<string>([...cookies, ...headers]);
  return { cookies, headers, all };
}

/** Mask registered values in a semicolon-separated Cookie header. */
export function maskCookieHeader(value: string, cfg: MaskConfig): string {
  return value
    .split(';')
    .map((part) => {
      const trimmed = part.trim();
      if (!trimmed) return part;
      const eq = trimmed.indexOf('=');
      if (eq < 0) return trimmed;
      const name = trimmed.slice(0, eq);
      if (!cfg.cookies.has(name)) return trimmed;
      return `${name}=${placeholder(name)}`;
    })
    .filter((p) => p.length > 0)
    .join('; ');
}

/** Mask cookie pairs and replace registered header values. */
export function maskHeaders(
  headers: Headers | undefined,
  cfg: MaskConfig,
): Headers | undefined {
  if (!headers) return headers;
  const out: Headers = Object.create(null);
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      out[name] = value.map((v) => maskHeaders({ [name]: v }, cfg)![name] as string);
      continue;
    }
    if (name.toLowerCase() === 'cookie') {
      out[name] = maskCookieHeader(value, cfg);
    } else if ([...cfg.headers].some((registered) => registered.toLowerCase() === name.toLowerCase())) {
      const registered = [...cfg.headers].find((key) => key.toLowerCase() === name.toLowerCase())!;
      out[name] = placeholder(registered);
    } else {
      out[name] = value;
    }
  }
  return out;
}

/** Mask registered URL query values, keeping placeholders readable. */
export function maskUrl(url: string, cfg: MaskConfig): string {
  const qIndex = url.indexOf('?');
  if (qIndex < 0) return url;
  const base = url.slice(0, qIndex);
  const query = url.slice(qIndex + 1);
  const hashIndex = query.indexOf('#');
  const hash = hashIndex >= 0 ? query.slice(hashIndex) : '';
  const body = hashIndex >= 0 ? query.slice(0, hashIndex) : query;
  const masked = body
    .split('&')
    .map((pair) => {
      if (!pair) return pair;
      const eq = pair.indexOf('=');
      if (eq < 0) return pair;
      const rawName = pair.slice(0, eq);
      let decodeName = rawName;
      try {
        decodeName = decodeURIComponent(rawName);
      } catch {
        /** Keep the original parameter name. */
      }
      if (!cfg.all.has(decodeName)) return pair;
      return `${rawName}=${placeholder(decodeName)}`;
    })
    .join('&');
  return `${base}?${masked}${hash}`;
}

/** Recursively mask registered object keys while preserving arrays. */
export function maskBody(body: unknown, cfg: MaskConfig): unknown {
  if (Array.isArray(body)) return body.map((item) => maskBody(item, cfg));
  if (body !== null && typeof body === 'object') {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
      out[key] = cfg.all.has(key) ? placeholder(key) : maskBody(value, cfg);
    }
    return out;
  }
  return body;
}

/** Collect named placeholders from nested strings, arrays and objects. */
export function scanPlaceholders(value: unknown): Set<string> {
  const found = new Set<string>();
  const visit = (v: unknown): void => {
    if (typeof v === 'string') {
      const re = /\{\{([A-Za-z0-9_-]+)\}\}/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(v)) !== null) found.add(m[1]);
    } else if (Array.isArray(v)) {
      for (const item of v) visit(item);
    } else if (v !== null && typeof v === 'object') {
      for (const item of Object.values(v as Record<string, unknown>)) visit(item);
    }
  };
  visit(value);
  return found;
}
