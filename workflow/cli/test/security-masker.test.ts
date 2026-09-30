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
  bases: { web: 'https://api.bilibili.com' },
  auth: {
    SESSDATA: { kind: 'cookie', name: 'SESSDATA', doc: '' },
    bili_jct: { kind: 'cookie', name: 'bili_jct', doc: '' },
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
    expect(isPlaceholder('{{SESSDATA}}')).toBe(true);
    expect(isPlaceholder('{{bili_jct}}')).toBe(true);
    expect(isPlaceholder('prefix {{SESSDATA}}')).toBe(false);
    expect(isPlaceholder('<redacted:token>')).toBe(false);
  });

  it('classifies names in severity order secret > token > pii', () => {
    expect(classifySensitiveName('password', sec)).toBe('secret');
    expect(classifySensitiveName('bili_ticket', sec)).toBe('token');
    expect(classifySensitiveName('mid', sec)).toBe('pii');
    expect(classifySensitiveName('project_id', sec)).toBeNull();
  });
});

describe('maskHeadersSecure', () => {
  it('keeps registered cookie placeholders and redacts sensitive cookie pairs', () => {
    expect(
      maskHeadersSecure({ cookie: 'SESSDATA=abc; bili_ticket=eyJ.x.y; foo=1' }, cfg, sec),
    ).toEqual({ cookie: 'SESSDATA={{SESSDATA}}; bili_ticket=<redacted:token>; foo=1' });
  });

  it('redacts an Authorization header by value shape', () => {
    expect(maskHeadersSecure({ Authorization: 'Bearer abc.def' }, cfg, sec)).toEqual({
      Authorization: '<redacted:token>',
    });
  });

  it('redacts set-cookie entirely', () => {
    expect(maskHeadersSecure({ 'set-cookie': 'a=1; Path=/' }, cfg, sec)).toEqual({
      'set-cookie': '<redacted:token>',
    });
  });

  it('exempts Client Hints headers from sensitivity rules', () => {
    expect(maskHeadersSecure({ 'sec-ch-ua-mobile': '?0' }, cfg, sec)).toEqual({
      'sec-ch-ua-mobile': '?0',
    });
  });

  it('still redacts the bili_ticket cookie without the generic ticket rule', () => {
    expect(maskHeadersSecure({ cookie: 'bili_ticket=eyJhbGci.abc.def' }, cfg, sec)).toEqual({
      cookie: 'bili_ticket=<redacted:token>',
    });
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskHeadersSecure({ cookie: 'SESSDATA=abc; foo=1' }, cfg, disabled),
    ).toEqual({ cookie: 'SESSDATA={{SESSDATA}}; foo=1' });
  });
});

describe('maskUrlSecure', () => {
  it('redacts sensitive query params and keeps plain ones', () => {
    expect(
      maskUrlSecure('https://show.bilibili.com/a?version=1&token=abc&project_id=9', cfg, sec),
    ).toBe('https://show.bilibili.com/a?version=1&token=<redacted:token>&project_id=9');
  });

  it('keeps registered query values as placeholders', () => {
    expect(maskUrlSecure('https://api.bilibili.com/x?SESSDATA=abc', cfg, sec)).toBe(
      'https://api.bilibili.com/x?SESSDATA={{SESSDATA}}',
    );
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskUrlSecure('https://show.bilibili.com/a?token=abc&SESSDATA=x', cfg, disabled),
    ).toBe('https://show.bilibili.com/a?token=abc&SESSDATA={{SESSDATA}}');
  });
});

describe('maskBodySecure', () => {
  it('redacts sensitive keys including numeric values', () => {
    expect(
      maskBodySecure(
        { mid: 431260381, name: 'x', nested: { phone: '13800000000', token: 'abc' } },
        cfg,
        sec,
      ),
    ).toEqual({
      mid: '<redacted:pii>',
      name: 'x',
      nested: { phone: '<redacted:pii>', token: '<redacted:token>' },
    });
  });

  it('redacts a token inside an embedded signed URL string', () => {
    expect(
      maskBodySecure('//i0.hdslb.com/a.jpeg?token=dae217%3Axyz', cfg, sec),
    ).toBe('//i0.hdslb.com/a.jpeg?token=<redacted:token>');
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
    expect(maskBodySecure({ SESSDATA: '{{SESSDATA}}' }, cfg, sec)).toEqual({
      SESSDATA: '{{SESSDATA}}',
    });
  });

  it('returns layer-1 output unchanged when disabled', () => {
    const disabled = { ...sec, enabled: false };
    expect(
      maskBodySecure({ mid: 431260381, SESSDATA: 'abc' }, cfg, disabled),
    ).toEqual({ mid: 431260381, SESSDATA: '{{SESSDATA}}' });
  });
});
