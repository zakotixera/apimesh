import { describe, expect, it } from 'vitest';
import { captureContent, capturePostData, codeFromBody } from '../src/lib/har';
import { maskCapturedBody, defaultSecurityMaskerConfig, maskHeadersSecure, maskUrlSecure } from '../src/lib/security-masker';
import { maskConfigFromCollection } from '../src/lib/mask';
import { renderPostman } from '../src/renderers/postman';
import { corpus, example } from './fixtures';

const cfg = maskConfigFromCollection({ name: 'test', version: '1', bases: {}, changelog: [], auth: {
  SESSDATA: { kind: 'cookie', name: 'SESSDATA', doc: '' },
  CustomAuth: { kind: 'header', name: 'CustomAuth', doc: '' },
} });
const sec = defaultSecurityMaskerConfig();
function capture(mimeType: string, text: string) { return maskCapturedBody(capturePostData({ mimeType, text }), cfg, sec); }
function request(captured: ReturnType<typeof capturePostData>) {
  const files = renderPostman(corpus([example({ headers: {}, ...captured })]));
  return JSON.parse(files[0].content).item[0].item[0].request;
}
describe('body capture, masking and export', () => {
  it('masks encoded form names and all duplicates while preserving untouched bytes', () => {
    const result = capture('application/x-www-form-urlencoded; charset=UTF-8', 'q=a+b&q=a%20b&pass%77ord=secret&password=other&SESSDATA=cookie&empty=');
    expect(result.body).toBe('q=a+b&q=a%20b&pass%77ord=%3Credacted%3Asecret%3E&password=%3Credacted%3Asecret%3E&SESSDATA=%7B%7BSESSDATA%7D%7D&empty=');
    expect(request(result).body.raw).toBe(result.body);
    expect(JSON.stringify(result)).not.toContain('cookie');
  });
  it('masks params-only captures by the parameter name without collapsing duplicates', () => {
    const result = maskCapturedBody(capturePostData({ mimeType: 'application/x-www-form-urlencoded', params: [
      { name: 'password', value: 'secret' }, { name: 'q', value: '1' }, { name: 'q', value: '2' },
    ] }), cfg, sec);
    expect(request(result).body.raw).toBe('password=%3Credacted%3Asecret%3E&q=1&q=2');
    expect(result.bodyMeta?.source).toBe('params');
  });
  it('preserves JSON text when unchanged, and never duplicates an unmasked raw copy', () => {
    const raw = '{ "code": 0, "values": [1, 2] }\n';
    expect(request(capture('application/json', raw)).body.raw).toBe(raw);
    const redacted = capture('application/json', '{"password":"secret","ok":true}');
    expect(JSON.parse(redacted.body as string)).toEqual({ password: '<redacted:secret>', ok: true });
    expect(JSON.stringify(redacted)).not.toContain(':\\"secret');
  });
  it('keeps empty text and JSON null distinct from uncaptured bodies', () => {
    expect(request(capture('text/plain', '')).body.raw).toBe('');
    expect(request(capture('application/json', 'null')).body.raw).toBe('null');
    expect(() => request(capturePostData({ mimeType: 'text/plain' }))).toThrow('uncaptured');
    expect(capturePostData(undefined)).toEqual({ body: null });
  });
  it('changes only sensitive JSON spans, including nested containers', () => {
    const raw = '{ "large": 9007199254740993123, "password": "secret", "token": { "nested": "value" }, "list": [{"email":"a@example.invalid"}], "q": "a\\u0020b" }';
    expect(capture('application/json', raw).body).toBe(
      raw.replace('"secret"', '"<redacted:secret>"').replace('{ "nested": "value" }', '"<redacted:token>"').replace('"a@example.invalid"', '"<redacted:pii>"'),
    );
  });
  it('preserves special object keys and masks their nested values', () => {
    expect(capture('application/json', '{"__proto__":"literal","constructor":{"password":"secret"}}').body)
      .toBe('{"__proto__":"literal","constructor":{"password":"<redacted:secret>"}}');
  });
  it('exports text and XML without JSON quoting or MIME substitution', () => {
    const result = request(capture('application/xml', '<root a="1"/>'));
    expect(result.body).toEqual({ mode: 'raw', raw: '<root a="1"/>' });
    expect(result.header).toContainEqual({ key: 'Content-Type', value: 'application/xml', type: 'text' });
  });
  it('preserves multipart framing and masks sensitive field values', () => {
    const raw = '--abc\r\nContent-Disposition: form-data; name="password"\r\n\r\nsecret\r\n--abc\r\nContent-Disposition: form-data; name="q"\r\n\r\na+b\r\n--abc--\r\n';
    const result = capture('multipart/form-data; boundary=abc', raw);
    expect(result.body).toBe(raw.replace('secret', '<redacted:secret>'));
    expect(request(result).body.raw).toBe(result.body);
  });
  it('exports multipart params as formdata and rejects unavailable file bytes', () => {
    const result = request(capturePostData({ mimeType: 'multipart/form-data; boundary=old', params: [{ name: 'q', value: '1' }] }));
    expect(result.body.mode).toBe('formdata');
    expect(result.header.some((h: { key: string }) => h.key.toLowerCase() === 'content-type')).toBe(false);
    expect(() => request(capturePostData({ mimeType: 'multipart/form-data', params: [{ name: 'file', fileName: 'a.txt' }] }))).toThrow('uncaptured');
  });
  it('masks JSON nested in multipart and params-only fields while preserving framing', () => {
    const json = '{ "password": "secret", "large": 9007199254740993123, "q": "inline--abc" }';
    const raw = `--abc\r\nContent-Disposition: form-data; name="payload"\r\nContent-Type: application/json\r\n\r\n${json}\r\n--abc--\r\n`;
    expect(capture('multipart/form-data; boundary=abc', raw).body).toBe(raw.replace('"secret"', '"<redacted:secret>"'));
    const params = maskCapturedBody(capturePostData({ mimeType: 'multipart/form-data', params: [
      { name: 'payload', value: json, contentType: 'application/json' },
    ] }), cfg, sec);
    expect((params.body as Array<{ value: string }>)[0].value).toBe(json.replace('"secret"', '"<redacted:secret>"'));
    const form = capture('application/x-www-form-urlencoded', `payload=${encodeURIComponent(json)}`);
    expect(new URLSearchParams(form.body as string).get('payload')).toBe(json.replace('"secret"', '"<redacted:secret>"'));
  });
  it('exports response MIME and typed JSON scalars without changing their meaning', () => {
    const ex = example();
    ex.response = { status: 200, body: null, bodyMeta: { mimeType: 'application/json', source: 'text', representation: 'json' } };
    const saved = JSON.parse(renderPostman(corpus([ex]))[0].content).item[0].item[0].response[0];
    expect(saved.body).toBe('null');
    expect(saved.header).toContainEqual({ key: 'content-type', value: 'application/json', type: 'text' });
    ex.response = { status: 200, ...captureContent({ mimeType: 'application/xml', text: '<root/>' }) };
    const xml = JSON.parse(renderPostman(corpus([ex]))[0].content).item[0].item[0].response[0];
    expect(xml.body).toBe('<root/>');
    expect(xml._postman_previewlanguage).toBe('xml');
  });
  it('rejects malformed structured bodies rather than writing unmasked fallback text', () => {
    expect(() => capture('application/json', '{"password":"secret"')).toThrow('malformed JSON');
    expect(() => capture('multipart/form-data', 'password=secret')).toThrow('boundary');
    expect(() => capture('application/x-www-form-urlencoded', '%ZZ=secret')).toThrow();
  });
  it('retains binary response bytes as base64 and handles JSON response metadata', () => {
    const bytes = Buffer.from([0, 255, 254, 128]).toString('base64');
    expect(captureContent({ mimeType: 'image/png', encoding: 'base64', text: bytes })).toEqual({
      body: bytes, bodyMeta: { mimeType: 'image/png', representation: 'base64', source: 'text' },
    });
    const json = captureContent({ mimeType: 'application/json', text: '{ "code": 0, "large": 9007199254740993123 }' });
    expect(json.body).toBe('{ "code": 0, "large": 9007199254740993123 }');
    expect(codeFromBody(json.body)).toBe(0);
  });
  it('rejects undecodable encoded text instead of inserting replacement characters', () => {
    expect(() => captureContent({ mimeType: 'text/plain', encoding: 'base64', text: '/w==' })).toThrow('Cannot decode');
    expect(() => captureContent({ mimeType: 'text/plain; charset=iso-8859-1', encoding: 'base64', text: '/w==' })).toThrow('Unsupported');
  });
  it('masks registered header names without case sensitivity and encoded token shapes', () => {
    expect(maskHeadersSecure({ customauth: 'secret' }, cfg, sec)).toEqual({ customauth: '{{CustomAuth}}' });
    expect(maskUrlSecure('https://example.invalid/x?value=Bearer%20secret', cfg, sec)).toContain('<redacted:token>');
  });
});
