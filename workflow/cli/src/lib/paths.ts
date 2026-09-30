import fs from 'node:fs';
import path from 'node:path';

/** Absolute paths to repository files and directories. */
export interface ProjectPaths {
  root: string;
  apis: string;
  sources: string;
  extract: string;
  dist: string;
  docs: string;
  agent: string;
  postman: string;
  reports: string;
  schema: string;
  collectionFile: string;
  glossaryFile: string;
}

export function projectPaths(root: string): ProjectPaths {
  const dist = path.join(root, 'dist');
  return {
    root,
    apis: path.join(root, 'apis'),
    sources: path.join(root, 'sources'),
    extract: path.join(root, '.raw'),
    dist,
    docs: path.join(dist, 'docs'),
    agent: path.join(dist, 'agent'),
    postman: path.join(dist, 'postman'),
    reports: path.join(root, '.reports'),
    schema: path.join(root, 'schema'),
    collectionFile: path.join(root, 'collection.json'),
    glossaryFile: path.join(root, 'glossary.json'),
  };
}

/** Find the nearest ancestor containing both collection.json and workflow. */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (
      fs.existsSync(path.join(dir, 'collection.json')) &&
      fs.existsSync(path.join(dir, 'workflow'))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Cannot locate the repository root from ${startDir}: no ancestor contains both collection.json and workflow`,
  );
}

/** Locate the repository and construct its paths. */
export function resolvePaths(startDir?: string): ProjectPaths {
  return projectPaths(findRepoRoot(startDir));
}

/** Return a repository-relative path using POSIX separators. */
export function rel(root: string, file: string): string {
  const r = path.relative(root, file);
  return r.split(path.sep).join('/');
}
