import fs from 'node:fs';
import path from 'node:path';
import { stableStringify } from './stable-json';

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function exists(p: string): boolean {
  return fs.existsSync(p);
}

export function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function readText(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

export function readJson<T = unknown>(file: string): T {
  return JSON.parse(readText(file)) as T;
}

/** Write UTF-8 text without a BOM, normalizing CRLF to LF and ensuring a trailing newline. */
export function writeTextStable(file: string, content: string): void {
  ensureDir(path.dirname(file));
  const normalized = content.replace(/\r\n/g, '\n');
  const withNewline = normalized.endsWith('\n') ? normalized : `${normalized}\n`;
  fs.writeFileSync(file, withNewline, { encoding: 'utf8' });
}

/** Write JSON with recursively sorted keys. */
export function writeJsonStable(file: string, value: unknown): void {
  writeTextStable(file, stableStringify(value));
}

/** Walk files in deterministic path order; return an empty list for missing directories. */
export function walk(dir: string, filter?: (file: string) => boolean): string[] {
  if (!exists(dir)) return [];
  const out: string[] = [];
  const recurse = (current: string): void => {
    const entries = fs
      .readdirSync(current, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        recurse(full);
      } else if (!filter || filter(full)) {
        out.push(full);
      }
    }
  };
  recurse(dir);
  return out;
}

/** Recursively remove a generated output directory. */
export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

/** Clear a directory except for named top-level files, such as a handwritten README. */
export function clearDirExcept(dir: string, keep: string[] = []): void {
  if (!exists(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (keep.includes(entry.name)) continue;
    fs.rmSync(path.join(dir, entry.name), { recursive: true, force: true });
  }
}

/** List direct subdirectories in deterministic order. */
export function listDirs(dir: string): string[] {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}
