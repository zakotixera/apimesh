import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyCommand } from '../src/verify';
import * as paths from '../src/lib/paths';
import { temporaryDirectory, removeTemporaryDirectory } from './fixtures';

const spawn = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawnSync: spawn }));
const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); spawn.mockReset(); roots.splice(0).forEach(removeTemporaryDirectory); });

it.each(['bytes', 'filenames'])('stops before replay on nondeterministic output %s', async (difference) => {
  const root = temporaryDirectory(); roots.push(root);
  const project = paths.projectPaths(root);
  vi.spyOn(paths, 'resolvePaths').mockReturnValue(project);
  let render = 0;
  spawn.mockImplementation((_file, args: string[]) => {
    if (args.includes('render')) {
      render++;
      fs.mkdirSync(project.docs, { recursive: true });
      fs.writeFileSync(path.join(project.docs, difference === 'filenames' ? `${render}.md` : 'index.md'), difference === 'bytes' ? String(render) : 'same');
    }
    return { status: 0 };
  });
  await expect(verifyCommand().parseAsync([], { from: 'user' })).rejects.toThrow('paths or bytes changed');
  expect(spawn.mock.calls.some((call) => call[1].includes('test'))).toBe(false);
  expect(JSON.parse(fs.readFileSync(path.join(project.reports, 'verify.json'), 'utf8')).stages.at(-1)).toEqual({ stage: 'stability', status: 'failed' });
});
