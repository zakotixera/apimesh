import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { stableStringify } from './stable-json';

const MANIFEST = '.apic-extract.json';
interface Manifest { version: 1; files: Record<string, string> }
const digest = (content: string): string => createHash('sha256').update(content).digest('hex');
function statIfPresent(file: string): fs.Stats | undefined {
  try { return fs.lstatSync(file); } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw err;
  }
}

function assertRegularTree(dir: string): void {
  const stat = statIfPresent(dir);
  if (!stat) return;
  if (stat.isSymbolicLink()) throw new Error(`Extract output contains a symlink or junction: ${dir}`);
  if (stat.isDirectory()) {
    for (const entry of fs.readdirSync(dir)) assertRegularTree(path.join(dir, entry));
  } else if (!stat.isFile()) {
    throw new Error(`Extract output contains a non-regular file: ${dir}`);
  }
}

function copyDirectoryContents(source: string, target: string): void {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) fs.cpSync(from, to, { recursive: true });
    else fs.copyFileSync(from, to);
  }
}

/** Update only unchanged, manifest-owned artifacts; never recursively clear the output directory. */
export function writeExtractOutput(dir: string, files: Array<{ name: string; content: string }>): void {
  const target = path.resolve(dir);
  // Reject symlinks and junctions in the output path.
  for (let current = target;; current = path.dirname(current)) {
    if (statIfPresent(current)?.isSymbolicLink()) {
      throw new Error(`Extract output must not pass through a symbolic link: ${current}`);
    }
    if (path.dirname(current) === current) break;
  }
  const manifestFile = path.join(target, MANIFEST);
  let previous: Manifest = { version: 1, files: {} };
  const validName = (name: string): boolean =>
    name.endsWith('.yaml') && !/[\\/:]/.test(name) && !name.startsWith('.');
  const manifestStat = statIfPresent(manifestFile);
  if (manifestStat) {
    if (!manifestStat.isFile() || manifestStat.isSymbolicLink()) {
      throw new Error(`Extract manifest is not a regular file: ${manifestFile}`);
    }
    previous = JSON.parse(fs.readFileSync(manifestFile, 'utf8')) as Manifest;
    if (!previous || previous.version !== 1 || !previous.files || typeof previous.files !== 'object' ||
        Array.isArray(previous.files) || Object.entries(previous.files).some(
          ([name, hash]) => !validName(name) || typeof hash !== 'string' || !/^[a-f0-9]{64}$/.test(hash),
        )) throw new Error(`Invalid extract manifest: ${manifestFile}`);
  }
  const next: Manifest = { version: 1, files: {} };
  const normalized = files.map(({ name, content }) => {
    if (!validName(name)) throw new Error(`Invalid extract filename: ${name}`);
    if (Object.hasOwn(next.files, name)) throw new Error(`Duplicate extract filename: ${name}`);
    const text = content.replace(/\r\n/g, '\n').replace(/\n?$/, '\n');
    next.files[name] = digest(text);
    return { name, content: text };
  });
  // Check every conflict before writing. Existing files without a manifest are not adopted.
  for (const name of new Set([...Object.keys(previous.files), ...Object.keys(next.files)])) {
    const file = path.join(target, name);
    const stat = statIfPresent(file);
    if (!stat) continue;
    if (!stat.isFile() || stat.isSymbolicLink() || !Object.hasOwn(previous.files, name) ||
        digest(fs.readFileSync(file, 'utf8')) !== previous.files[name]) {
      throw new Error(`Refusing to overwrite or delete an unmanaged or modified file: ${file}; use a new --out directory`);
    }
  }
  assertRegularTree(target);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(target), `.${path.basename(target)}.staging-`));
  let backup: string | undefined;
  let swapped = false;
  try {
    if (statIfPresent(target)) copyDirectoryContents(target, staging);
    for (const file of normalized) fs.writeFileSync(path.join(staging, file.name), file.content, 'utf8');
    for (const name of Object.keys(previous.files)) {
      if (!Object.hasOwn(next.files, name)) fs.rmSync(path.join(staging, name), { force: true });
    }
    fs.writeFileSync(path.join(staging, MANIFEST), stableStringify(next), 'utf8');

    backup = path.join(path.dirname(target), `.${path.basename(target)}.backup-${process.pid}-${Date.now()}`);
    if (statIfPresent(target)) fs.renameSync(target, backup);
    fs.renameSync(staging, target);
    swapped = true;
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!swapped && backup && !statIfPresent(target) && statIfPresent(backup)) fs.renameSync(backup, target);
    throw error;
  } finally {
    if (statIfPresent(staging)) fs.rmSync(staging, { recursive: true, force: true });
    if (swapped && backup && statIfPresent(backup)) fs.rmSync(backup, { recursive: true, force: true });
  }
}
