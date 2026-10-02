import fs from 'node:fs';
import path from 'node:path';

/** One execution context: collection outputs and resources from the running toolchain. */
export interface ProjectPaths {
  root: string;
  toolchainRoot: string;
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
  root = path.resolve(root);
  const toolchainRoot = path.resolve(__dirname, '../../../..');
  const dist = path.join(root, 'dist');
  return {
    root,
    toolchainRoot,
    apis: path.join(root, 'apis'),
    sources: path.join(root, 'sources'),
    extract: path.join(root, '.raw'),
    dist,
    docs: path.join(dist, 'docs'),
    agent: path.join(dist, 'agent'),
    postman: path.join(dist, 'postman'),
    reports: path.join(root, '.reports'),
    schema: path.join(toolchainRoot, 'schema'),
    collectionFile: path.join(root, 'collection.json'),
    glossaryFile: path.join(root, 'glossary.json'),
  };
}

/** Templates are resources, never a collection discovered from the working directory. */
function isTemplateDirectory(dir: string): boolean {
  const templates = path.resolve(__dirname, '../../../templates');
  const relative = path.relative(templates, dir);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

/** Find the nearest collection marker, including incomplete collections for useful errors. */
export function findRepoRoot(startDir: string = process.cwd()): string {
  let dir = path.resolve(startDir);
  for (;;) {
    if (
      !isTemplateDirectory(dir) &&
      (fs.existsSync(path.join(dir, 'collection.json')) ||
        fs.existsSync(path.join(dir, 'glossary.json')))
    ) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Cannot locate a collection from ${startDir}: no ancestor contains collection.json or glossary.json; use --root <directory>`,
  );
}

/** An explicit root targets exactly that directory; it never falls back to an ancestor. */
export function resolvePaths(startDir?: string, explicitRoot?: string): ProjectPaths {
  const paths = projectPaths(explicitRoot === undefined ? findRepoRoot(startDir) : explicitRoot);
  if (isTemplateDirectory(paths.root)) throw new Error('Toolchain templates are not a collection; copy the metadata to an application directory');
  for (const file of [paths.collectionFile, paths.glossaryFile]) {
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) throw new Error(`Missing ${path.basename(file)}: ${file}`);
  }
  return paths;
}

/** Return a repository-relative path using POSIX separators. */
export function rel(root: string, file: string): string {
  const r = path.relative(root, file);
  return r.split(path.sep).join('/');
}
