import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { startReplayServer, type ReplayServer } from '../src/mock/replay';
import { renderPostman } from '../src/renderers/postman';
import { captureContent, capturePostData } from '../src/lib/har';
import { corpus, example } from './fixtures';

const servers: ReplayServer[] = [];
afterEach(async () => { await Promise.all(servers.splice(0).map((s) => s.close())); });
async function start(examples = [example()]) {
  const server = await startReplayServer(corpus(examples));
  servers.push(server);
  return server;
}
function send(server: ReplayServer, url: string, body = '{"item":1}', headers: Record<string, string> = {}) {
  return new Promise<{ status: number; headers: http.IncomingHttpHeaders; text: string }>((resolve, reject) => {
    const req = http.request(`${server.url}${url}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end(body);
  });
}
describe('strict replay matching', () => {
  it('accepts the exact request and rejects wrong query, duplicates and body', async () => {
    const server = await start();
    expect((await send(server, '/x?a=1&a=2')).status).toBe(200);
    expect((await send(server, '/x?a=9&a=2')).status).toBe(404);
    expect((await send(server, '/x?a=2')).status).toBe(404);
    expect((await send(server, '/x?a=1&a=2', '{"item":999}')).status).toBe(404);
    expect(server.failures).toBe(3);
  });
  it('checks recorded auth headers and MIME', async () => {
    const server = await start([example({ headers: { 'content-type': 'application/json', authorization: 'Bearer synthetic' } })]);
    expect((await send(server, '/x?a=1&a=2')).status).toBe(404);
    expect((await send(server, '/x?a=1&a=2', '{"item":1}', { authorization: 'Bearer synthetic' })).status).toBe(200);
    expect((await send(server, '/x?a=1&a=2', '{"item":1}', { authorization: 'Bearer synthetic', 'content-type': 'text/plain' })).status).toBe(404);
  });
  it('does not match unrecorded authentication or rounded numeric values', async () => {
    const server = await start([example({ ...capturePostData({ mimeType: 'application/json', text: '{"id":9007199254740993123}' }) })]);
    expect((await send(server, '/x?a=1&a=2', '{"id":9007199254740993124}')).status).toBe(404);
    expect((await send(server, '/x?a=1&a=2', '{ "id": 9007199254740993123 }')).status).toBe(200);
    expect((await send(server, '/x?a=1&a=2', '{"id":9007199254740993123}', { authorization: 'Bearer synthetic' })).status).toBe(404);
    const special = await start([example({ ...capturePostData({ mimeType: 'application/json', text: '{"__proto__":{"a":1}}' }) })]);
    expect((await send(special, '/x?a=1&a=2', '{}')).status).toBe(404);
  });
  it('replays response MIME from metadata and distinguishes JSON null from no body', async () => {
    const ex = example();
    ex.response = { status: 200, ...captureContent({ mimeType: 'application/json', text: 'null' }) };
    const server = await start([ex]);
    const result = await send(server, '/x?a=1&a=2');
    expect(result.headers['content-type']).toBe('application/json');
    expect(result.text).toBe('null');
  });
  it('requires explicit selection for ambiguous recordings and still validates the request', async () => {
    const server = await start([example(), example()]);
    expect((await send(server, '/x?a=1&a=2')).status).toBe(409);
    const selector = encodeURIComponent('x.test:1.json');
    const selected = await send(server, '/x?a=1&a=2', '{"item":1}', { 'x-apic-replay-example': selector });
    expect(selected.status).toBe(200);
    expect(selected.headers['x-apic-replay-match']).toBe(selector);
    expect((await send(server, '/x?a=1&a=2', '{"item":2}', { 'x-apic-replay-example': selector })).status).toBe(404);
  });
  it('matches JSON semantically and form fields without dropping duplicates', async () => {
    const server = await start([example({ body: { a: 1, b: 2 } })]);
    expect((await send(server, '/x?a=1&a=2', '{ "b": 2, "a": 1 }')).status).toBe(200);
    const form = await start([example({ headers: {}, ...capturePostData({ mimeType: 'application/x-www-form-urlencoded', text: 'q=a+b&q=c' }) })]);
    expect((await send(form, '/x?a=1&a=2', 'q=a%20b&q=c', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(200);
    expect((await send(form, '/x?a=1&a=2', 'q=c', { 'content-type': 'application/x-www-form-urlencoded' })).status).toBe(404);
  });
  it('runs generated Postman requests through Newman including raw and params-only bodies', async () => {
    const redirect = example();
    redirect.http = 302;
    redirect.code = null;
    redirect.response = { status: 302, headers: { location: '/must-not-follow' }, body: null };
    const examples = [
      example(), example(),
      example({ url: 'https://second.example.invalid/x?a=3', body: { token: '{{token}}' } }),
      example({ headers: {}, ...capturePostData({ mimeType: 'application/x-www-form-urlencoded', text: 'q=a+b&q=c' }) }),
      example({ headers: {}, ...capturePostData({ mimeType: 'text/plain', text: 'hello\nworld' }) }),
      example({ headers: {}, ...capturePostData({ mimeType: 'multipart/form-data', params: [{ name: 'q', value: '1' }, { name: 'q', value: '2' }] }) }),
      example({ headers: {}, ...capturePostData({ mimeType: 'application/json', text: 'null' }) }),
      redirect,
    ];
    const data = corpus(examples);
    const server = await startReplayServer(data);
    servers.push(server);
    const files = renderPostman(data);
    const collection = JSON.parse(files[0].content);
    const environment = JSON.parse(files[1].content);
    environment.values.find((entry: any) => entry.key === 'baseUrl').value = server.url;
    const { default: newman } = await import('newman');
    const summary = await new Promise<any>((resolve, reject) => {
      newman.run({ collection, reporters: [], timeoutRequest: 3000, ignoreRedirects: true,
        environment,
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    expect(summary.run.failures.map((f: any) => f.error.message)).toEqual([]);
    expect(summary.run.stats.assertions.total).toBe(examples.length * 3);
    expect(server.failures).toBe(0);
    expect(server.remaining).toEqual([]);
  }, 20000);
});
