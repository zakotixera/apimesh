import path from 'node:path';
import type { Collection, Definition, Example, Glossary } from './types';
import { rel, type ProjectPaths } from './paths';
import { exists, readJson, walk } from './fsx';
import type { SchemaValidators } from './schemas';
import { loadSchemas } from './schemas';
import { authRegistryMismatches } from './mask';

/** Loaded example and source file information. */
export interface LoadedExample {
  /** Example filename, such as 200.code0.normal.json. */
  name: string;
  file: string;
  relFile: string;
  data: Example;
}

/** Loaded API definition, examples and optional notes. */
export interface LoadedApi {
  file: string;
  relFile: string;
  dir: string;
  /** Directory relative to apis, such as api.example.invalid/catalog/items. */
  relDir: string;
  definition: Definition;
  /** Examples ordered by filename. */
  examples: LoadedExample[];
  notesFile?: string;
  relNotesFile?: string;
}

export interface LoadedCorpus {
  paths: ProjectPaths;
  collection: Collection;
  glossary: Glossary;
  apis: LoadedApi[];
}

export function loadCollection(paths: ProjectPaths): Collection {
  if (!exists(paths.collectionFile)) {
    throw new Error(`Missing collection.json: ${paths.collectionFile}`);
  }
  return readJson<Collection>(paths.collectionFile);
}

export function loadGlossary(paths: ProjectPaths): Glossary {
  if (!exists(paths.glossaryFile)) {
    throw new Error(`Missing glossary.json: ${paths.glossaryFile}`);
  }
  return readJson<Glossary>(paths.glossaryFile);
}

function readValidated<T>(file: string, validate: (value: unknown) => string[], label: string): T {
  let value: unknown;
  try {
    value = readJson(file);
  } catch (error) {
    throw new Error(`Cannot read ${label} ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const errors = validate(value);
  if (errors.length > 0) throw new Error(`Invalid ${label} ${file}: ${errors.join('; ')}`);
  return value as T;
}

function ensureAuthNames(collection: Collection): void {
  const mismatch = authRegistryMismatches(collection)[0];
  if (mismatch) {
    throw new Error(`Invalid collection auth registry: key ${mismatch.key} must equal profile.name ${mismatch.name}`);
  }
}

/** Find files that cannot belong to a canonical endpoint and would otherwise be silently ignored. */
export function findCanonicalOrphans(paths: ProjectPaths): string[] {
  const definitionFiles = walk(paths.apis, (file) => path.basename(file) === 'definition.json');
  const definitionDirs = new Set(definitionFiles.map((file) => path.dirname(file)));
  return walk(paths.apis).filter((file) => {
    const base = path.basename(file);
    const dir = path.dirname(file);
    if (base === 'definition.json' || base === 'README.md') return false;
    if (base === 'notes.md' && definitionDirs.has(dir)) return false;
    const examplesDir = path.basename(dir) === 'examples' ? dir : undefined;
    return !(examplesDir && definitionDirs.has(path.dirname(examplesDir)) && base.endsWith('.json'));
  });
}

export function loadCanonicalApis(paths: ProjectPaths, schemas?: SchemaValidators): LoadedApi[] {
  const defFiles = walk(paths.apis, (file) => path.basename(file) === 'definition.json');
  return defFiles.map((file) => {
    const dir = path.dirname(file);
    const definition = schemas
      ? readValidated<Definition>(file, schemas.definition, 'definition')
      : readJson<Definition>(file);
    const examplesDir = path.join(dir, 'examples');
    const examples: LoadedExample[] = walk(examplesDir, (f) => f.endsWith('.json')).map((ef) => {
      const data = schemas
        ? readValidated<Example>(ef, schemas.example, 'example')
        : readJson<Example>(ef);
      return { name: path.basename(ef), file: ef, relFile: rel(paths.root, ef), data };
    });
    const notesFile = path.join(dir, 'notes.md');
    const hasNotes = exists(notesFile);
    return {
      file,
      relFile: rel(paths.root, file),
      dir,
      relDir: rel(paths.apis, dir),
      definition,
      examples,
      notesFile: hasNotes ? notesFile : undefined,
      relNotesFile: hasNotes ? rel(paths.root, notesFile) : undefined,
    };
  });
}

export function loadValidatedCollection(paths: ProjectPaths): Collection {
  const schemas = loadSchemas(paths);
  const collection = readValidated<Collection>(paths.collectionFile, schemas.collection, 'collection');
  ensureAuthNames(collection);
  return collection;
}

/** Load canonical data using the command's already resolved execution context. */
export function loadCorpus(paths: ProjectPaths): LoadedCorpus {
  const schemas = loadSchemas(paths);
  const orphans = findCanonicalOrphans(paths);
  if (orphans.length > 0) {
    throw new Error(`Canonical corpus contains unmanaged files: ${orphans.map((file) => rel(paths.root, file)).join(', ')}`);
  }
  const collection = readValidated<Collection>(paths.collectionFile, schemas.collection, 'collection');
  ensureAuthNames(collection);
  return {
    paths,
    collection,
    glossary: readValidated<Glossary>(paths.glossaryFile, schemas.glossary, 'glossary'),
    apis: loadCanonicalApis(paths, schemas),
  };
}
