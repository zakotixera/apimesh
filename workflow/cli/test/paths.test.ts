import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findRepoRoot, projectPaths, resolvePaths } from '../src/lib/paths';
import { loadCorpus } from '../src/lib/canonical';
import { removeTemporaryDirectory, temporaryDirectory } from './fixtures';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach(removeTemporaryDirectory));
function collection() {
  const root = temporaryDirectory(); dirs.push(root);
  fs.writeFileSync(path.join(root, 'collection.json'), JSON.stringify({ name: 'Test', version: '1.0.0', bases: {}, changelog: [] }));
  fs.writeFileSync(path.join(root, 'glossary.json'), '{"domains":[]}');
  return root;
}

describe('collection and toolchain paths', () => {
  it('discovers metadata without requiring workflow and uses installed schemas', () => {
    const root = collection();
    const nested = path.join(root, 'apis/example.invalid/x');
    fs.mkdirSync(nested, { recursive: true });
    const paths = resolvePaths(nested);
    expect(paths.root).toBe(root);
    expect(paths.schema).toBe(path.join(paths.toolchainRoot, 'schema'));
    expect(paths.schema).not.toBe(path.join(root, 'schema'));
    expect(loadCorpus(paths).paths).toBe(paths);
  });

  it('does not fall through incomplete nested collections or explicit targets', () => {
    const root = collection();
    const nested = path.join(root, 'nested');
    fs.mkdirSync(nested);
    expect(() => resolvePaths(root, nested)).toThrow(`Missing collection.json: ${path.join(nested, 'collection.json')}`);
    fs.writeFileSync(path.join(nested, 'glossary.json'), '{}');
    expect(() => resolvePaths(nested)).toThrow(`Missing collection.json: ${path.join(nested, 'collection.json')}`);
    fs.writeFileSync(path.join(nested, 'collection.json'), '{}');
    expect(resolvePaths(nested).root).toBe(nested);
    expect(resolvePaths(nested, root).root).toBe(root);
    fs.unlinkSync(path.join(nested, 'glossary.json'));
    expect(() => resolvePaths(nested)).toThrow('Missing glossary.json');
  });

  it('rejects malformed canonical documents before consumers render or replay them', () => {
    const root = collection();
    const definition = path.join(root, 'apis/example.invalid/x/definition.json');
    fs.mkdirSync(path.dirname(definition), { recursive: true });
    fs.writeFileSync(definition, JSON.stringify({ invalid: true }));
    expect(() => loadCorpus(projectPaths(root))).toThrow('Invalid definition');
  });

  it('never selects the toolchain metadata templates', () => {
    const root = projectPaths('.').toolchainRoot;
    const templates = path.join(root, 'workflow/templates');
    // Running the toolchain tests inside a consuming repository may discover that application.
    let discovered: string | undefined;
    try { discovered = findRepoRoot(templates); }
    catch (error) { expect(String(error)).toContain('Cannot locate a collection'); }
    expect(discovered).not.toBe(templates);
    expect(() => resolvePaths(undefined, templates)).toThrow('Toolchain templates are not a collection');
  });
});
