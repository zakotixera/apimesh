import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { writeExtractOutput } from '../src/lib/extract-output';
import { temporaryDirectory, removeTemporaryDirectory } from './fixtures';

const directories: string[] = [];
function fixture(): string { const dir = temporaryDirectory(); directories.push(dir); return dir; }
afterEach(() => { directories.splice(0).forEach(removeTemporaryDirectory); });

describe('managed extract output', () => {
  it('updates owned files, removes only obsolete owned files and preserves user data', () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, 'README.md'), 'notes');
    fs.mkdirSync(path.join(dir, 'data'));
    fs.writeFileSync(path.join(dir, 'data/input.har'), 'input');
    writeExtractOutput(dir, [{ name: 'GET.a.yaml', content: 'first' }, { name: 'GET.old.yaml', content: 'old' }]);
    writeExtractOutput(dir, [{ name: 'GET.a.yaml', content: 'second' }]);
    expect(fs.readFileSync(path.join(dir, 'GET.a.yaml'), 'utf8')).toBe('second\n');
    expect(fs.existsSync(path.join(dir, 'GET.old.yaml'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'README.md'), 'utf8')).toBe('notes');
    expect(fs.readFileSync(path.join(dir, 'data/input.har'), 'utf8')).toBe('input');
  });
  it('refuses unowned collisions before writing any output', () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, 'GET.a.yaml'), 'manual');
    expect(() => writeExtractOutput(dir, [{ name: 'GET.new.yaml', content: 'new' }, { name: 'GET.a.yaml', content: 'replace' }])).toThrow('unmanaged');
    expect(fs.existsSync(path.join(dir, 'GET.new.yaml'))).toBe(false);
    expect(fs.readFileSync(path.join(dir, 'GET.a.yaml'), 'utf8')).toBe('manual');
  });
  it('refuses to overwrite or remove edited managed files', () => {
    const dir = fixture();
    writeExtractOutput(dir, [{ name: 'GET.a.yaml', content: 'generated' }]);
    fs.writeFileSync(path.join(dir, 'GET.a.yaml'), 'edited');
    expect(() => writeExtractOutput(dir, [])).toThrow('modified');
    expect(fs.readFileSync(path.join(dir, 'GET.a.yaml'), 'utf8')).toBe('edited');
  });
  it('rejects traversal in the manifest and does not touch other files', () => {
    const dir = fixture();
    fs.writeFileSync(path.join(dir, '.apic-extract.json'), JSON.stringify({ version: 1, files: { '../escape.yaml': 'a'.repeat(64) } }));
    expect(() => writeExtractOutput(dir, [])).toThrow('Invalid extract manifest');
  });
  it('rejects output junctions', () => {
    const dir = fixture();
    const real = path.join(dir, 'real');
    fs.mkdirSync(real);
    const link = path.join(dir, 'link');
    fs.symlinkSync(real, link, process.platform === 'win32' ? 'junction' : 'dir');
    expect(() => writeExtractOutput(link, [])).toThrow('symbolic link');
  });
});
