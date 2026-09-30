import { describe, expect, it } from 'vitest';
import { renderPostman } from '../src/renderers/postman';
import { corpus, example } from './fixtures';

describe('application-independent Postman exports', () => {
  it('uses fixed filenames and reads display metadata and hosts from the corpus', () => {
    const data = corpus([example()]);
    data.collection.name = 'Catalog / staging';
    data.collection.bases = { service: 'https://catalog.example.invalid' };
    const files = renderPostman(data);
    expect(files.map((file) => file.path)).toEqual([
      'postman/endpoints.postman_collection.json',
      'postman/replay.postman_environment.json',
    ]);
    const collection = JSON.parse(files[0].content);
    expect(collection.info.name).toBe('Catalog / staging');
    expect(collection.variable).toEqual([
      { key: 'baseUrl', value: 'https://catalog.example.invalid', type: 'string' },
    ]);
    const environment = JSON.parse(files[1].content);
    expect(environment.name).toBe('Catalog / staging · local replay');
    expect(environment.values[0].value).toBe('http://127.0.0.1:4010');
  });

  it('chooses the same base regardless of metadata key insertion order', () => {
    const data = corpus([example()]);
    data.collection.bases = { zeta: 'https://z.example.invalid', alpha: 'https://a.example.invalid' };
    const first = renderPostman(data);
    data.collection.bases = { alpha: 'https://a.example.invalid', zeta: 'https://z.example.invalid' };
    expect(renderPostman(data)).toEqual(first);
    expect(JSON.parse(first[0].content).variable[0].value).toBe('https://a.example.invalid');
  });

  it('uses local replay when the corpus has no configured bases', () => {
    const data = corpus([example()]);
    data.collection.bases = {};
    expect(JSON.parse(renderPostman(data)[0].content).variable[0].value).toBe('http://127.0.0.1:4010');
  });
});
