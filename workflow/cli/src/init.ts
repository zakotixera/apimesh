import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { projectPaths, rel } from './lib/paths';
import { assertUnlinkedPath } from './lib/output-snapshot';
import { readJson } from './lib/fsx';

interface InitOptions { name?: string; dryRun?: boolean }

function within(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Create application scaffolding without replacing any existing file. */
export function initCommand(): Command {
  return new Command('init')
    .description('Create missing collection metadata, package scripts, Git defaults and CI')
    .option('--name <name>', 'Collection display name (default: directory name)')
    .option('--dry-run', 'List planned and preserved files without writing')
    .action((options: InitOptions, command: Command) => {
      const paths = projectPaths(command.optsWithGlobals().root ?? process.cwd());
      assertUnlinkedPath(paths.root);
      if (within(paths.toolchainRoot, paths.root)) throw new Error('Initialize an application outside the toolchain, not inside vendor/apimesh');
      // A source checkout may initialize another repository before it vendors apimesh.
      const vendor = within(paths.root, paths.toolchainRoot) ? rel(paths.root, paths.toolchainRoot) : 'vendor/apimesh';
      if (!/^[a-zA-Z0-9_./ -]+$/.test(vendor)) throw new Error('Vendor path must use letters, numbers, spaces, dots, underscores, slashes or hyphens');
      const name = options.name ?? path.basename(paths.root);
      if (!name.trim()) throw new Error('Collection name must not be empty');
      const templates = path.join(paths.toolchainRoot, 'workflow/templates');
      const collection = readJson<Record<string, unknown>>(path.join(templates, 'collection.json'));
      const files = new Map<string, string>([
        ['collection.json', JSON.stringify({ ...collection, name }, null, 2)],
        ['glossary.json', fs.readFileSync(path.join(templates, 'glossary.json'), 'utf8')],
      ]);
      for (const file of ['package.json', '.gitignore', '.gitattributes', '.github/workflows/verify.yml', 'AGENTS.md', 'README.md']) {
        files.set(file, fs.readFileSync(path.join(templates, 'application', `${file}.tmpl`), 'utf8')
          .replaceAll('__APIMESH_VENDOR__', vendor));
      }
      // Preflight the entire set before creating anything, including dry runs.
      for (const file of [...files.keys(), 'sources']) {
        const target = path.join(paths.root, file);
        assertUnlinkedPath(target);
        if (fs.existsSync(target) && fs.statSync(target).isDirectory() !== (file === 'sources')) {
          throw new Error(`Unexpected file type at initialization destination: ${target}`);
        }
        for (let parent = path.dirname(target); within(paths.root, parent); parent = path.dirname(parent)) {
          if (fs.existsSync(parent) && !fs.statSync(parent).isDirectory()) throw new Error(`Not a directory: ${parent}`);
          if (parent === paths.root) break;
        }
      }
      let created = 0;
      let preserved = 0;
      for (const [file, content] of files) {
        const target = path.join(paths.root, file);
        if (fs.existsSync(target)) { preserved++; console.log(`preserve ${file}`); continue; }
        created++;
        console.log(`${options.dryRun ? 'would create' : 'create'} ${file}`);
        if (!options.dryRun) {
          fs.mkdirSync(path.dirname(target), { recursive: true });
          fs.writeFileSync(target, content.replace(/\r\n/g, '\n').replace(/\n?$/, '\n'), { encoding: 'utf8', flag: 'wx' });
        }
      }
      if (!options.dryRun) fs.mkdirSync(paths.sources, { recursive: true });
      console.log(`init: ${created} ${options.dryRun ? 'planned' : 'created'} / ${preserved} preserved -> ${paths.root}`);
      if (preserved) console.log('Existing files were preserved; reconcile scripts and Git/CI settings with workflow/templates/application before using them.');
      console.log(`Review collection metadata and masking rules, then add HARs to sources/. Scripts expect the toolchain at ${vendor}. No recordings have been imported.`);
    });
}
