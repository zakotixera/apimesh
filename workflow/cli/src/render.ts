import path from 'node:path';
import { Command } from 'commander';
import { loadCorpus } from './lib/canonical';
import { clearDirExcept, writeTextStable } from './lib/fsx';
import { resolvePaths, type ProjectPaths } from './lib/paths';
import type { GeneratedFile } from './lib/types';
import { renderAgent } from './renderers/agent';
import { renderDocs } from './renderers/docs';
import { renderPostman } from './renderers/postman';

interface RenderOptions {
  docs?: boolean;
  agent?: boolean;
  postman?: boolean;
  all?: boolean;
}

/** Replace generated files while preserving the handwritten README; return the file count. */
function writeGroup(paths: ProjectPaths, dir: string, files: GeneratedFile[]): number {
  const destinations = new Set<string>();
  for (const file of files) {
    const destination = path.resolve(paths.dist, file.path).toLowerCase();
    if (destinations.has(destination)) throw new Error(`Conflicting generated path: ${file.path}; separate canonical endpoints before rendering`);
    destinations.add(destination);
  }
  clearDirExcept(dir, ['README.md']);
  for (const file of files) {
    writeTextStable(path.join(paths.dist, file.path), file.content);
  }
  return files.length;
}

/** Render canonical data into deterministic distribution artifacts. */
export function renderCommand(): Command {
  return new Command('render')
    .description('Render canonical data into dist/{docs,agent,postman} (default: all)')
    .option('--docs', 'Render dist/docs only')
    .option('--agent', 'Render dist/agent only')
    .option('--postman', 'Render dist/postman only')
    .option('--all', 'Render all outputs (default)')
    .action(async (options: RenderOptions) => {
      const paths = resolvePaths();
      const corpus = loadCorpus(paths.root);

      const anySpecific =
        options.docs === true || options.agent === true || options.postman === true;
      const docs = options.all === true || !anySpecific || options.docs === true;
      const agent = options.all === true || !anySpecific || options.agent === true;
      const postman = options.all === true || !anySpecific || options.postman === true;

      const parts: string[] = [];
      if (docs) parts.push(`docs ${writeGroup(paths, paths.docs, renderDocs(corpus))}`);
      if (agent) parts.push(`agent ${writeGroup(paths, paths.agent, renderAgent(corpus))}`);
      if (postman) parts.push(`postman ${writeGroup(paths, paths.postman, renderPostman(corpus))}`);

      console.log(`render: ${parts.join(' / ')} files -> ${paths.dist}`);
    });
}
