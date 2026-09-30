import { describe, expect, it } from 'vitest';
import { renderPostman } from '../src/renderers/postman';
import { corpus, example } from './fixtures';

function exported(data = corpus([example()])) {
  const files = renderPostman(data);
  return { files, collection: JSON.parse(files[0].content), environment: JSON.parse(files[1].content) };
}
function resolveUrl(request: any, collection: any): string {
  return request.url.raw.replace(/^\{\{([^}]+)\}\}/, (_match: string, key: string) => collection.variable.find((v: any) => v.key === key).value);
}

describe('application-independent Postman exports', () => {
  it('routes each recording to its actual origin, including unconfigured hosts', () => {
    const records = ['https://shop.example.invalid/x?a=1', 'https://api.example.invalid/x?a=2', 'https://other.example.invalid/x?a=3'].map((url) => example({ url }));
    const data = corpus(records);
    data.collection.name = 'Catalog / staging';
    data.collection.bases = { shop: 'https://shop.example.invalid', api: 'https://api.example.invalid' };
    const { files, collection, environment } = exported(data);
    expect(files.map((file) => file.path)).toEqual(['postman/endpoints.postman_collection.json', 'postman/replay.postman_environment.json']);
    expect(collection.info.name).toBe('Catalog / staging');
    expect(collection.item[0].item.map((i: any) => resolveUrl(i.request, collection))).toEqual(records.map((ex) => ex.request.url));
    expect(environment.values).toContainEqual({ key: 'apicReplay', value: 'true', enabled: true, type: 'default' });
    expect(environment.values[0].value).toBe('http://127.0.0.1:4010');
  });
  it('is deterministic regardless of metadata key insertion order', () => {
    const data = corpus([example()]);
    data.collection.bases = { zeta: 'https://example.invalid', alpha: 'https://example.invalid' };
    const first = renderPostman(data);
    data.collection.bases = { alpha: 'https://example.invalid', zeta: 'https://example.invalid' };
    expect(renderPostman(data)).toEqual(first);
  });
  it('preserves the recorded host when no base is configured', () => {
    const data = corpus([example()]);
    data.collection.bases = {};
    const { collection } = exported(data);
    expect(resolveUrl(collection.item[0].item[0].request, collection)).toBe(data.apis[0].examples[0].data.request.url);
  });
  it('declares request placeholders disabled for replay and keeps response-only markers out', () => {
    const ex = example({ body: { token: '{{session_token}}' } });
    ex.response.body = { code: 0, user: '{{response_only}}' };
    const { environment } = exported(corpus([ex]));
    expect(environment.values).toContainEqual({ key: 'session_token', value: '', enabled: false, disabled: true, type: 'secret' });
    expect(environment.values.some((v: any) => v.key === 'response_only')).toBe(false);
  });
  it('distinguishes observed events while keeping stable recording filenames', () => {
    const data = corpus([example({ body: { event: 'view' } }), example({ body: { event: 'click' } })]);
    const items = exported(data).collection.item[0].item;
    expect(items[0].name).toContain('view');
    expect(items[1].name).toContain('click');
    expect(items.map((i: any) => i.response[0].name)).toEqual(['0.json', '1.json']);
    expect(items[0].request.description).toContain('apis/x/examples/0.json');
  });
});
