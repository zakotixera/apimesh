import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(removeTemporaryDirectory));
function fixture() { const dir = temporaryDirectory(); dirs.push(dir); return dir; }
function run(script: string, args: string[]) {
  return spawnSync(process.execPath, [path.resolve(import.meta.dirname, '../scripts', script), ...args], {
    encoding: 'utf8', timeout: 60000,
  });
}

describe('complete synthetic workflow', () => {
  it.each([false, true])('extracts, validates, renders twice, replays and compares drift (multiple hosts: %s)', (multipleHosts) => {
    const dir = fixture();
    const file = path.join(dir, 'capture with spaces.har');
    const entry = (index: number, postData: object, content: object) => ({
      startedDateTime: `2026-01-01T00:00:0${index}Z`,
      time: index + 0.5,
      request: { httpVersion: 'h2', method: 'POST', url: 'https://example.invalid/recorded?token=synthetic-secret', postData,
        headers: [{ name: ':method', value: 'POST' }, { name: ':authority', value: 'example.invalid' }] },
      response: { httpVersion: 'h2', status: 200, content, headers: [{ name: 'content-encoding', value: index % 2 ? 'br' : 'gzip' },
        { name: ':status', value: '200' }, { name: 'content-length', value: '12345' }] },
    });
    const har = { log: { version: '1.2', entries: [
      entry(0, { mimeType: 'application/json', text: '{"id":9007199254740993123,"password":"synthetic-secret"}' }, { mimeType: 'application/json', text: '{ "code": 0, "value": 1 }' }),
      entry(1, { mimeType: 'application/json', text: '{"id":9007199254740993124}' }, { mimeType: 'application/json', text: '{"code":0,"value":2}' }),
      entry(2, { mimeType: 'application/x-www-form-urlencoded', params: [{ name: 'q', value: 'one' }, { name: 'q', value: 'two' }] }, { mimeType: 'application/json', text: '{"message":"HTTP only"}' }),
      entry(3, { mimeType: 'multipart/form-data', params: [{ name: 'q', value: 'one' }, { name: 'q', value: 'two' }] }, { mimeType: 'application/json', text: 'null' }),
    ] } };
    if (multipleHosts) {
      const other = structuredClone(har.log.entries[0]);
      other.request.url = 'https://other.invalid/recorded?token=synthetic-secret';
      har.log.entries.push(other);
    }
    fs.writeFileSync(file, JSON.stringify(har));
    const before = fs.readFileSync(file);
    const result = run('check-har.cjs', [file]);
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ sourceEntries: multipleHosts ? 5 : 4, recordings: multipleHosts ? 5 : 4, endpoints: multipleHosts ? 2 : 1, additionalRecordings: 2,
      validation: 'passed', validationProbes: 7, extractionStability: 'passed', renderStability: 'passed', replay: 'passed', captureFidelity: 'passed', baselineDrift: 'none' });
    expect(fs.readFileSync(file)).toEqual(before);
  }, 60000);
});
