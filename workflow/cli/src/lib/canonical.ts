import path from 'node:path';
import type { Collection, Definition, Example, Glossary } from './types';
import { projectPaths, rel, type ProjectPaths } from './paths';
import { exists, readJson, walk } from './fsx';

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
  /** Directory relative to apis, such as x/web-interface/view. */
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

export function loadCanonicalApis(paths: ProjectPaths): LoadedApi[] {
  const defFiles = walk(paths.apis, (file) => path.basename(file) === 'definition.json');
  return defFiles.map((file) => {
    const dir = path.dirname(file);
    const definition = readJson<Definition>(file);
    const examplesDir = path.join(dir, 'examples');
    const examples: LoadedExample[] = walk(examplesDir, (f) => f.endsWith('.json')).map((ef) => ({
      name: path.basename(ef),
      file: ef,
      relFile: rel(paths.root, ef),
      data: readJson<Example>(ef),
    }));
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

/** Load collection, glossary and canonical APIs from the repository root. */
export function loadCorpus(root: string): LoadedCorpus {
  const paths = projectPaths(root);
  return {
    paths,
    collection: loadCollection(paths),
    glossary: loadGlossary(paths),
    apis: loadCanonicalApis(paths),
  };
}
