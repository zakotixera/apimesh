import { maskBody, maskHeaders, maskUrl, type MaskConfig } from './mask';
import { decodeFormComponent, isJsonMime, mapMultipart, mediaType, type CapturedBody } from './body';
import type { BodyParam, Headers } from './types';
import { jsonTokens } from './json-text';

/** Apply deterministic name and value-shape rules after registered authentication masking. Redaction markers are distinct from registered placeholders. URL and cookie markers remain literal for readability. */

export type SecurityCategory = 'token' | 'secret' | 'pii';

export interface SecurityMaskerConfig {
  enabled: boolean;
  detectValueShapes: boolean;
  rules: Record<SecurityCategory, readonly RegExp[]>;
}

/** Create a category marker that is not a registered authentication placeholder. */
export function redactionMarker(category: SecurityCategory): string {
  return `<redacted:${category}>`;
}

/** Recognize a complete registered placeholder string. */
export function isPlaceholder(value: string): boolean {
  return /^\{\{[A-Za-z0-9_-]+\}\}$/.test(value);
}

/** Use case-insensitive, non-global expressions so repeated tests are deterministic. */
const NAME_RULES: Record<SecurityCategory, readonly RegExp[]> = {
  token: [
    /authorization/i,
    /accessToken|refreshToken|idToken/i,
    /proxy-authorization/i,
    /(^|[_\-.])token([_\-.]|$)/i,
    /access[_-]?key/i,
    /refresh[_-]?token/i,
    /id[_-]?token/i,
    /(^|[_\-.])session(?:id)?([_\-.]|$)/i,
    /(^|[_\-.])sid([_\-.]|$)/i,
    /csrf|xsrf/i,
    /(^|[_\-.])nonce([_\-.]|$)/i,
    /signature/i,
    /(^|[_\-.])sign([_\-.]|$)/i,
    /device[_-]?fingerprint/i,
    /x[_-]?auth[_-]?token/i,
    /x[_-]?csrf[_-]?token/i,
    /x[_-]?xsrf[_-]?token/i,
    /x[_-]?api[_-]?key/i,
    /api[_-]?key/i,
  ],
  secret: [
    /password|passwd|(^|[_\-.])pwd([_\-.]|$)/i,
    /secret/i,
    /private[_-]?key/i,
  ],
  pii: [
    /(^|[_\-.])uid([_\-.]|$)/i,
    /user[_-]?id/i,
    /(^|[_\-.])phone([_\-.]|$)/i,
    /(^|[_\-.])mobile([_\-.]|$)/i,
    /(^|[_\-.])email([_\-.]|$)/i,
    /id[_-]?card/i,
    /real[_-]?name/i,
  ],
};

/** Value-shape detection is controlled by detectValueShapes. */
const JWT_RE = /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const AUTH_SCHEME_RE = /^(?:bearer|basic)\s+\S+$/i;
const URLISH_RE = /^(?:https?:)?\/\/|^\//;

export function defaultSecurityMaskerConfig(): SecurityMaskerConfig {
  return { enabled: true, detectValueShapes: true, rules: NAME_RULES };
}

/** Return the first matching category in secret, token, PII priority order. */
export function classifySensitiveName(
  name: string,
  cfg: SecurityMaskerConfig,
): SecurityCategory | null {
  // Client Hints describe browser properties rather than authentication.
  // Exclude these names to avoid classifying sec-ch-ua-mobile as personal data.
  if (name.toLowerCase().startsWith('sec-ch-')) return null;
  for (const category of ['secret', 'token', 'pii'] as const) {
    for (const rule of cfg.rules[category]) {
      if (rule.test(name)) return category;
    }
  }
  return null;
}

/** Recognize JWTs and Bearer/Basic credentials. */
function isTokenShape(value: string, sec: SecurityMaskerConfig): boolean {
  if (!sec.detectValueShapes) return false;
  return JWT_RE.test(value) || AUTH_SCHEME_RE.test(value);
}

/** Mask sensitive query names and credential-shaped values while retaining existing placeholders and raw parameter names. */
function redactQueryPairs(query: string, sec: SecurityMaskerConfig): string {
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
      const rawValue = pair.slice(eq + 1);
      if (isPlaceholder(rawValue)) return pair;
      let decodeName = rawName;
      try {
        decodeName = decodeFormComponent(rawName);
      } catch {
        /** Keep the original parameter name. */
      }
      const named = classifySensitiveName(decodeName, sec);
      if (named) return `${rawName}=${redactionMarker(named)}`;
      let decodedValue = rawValue;
      try { decodedValue = decodeFormComponent(rawValue); } catch { /* Name-based rules still apply. */ }
      if (isTokenShape(decodedValue, sec)) return `${rawName}=${redactionMarker('token')}`;
      return pair;
    })
    .join('&');
  return `${masked}${hash}`;
}

/** Preserve placeholders, redact credential-shaped strings and sanitize embedded URL queries. */
function redactStringValue(value: string, sec: SecurityMaskerConfig): string {
  if (isPlaceholder(value)) return value;
  if (isTokenShape(value, sec)) return redactionMarker('token');
  if (URLISH_RE.test(value) && value.includes('?')) {
    const qIndex = value.indexOf('?');
    return `${value.slice(0, qIndex)}?${redactQueryPairs(value.slice(qIndex + 1), sec)}`;
  }
  return value;
}

/** Apply registered query masking before general security rules. */
export function maskUrlSecure(url: string, cfg: MaskConfig, sec: SecurityMaskerConfig): string {
  const masked = maskUrl(url, cfg);
  if (!sec.enabled) return masked;
  const qIndex = masked.indexOf('?');
  if (qIndex < 0) return masked;
  return `${masked.slice(0, qIndex)}?${redactQueryPairs(masked.slice(qIndex + 1), sec)}`;
}

/** Apply registered header masking before name and value-shape rules. */
export function maskHeadersSecure(
  headers: Headers | undefined,
  cfg: MaskConfig,
  sec: SecurityMaskerConfig,
): Headers | undefined {
  const masked = maskHeaders(headers, cfg);
  if (!masked || !sec.enabled) return masked;
  const out: Headers = Object.create(null);
  for (const [name, value] of Object.entries(masked)) {
    if (Array.isArray(value)) {
      out[name] = value.map((v) => maskHeadersSecure({ [name]: v }, cfg, sec)![name] as string);
      continue;
    }
    if (isPlaceholder(value)) {
      out[name] = value;
    } else if (name.toLowerCase() === 'set-cookie') {
      const split = value.indexOf(';');
      const cookie = split < 0 ? value : value.slice(0, split);
      const eq = cookie.indexOf('=');
      const cookieName = eq < 0 ? '' : cookie.slice(0, eq).trim();
      // Set-Cookie values remain conservatively masked; retain names and attributes.
      out[name] = eq < 0 ? redactionMarker('token') : `${cookie.slice(0, eq + 1)}${cfg.cookies.has(cookieName) ? `{{${cookieName}}}` : redactionMarker('token')}${split < 0 ? '' : value.slice(split)}`;
    } else if (name.toLowerCase() === 'cookie') {
      out[name] = value
        .split(';')
        .map((part) => {
          const trimmed = part.trim();
          if (!trimmed) return part;
          const eq = trimmed.indexOf('=');
          if (eq < 0) return trimmed;
          const cookieName = trimmed.slice(0, eq);
          const cookieValue = trimmed.slice(eq + 1);
          if (isPlaceholder(cookieValue)) return trimmed;
          const named = classifySensitiveName(cookieName, sec);
          if (named) return `${cookieName}=${redactionMarker(named)}`;
          if (isTokenShape(cookieValue, sec)) return `${cookieName}=${redactionMarker('token')}`;
          return trimmed;
        })
        .filter((p) => p.length > 0)
        .join('; ');
    } else {
      const named = classifySensitiveName(name, sec);
      out[name] = named ? redactionMarker(named) : redactStringValue(value, sec);
    }
  }
  return out;
}

/** Recursively mask sensitive body fields, including numeric values. */
export function maskBodySecure(body: unknown, cfg: MaskConfig, sec: SecurityMaskerConfig): unknown {
  const masked = maskBody(body, cfg);
  if (!sec.enabled) return masked;
  if (Array.isArray(masked)) return masked.map((item) => maskBodySecure(item, cfg, sec));
  if (masked !== null && typeof masked === 'object') {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(masked as Record<string, unknown>)) {
      const named = classifySensitiveName(key, sec);
      if (typeof value === 'string') {
        if (isPlaceholder(value)) {
          out[key] = value;
        } else {
          out[key] = named ? redactionMarker(named) : redactStringValue(value, sec);
        }
      } else if (value !== null && typeof value === 'object') {
        out[key] = named ? redactionMarker(named) : maskBodySecure(value, cfg, sec);
      } else {
        out[key] = named ? redactionMarker(named) : value;
      }
    }
    return out;
  }
  if (typeof masked === 'string') return redactStringValue(masked, sec);
  return masked;
}

/** Preserve the original encoding, order, duplicate keys and separators of nonsensitive parameters. */
export function maskFormSecure(text: string, cfg: MaskConfig, sec: SecurityMaskerConfig): string {
  return text.split('&').map((pair) => {
    if (!pair) return pair;
    const eq = pair.indexOf('=');
    if (eq < 0) return pair;
    const name = decodeFormComponent(pair.slice(0, eq));
    const value = decodeFormComponent(pair.slice(eq + 1));
    const masked = maskFieldText(name, value, undefined, cfg, sec);
    return masked === value ? pair : `${pair.slice(0, eq)}=${encodeURIComponent(masked)}`;
  }).join('&');
}

/** Replace JSON value spans only, preserving whitespace, escapes and large numeric literals. */
function maskJsonText(text: string, cfg: MaskConfig, sec: SecurityMaskerConfig): string {
  let tokens: RegExpMatchArray[];
  try { tokens = jsonTokens(text); } catch { throw new Error('Cannot safely mask malformed JSON content'); }
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  let cursor = 0;
  const visit = (name?: string): void => {
    const first = tokens[cursor++];
    const start = first.index!;
    const token = first[0];
    if (token === '{') {
      while (tokens[cursor][0] !== '}') {
        const key = JSON.parse(tokens[cursor++][0]) as string;
        cursor += 1; // Colon; syntax was validated above.
        visit(key);
        if (tokens[cursor][0] === ',') cursor += 1;
      }
      cursor += 1;
    } else if (token === '[') {
      while (tokens[cursor][0] !== ']') {
        visit();
        if (tokens[cursor][0] === ',') cursor += 1;
      }
      cursor += 1;
    }
    const last = tokens[cursor - 1];
    const end = last.index! + last[0].length;
    const sensitive = name !== undefined && (cfg.all.has(name) || (sec.enabled && classifySensitiveName(name, sec) !== null));
    if (!sensitive && !token.startsWith('"')) return;
    // A sensitive container is replaced as a whole; its contents need not be parsed again.
    const value = token === '{' || token === '[' ? {} : JSON.parse(token);
    const masked = name === undefined ? maskBodySecure(value, cfg, sec) :
      (maskBodySecure({ [name]: value }, cfg, sec) as Record<string, unknown>)[name];
    if (masked !== value) replacements.push({ start, end, value: JSON.stringify(masked) });
  };
  visit();
  replacements.sort((a, b) => a.start - b.start || b.end - a.end);
  let result = '';
  let offset = 0;
  for (const replacement of replacements) {
    if (replacement.start < offset) continue; // An enclosing sensitive object already replaced this span.
    result += text.slice(offset, replacement.start) + replacement.value;
    offset = replacement.end;
  }
  return result + text.slice(offset);
}

function maskFieldText(name: string, value: string, mimeType: string | undefined, cfg: MaskConfig, sec: SecurityMaskerConfig): string {
  const masked = (maskBodySecure({ [name]: value }, cfg, sec) as Record<string, string>)[name];
  if (masked !== value) return masked;
  return maskCapturedBody({ body: value, bodyMeta: { mimeType, representation: 'text', source: 'text' } }, cfg, sec).body as string;
}

/** Mask by captured format; retain only the sanitized body, without a raw copy in metadata. */
export function maskCapturedBody(captured: CapturedBody, cfg: MaskConfig, sec: SecurityMaskerConfig): CapturedBody {
  const { body, bodyMeta } = captured;
  if (!bodyMeta) return { body: maskBodySecure(body, cfg, sec) };
  if (bodyMeta.source === 'missing' || bodyMeta.representation === 'base64') return captured;
  if (bodyMeta.representation === 'params') {
    return { bodyMeta, body: (body as BodyParam[]).map((param) => {
      if (param.value === undefined) return { ...param };
      return { ...param, value: maskFieldText(param.name, param.value, param.contentType, cfg, sec) };
    }) };
  }
  if (bodyMeta.representation === 'json') return { bodyMeta, body: maskBodySecure(body, cfg, sec) };
  const text = body as string;
  const mime = mediaType(bodyMeta.mimeType);
  if (mime === 'application/x-www-form-urlencoded') return { bodyMeta, body: maskFormSecure(text, cfg, sec) };
  if (mime === 'multipart/form-data') {
    return { bodyMeta, body: mapMultipart(text, bodyMeta.mimeType!, (name, value, part) =>
      maskFieldText(name, value, part.contentType, cfg, sec)) };
  }
  if (isJsonMime(mime)) {
    return { bodyMeta, body: maskJsonText(text, cfg, sec) };
  }
  if (/^\s*[[{]/.test(text)) {
    let json = false;
    try { JSON.parse(text); json = true; } catch { /* Non-JSON text is not a structured body. */ }
    if (json) return { bodyMeta, body: maskJsonText(text, cfg, sec) };
  }
  return { bodyMeta, body: maskBodySecure(text, cfg, sec) };
}
