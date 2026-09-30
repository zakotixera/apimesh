import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { validateCommand } from '../src/validate';
import * as paths from '../src/lib/paths';
import { corpus, example, removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const dirs: string[] = [];
const exitCode = process.exitCode;
afterEach(() => { vi.restoreAllMocks(); process.exitCode = exitCode; dirs.splice(0).forEach(removeTemporaryDirectory); });

describe('canonical request identity validation', () => {
  it.each([
    ['POST', 'https://example.invalid/x?item=1', []],
    ['GET', 'https://example.invalid/x', ['example-method-mismatch']],
    ['POST', 'https://example.invalid/wrong', ['example-url-mismatch']],
    ['POST', 'ftp://example.invalid/x', ['example-url-mismatch']],
    ['POST', 'invalid', ['example-url-invalid']],
  ])('checks %s %s against its definition', async (method, url, errors) => {
    const root = temporaryDirectory(); dirs.push(root);
    const project = paths.projectPaths(root);
    fs.cpSync(path.resolve(import.meta.dirname, '../../../schema'), project.schema, { recursive: true });
    const data = corpus([]);
    const def = data.apis[0].definition;
    def.responses[0].schema = { type: 'object' };
    def.responses[0].examples = ['200.code0.ok.capture-1.json'];
    const write = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
    write(project.collectionFile, data.collection);
    write(project.glossaryFile, { domains: [{ slug: 'ok', meaning: 'Success' }] });
    write(path.join(project.apis, 'x/definition.json'), def);
    const ex = example();
    write(path.join(project.apis, 'x/examples/200.code0.ok.capture-1.json'), { ...ex, request: { ...ex.request, method, url } });
    vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    await validateCommand().parseAsync(['--strict'], { from: 'user' });
    const report = JSON.parse(fs.readFileSync(path.join(project.reports, 'validate.json'), 'utf8'));
    expect(report.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(errors));
    expect(report.ok).toBe(errors.length === 0);
    expect(process.exitCode).toBe(errors.length === 0 ? 0 : 1);
  });
});
