import { Command, InvalidArgumentError } from 'commander';
import { loadCorpus } from './lib/canonical';
import { resolvePaths } from './lib/paths';
import { startReplayServer } from './mock/replay';

function portNumber(value: string): number {
  if (!/^\d+$/.test(value) || Number(value) > 65535) {
    throw new InvalidArgumentError('Use a port from 0 to 65535 (0 chooses a free port).');
  }
  return Number(value);
}

/** Keep a loopback replay server available for interactive Postman sessions. */
export function serveCommand(): Command {
  return new Command('serve')
    .description('Serve canonical recordings locally until Ctrl+C')
    .option('--port <port>', 'Loopback port; 0 selects a free port', portNumber, 4010)
    .action(async (options: { port: number }, command: Command) => {
      const corpus = loadCorpus(resolvePaths(undefined, command.optsWithGlobals().root));
      if (!corpus.apis.some((api) => api.examples.length > 0)) {
        throw new Error('No canonical recordings are available. Classify captures before starting replay.');
      }
      const server = await startReplayServer(corpus, { port: options.port }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE') throw new Error(`Port ${options.port} is in use. Run apic serve --port 4011 and set the Postman replay environment baseUrl to http://127.0.0.1:4011.`);
        throw error;
      });
      console.log(`Replay listening at ${server.url}`);
      console.log(`Import dist/postman/endpoints.postman_collection.json and replay.postman_environment.json. Select the local replay environment; set baseUrl to ${server.url}.`);
      console.log('Keep masked placeholders unchanged for replay. Press Ctrl+C to stop.');
      await new Promise<void>((resolve, reject) => {
        const stop = () => {
          process.removeListener('SIGINT', stop);
          process.removeListener('SIGTERM', stop);
          server.close().then(resolve, reject);
        };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
      });
    });
}
