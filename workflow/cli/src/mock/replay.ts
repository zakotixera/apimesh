import http from 'node:http';
import type { LoadedCorpus, LoadedExample } from '../lib/canonical';
import { bodyMatches, headersMatch, querySignature } from './match';
import type { BodyMetadata } from '../lib/types';
import { responseHeaders } from '../lib/body';

export interface ReplayServer {
  /** Loopback server URL without a trailing slash. */
  url: string;
  close: () => Promise<void>;
  readonly failures: number;
  readonly remaining: string[];
}

interface Recording {
  query: string;
  id: string;
  example: LoadedExample;
}

function serializeBody(body: unknown, metadata?: BodyMetadata): { text: string | Buffer; json: boolean } {
  if (metadata?.representation === 'base64') return { text: Buffer.from(body as string, 'base64'), json: false };
  if (metadata?.representation === 'json') return { text: JSON.stringify(body, null, 2), json: true };
  if (body === null || body === undefined) return { text: '', json: false };
  if (typeof body === 'string') return { text: body, json: false };
  return { text: JSON.stringify(body, null, 2), json: true };
}

/** Replay only uniquely matched recordings, validating request content before selection. */
export function startReplayServer(corpus: LoadedCorpus): Promise<ReplayServer> {
  // Index recording candidates by HTTP method and pathname.
  const routes = new Map<string, Recording[]>();
  const authHeaders = Object.values(corpus.collection.auth ?? {}).filter((auth) => auth.kind === 'header').map((auth) => auth.name);
  let failures = 0;
  const pending = new Set<string>();
  for (const api of corpus.apis) {
    for (const ex of api.examples) {
      if (ex.data.response.bodyMeta?.source === 'missing') {
        throw new Error(`Cannot replay an uncaptured response body: ${ex.name}`);
      }
      let url: URL;
      try {
        url = new URL(ex.data.request.url);
      } catch {
        throw new Error(`Invalid recording URL: ${ex.name}`);
      }
      const key = `${ex.data.request.method.toUpperCase()} ${url.pathname}`;
      const list = routes.get(key) ?? [];
      list.push({ query: querySignature(url.searchParams), id: encodeURIComponent(`${api.definition.api}:${ex.name}`), example: ex });
      pending.add(encodeURIComponent(`${api.definition.api}:${ex.name}`));
      routes.set(key, list);
    }
  }

  const server = http.createServer(async (req, res) => {
    const method = (req.method ?? 'GET').toUpperCase();
    const parsed = new URL(req.url ?? '/', 'http://127.0.0.1');
    const key = `${method} ${parsed.pathname}`;
    const candidates = routes.get(key) ?? [];

    const chunks: Buffer[] = [];
    try {
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
    } catch {
      failures += 1;
      res.destroy();
      return;
    }
    const textBody = Buffer.concat(chunks).toString('utf8');
    const headers = Object.fromEntries(Object.entries(req.headers).map(([key, value]) => [key, Array.isArray(value) ? value.join('; ') : value ?? '']));
    const query = querySignature(parsed.searchParams);
    const selector = headers['x-apic-replay-example'];
    const matches = candidates.filter((c) => (!selector || c.id === selector) && c.query === query &&
      headersMatch(c.example.data.request, headers, authHeaders) &&
      bodyMatches(c.example.data.request, textBody, headers['content-type']));
    if (matches.length !== 1) {
      failures += 1;
      res.writeHead(matches.length > 1 ? 409 : 404, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: matches.length > 1 ? 'ambiguous recording' : 'no matching recording', method, path: parsed.pathname }));
      return;
    }
    const match = matches[0];
    pending.delete(match.id);

    const { status, body } = match.example.data.response;
    const recordedHeaders = responseHeaders(match.example.data.response);
    const { text, json } = serializeBody(body, match.example.data.response.bodyMeta);
    const outHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(recordedHeaders ?? {})) {
      // HAR content is decoded independently of its original transport headers.
      if (k.startsWith(':') || ['content-length', 'content-encoding', 'transfer-encoding'].includes(k.toLowerCase())) continue;
      outHeaders[k] = v;
    }
    if (json && !Object.keys(outHeaders).some((k) => k.toLowerCase() === 'content-type')) {
      outHeaders['content-type'] = 'application/json; charset=utf-8';
    }
    outHeaders['x-apic-replay-match'] = match.id;
    res.writeHead(status, outHeaders);
    res.end(text);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Cannot determine the replay server port'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        get failures() { return failures; },
        get remaining() { return [...pending].sort(); },
        close: () =>
          new Promise<void>((done) => {
            server.close(() => done());
          }),
      });
    });
  });
}
