import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { loadCorpus } from './lib/canonical';
import { writeTextStable } from './lib/fsx';
import { resolvePaths, type ProjectPaths } from './lib/paths';
import { assertUnlinkedPath } from './lib/output-snapshot';
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
  assertUnlinkedPath(dir, paths.root);
  const destinations = new Set<string>();
  for (const file of files) {
    const destinationPath = path.resolve(paths.dist, file.path);
    const relative = path.relative(dir, destinationPath);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`Generated path escapes its output group: ${file.path}`);
    }
    const destination = destinationPath.toLowerCase();
    if (destinations.has(destination)) throw new Error(`Conflicting generated path: ${file.path}; separate canonical endpoints before rendering`);
    destinations.add(destination);
  }
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  const staging = fs.mkdtempSync(path.join(path.dirname(dir), `.${path.basename(dir)}.staging-`));
  let backup: string | undefined;
  let swapped = false;
  try {
    const readme = path.join(dir, 'README.md');
    if (fs.existsSync(readme)) {
      const stat = fs.lstatSync(readme);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`Output README is not a regular file: ${readme}`);
      fs.copyFileSync(readme, path.join(staging, 'README.md'));
    }
    for (const file of files) {
      const destinationPath = path.resolve(paths.dist, file.path);
      writeTextStable(path.join(staging, path.relative(dir, destinationPath)), file.content);
    }
    backup = path.join(path.dirname(dir), `.${path.basename(dir)}.backup-${process.pid}-${Date.now()}`);
    if (fs.existsSync(dir)) fs.renameSync(dir, backup);
    fs.renameSync(staging, dir);
    swapped = true;
    if (backup) fs.rmSync(backup, { recursive: true, force: true });
  } catch (error) {
    if (!swapped && backup && !fs.existsSync(dir) && fs.existsSync(backup)) fs.renameSync(backup, dir);
    throw error;
  } finally {
    if (fs.existsSync(staging)) fs.rmSync(staging, { recursive: true, force: true });
    if (swapped && backup && fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
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
    .action(async (options: RenderOptions, command: Command) => {
      const paths = resolvePaths(undefined, command.optsWithGlobals().root);
      const corpus = loadCorpus(paths);

      const anySpecific =
        options.docs === true || options.agent === true || options.postman === true;
      const docs = options.all === true || !anySpecific || options.docs === true;
      const agent = options.all === true || !anySpecific || options.agent === true;
      const postman = options.all === true || !anySpecific || options.postman === true;

      // Generate every group before mutating dist so renderer failures cannot delete a prior group.
      const docsFiles = docs ? renderDocs(corpus) : undefined;
      const agentFiles = agent ? renderAgent(corpus) : undefined;
      const postmanFiles = postman ? renderPostman(corpus) : undefined;
      const parts: string[] = [];
      if (docsFiles) parts.push(`docs ${writeGroup(paths, paths.docs, docsFiles)}`);
      if (agentFiles) parts.push(`agent ${writeGroup(paths, paths.agent, agentFiles)}`);
      if (postmanFiles) parts.push(`postman ${writeGroup(paths, paths.postman, postmanFiles)}`);

      console.log(`render: ${parts.join(' / ')} files -> ${paths.dist}`);
    });
}
