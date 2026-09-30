import { afterEach, describe, expect, it, vi } from 'vitest';
import * as canonical from '../src/lib/canonical';
import * as paths from '../src/lib/paths';
import { serveCommand } from '../src/serve';
import { startReplayServer } from '../src/mock/replay';
import { corpus, example } from './fixtures';

afterEach(() => vi.restoreAllMocks());
function setup() {
  const data = corpus([example()]);
  vi.spyOn(paths, 'resolvePaths').mockReturnValue(data.paths);
  vi.spyOn(canonical, 'loadCorpus').mockReturnValue(data);
  return data;
}

describe('interactive replay command', () => {
  it('serves requests until shutdown and releases the selected port', async () => {
    setup();
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const signals = new Map<string, () => void>();
    const once = process.once.bind(process);
    vi.spyOn(process, 'once').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') { signals.set(event, listener); return process; }
      return once(event, listener);
    }) as typeof process.once);
    const run = serveCommand().parseAsync(['--port', '0'], { from: 'user' });
    try {
      await vi.waitFor(() => expect(signals.has('SIGINT')).toBe(true));
      const url = String(log.mock.calls[0][0]).replace('Replay listening at ', '');
      const response = await fetch(`${url}/x?a=1&a=2`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"item":1}' });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ code: 0, data: 'recorded' });
      signals.get('SIGINT')!();
      await run;
      await expect(fetch(url)).rejects.toThrow();
    } finally {
      signals.get('SIGTERM')?.();
      await run;
    }
  });
  it('explains how to recover when a port is occupied', async () => {
    const data = setup();
    const server = await startReplayServer(data);
    try {
      await expect(serveCommand().parseAsync(['--port', new URL(server.url).port], { from: 'user' })).rejects.toThrow('is in use. Run apic serve --port 4011');
    } finally { await server.close(); }
  });
  it('rejects an empty corpus with a recovery instruction', async () => {
    setup().apis[0].examples = [];
    await expect(serveCommand().parseAsync([], { from: 'user' })).rejects.toThrow('Classify captures');
  });
});
