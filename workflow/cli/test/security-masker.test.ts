import { describe, expect, it } from 'vitest';
import { maskConfigFromCollection, type MaskConfig } from '../src/lib/mask';
import {
  classifySensitiveName,
  defaultSecurityMaskerConfig,
  isPlaceholder,
  maskBodySecure,
  maskHeadersSecure,
  maskUrlSecure,
  redactionMarker,
} from '../src/lib/security-masker';
import type { Collection } from '../src/lib/types';

const collection: Collection = {
  name: 'test',
  version: '0.0.0',
  bases: { web: 'https://api.example.invalid' },
  auth: {
    SESSION_ID: { kind: 'cookie', name: 'SESSION_ID', doc: '' },
    csrf_token: { kind: 'cookie', name: 'csrf_token', doc: '' },
  },
  changelog: [],
};

const cfg: MaskConfig = maskConfigFromCollection(collection);
const sec = defaultSecurityMaskerConfig();

describe('security-masker helpers', () => {
  it('builds the redaction marker per category', () => {
    expect(redactionMarker('token')).toBe('<redacted:token>');
    expect(redactionMarker('secret')).toBe('<redacted:secret>');
    expect(redactionMarker('pii')).toBe('<redacted:pii>');
  });

  it('recognizes layer-1 placeholders as whole strings only', () => {
    expect(isPlaceholder('{{SESSION_ID}}')).toBe(true);
    expect(isPlaceholder('{{csrf_token}}')).toBe(true);
    expect(isPlaceholder('prefix {{SESSION_ID}}')).toBe(false);
    expect(isPlaceholder('<redacted:token>')).toBe(false);
  });

  it('classifies names in severity order secret > token > pii', () => {
    expect(classifySensitiveName('password', sec)).toBe('secret');
    expect(classifySensitiveName('access_token', sec)).toBe('token');
    expect(classifySensitiveName('user_id', sec)).toBe('pii');
    expect(classifySensitiveName('project_id', sec)).toBeNull();
  });
});

describe('maskHeadersSecure', () => {
  it('keeps registered cookie placeholders and redacts sensitive cookie pairs', () => {
    expect(
      maskHeadersSecure({ cookie: 'SESSION_ID=abc; access_token=eyJ.x.y; foo=1' }, cfg, sec),
    ).toEqual({ cookie: 'SESSION_ID={{SESSION_ID}}; access_token=<redacted:token>; foo=1' });
  });

  it('redacts an Authorization header by value shape', () => {
    expect(maskHeadersSecure({ Authorization: 'Bearer abc.def' }, cfg, sec)).toEqual({
      Authorization: '<redacted:token>',
    });
  });

  it('redacts set-cookie values while preserving names and attributes', () => {
    expect(maskHeadersSecure({ 'set-cookie': 'a=1; Path=/' }, cfg, sec)).toEqual({
      'set-cookie': 'a=<redacted:token>; Path=/',
    });
  });

  it('exempts Client Hints headers from sensitivity rules', () => {
    expect(maskHeadersSecure({ 'sec-ch-ua-mobile': '?0' }, cfg, sec)).toEqual({
      'sec-ch-ua-mobile': '?0',
    });
  });

  it('redacts an unregistered cookie by credential shape', () => {
    expect(maskHeadersSecure({ cookie: 'custom_auth=eyJhbGci.abc.def' }, cfg, sec)).toEqual({
      cookie: 'custom_auth=<redacted:token>',
    });
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskHeadersSecure({ cookie: 'SESSION_ID=abc; foo=1' }, cfg, disabled),
    ).toEqual({ cookie: 'SESSION_ID={{SESSION_ID}}; foo=1' });
  });
});

describe('maskUrlSecure', () => {
  it('redacts sensitive query params and keeps plain ones', () => {
    expect(
      maskUrlSecure('https://shop.example.invalid/a?version=1&token=abc&project_id=9', cfg, sec),
    ).toBe('https://shop.example.invalid/a?version=1&token=<redacted:token>&project_id=9');
  });

  it('keeps registered query values as placeholders', () => {
    expect(maskUrlSecure('https://api.example.invalid/x?SESSION_ID=abc', cfg, sec)).toBe(
      'https://api.example.invalid/x?SESSION_ID={{SESSION_ID}}',
    );
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskUrlSecure('https://shop.example.invalid/a?token=abc&SESSION_ID=x', cfg, disabled),
    ).toBe('https://shop.example.invalid/a?token=abc&SESSION_ID={{SESSION_ID}}');
  });
});

describe('maskBodySecure', () => {
  it('masks arbitrary application fields through the collection registry', () => {
    const custom = maskConfigFromCollection({ ...collection, auth: {
      app_credential: { kind: 'cookie', name: 'app_credential', doc: '' },
      'X-Custom-Login': { kind: 'header', name: 'X-Custom-Login', doc: '' },
    } });
    expect(classifySensitiveName('app_credential', sec)).toBeNull();
    expect(maskHeadersSecure({ cookie: 'app_credential=opaque', 'x-custom-login': 'opaque' }, custom, sec)).toEqual({
      cookie: 'app_credential={{app_credential}}', 'x-custom-login': '{{X-Custom-Login}}',
    });
    expect(maskUrlSecure('https://api.example.invalid/?app_credential=opaque', custom, sec)).toBe(
      'https://api.example.invalid/?app_credential={{app_credential}}',
    );
    expect(maskBodySecure({ app_credential: 123 }, custom, sec)).toEqual({ app_credential: '{{app_credential}}' });
  });

  it('redacts sensitive keys including numeric values', () => {
    expect(
      maskBodySecure(
        { user_id: 431260381, name: 'x', nested: { phone: '13800000000', token: 'abc' } },
        cfg,
        sec,
      ),
    ).toEqual({
      user_id: '<redacted:pii>',
      name: 'x',
      nested: { phone: '<redacted:pii>', token: '<redacted:token>' },
    });
  });

  it('redacts a token inside an embedded signed URL string', () => {
    expect(
      maskBodySecure('//cdn.example.invalid/a.jpeg?token=dae217%3Axyz', cfg, sec),
    ).toBe('//cdn.example.invalid/a.jpeg?token=<redacted:token>');
  });

  it('keeps ticketing-domain response fields unchanged', () => {
    const body = {
      ticket_type: 2,
      ticket_list: [{ id: 943795 }],
      has_paper_ticket: false,
      ticket_desc: '',
    };
    expect(maskBodySecure(body, cfg, sec)).toEqual(body);
  });

  it('does not re-redact a placeholder under a sensitive key', () => {
    expect(maskBodySecure({ SESSION_ID: '{{SESSION_ID}}' }, cfg, sec)).toEqual({
      SESSION_ID: '{{SESSION_ID}}',
    });
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskBodySecure({ user_id: 431260381, SESSION_ID: 'abc' }, cfg, disabled),
    ).toEqual({ user_id: 431260381, SESSION_ID: '{{SESSION_ID}}' });
  });
});
