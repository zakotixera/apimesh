import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * Reject linked path components inside an application boundary before writing
 * or traversing application outputs. System path aliases (for example,
 * macOS's `/var` -> `/private/var`) may appear above that boundary.
 */
export function assertUnlinkedPath(target: string, boundary: string = target): void {
  const resolvedTarget = path.resolve(target);
  const resolvedBoundary = path.resolve(boundary);
  const relative = path.relative(resolvedBoundary, resolvedTarget);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`Output path is outside its safety boundary: ${resolvedTarget}`);
  }
  let current = resolvedTarget;
  for (;;) {
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink or junction is not an output path: ${current}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    if (current === resolvedBoundary) return;
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/** Include every output filename and byte, including files not tracked by Git. */
export function outputSnapshot(directory: string, boundary: string = directory): Array<[string, string]> {
  assertUnlinkedPath(directory, boundary);
  if (!fs.existsSync(directory)) return [];
  const result: Array<[string, string]> = [];
  const visit = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symlink or junction is not an output path: ${file}`);
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile()) result.push([path.relative(directory, file).split(path.sep).join('/'), createHash('sha256').update(fs.readFileSync(file)).digest('hex')]);
      else throw new Error(`Not a regular output file: ${file}`);
    }
  };
  visit(directory);
  return result;
}
