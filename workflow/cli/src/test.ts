import path from 'node:path';
import { Command } from 'commander';
import { loadCorpus } from './lib/canonical';
import { exists, readJson, writeTextStable } from './lib/fsx';
import { resolvePaths } from './lib/paths';
import { startReplayServer } from './mock/replay';
import {
  POSTMAN_COLLECTION_FILE,
  POSTMAN_ENVIRONMENT_FILE,
  renderPostman,
} from './renderers/postman';

interface TestOptions {
  timeout: string;
}

interface NewmanFailure {
  source?: { name?: string };
  error?: { test?: string; message?: string };
}

/** Run Newman against the local recording replay server. */
export function testCommand(): Command {
  return new Command('test')
    .description('Test generated Postman artifacts against local recordings')
    .option('--timeout <ms>', 'Per-request timeout in milliseconds', '10000')
    .action(async (options: TestOptions) => {
      const paths = resolvePaths();
      const corpus = loadCorpus(paths.root);
      if (!corpus.apis.some((api) => api.examples.length > 0)) {
        throw new Error('No canonical recordings are available for replay');
      }

      const collectionFile = path.join(paths.dist, POSTMAN_COLLECTION_FILE);
      const environmentFile = path.join(paths.dist, POSTMAN_ENVIRONMENT_FILE);
      // Render only missing artifacts; existing artifacts allow stale-output detection.
      if (!exists(collectionFile) || !exists(environmentFile)) {
        for (const file of renderPostman(corpus)) {
          writeTextStable(path.join(paths.dist, file.path), file.content);
        }
      }

      const collection = readJson(collectionFile);
      // Load Newman only for this command.
      const { default: newman } = await import('newman');
      const server = await startReplayServer(corpus);
      const timeout = Number.parseInt(options.timeout, 10) || 10000;

      const environment = {
        id: 'local-replay',
        name: `${corpus.collection.name} · local replay`,
        values: [
          { key: 'baseUrl', value: server.url, enabled: true, type: 'default' },
          { key: 'apicReplay', value: 'true', enabled: true, type: 'default' },
        ],
        _postman_variable_scope: 'environment',
      };

      try {
        await new Promise<void>((resolve) => {
          newman.run(
            {
              collection,
              environment,
              reporters: ['cli'],
              timeoutRequest: timeout,
              insecure: true,
              ignoreRedirects: true,
              delayRequest: 0,
            },
            (err, summary) => {
              if (err) {
                console.error(`test: Newman failed: ${err.message}`);
                process.exitCode = 1;
              } else {
                const failures = (summary?.run?.failures ?? []) as NewmanFailure[];
                const assertions = summary?.run?.stats?.assertions;
                if (!assertions?.total) {
                  console.error('test: no assertions were executed');
                  process.exitCode = 1;
                }
                console.log(
                  `test: ${assertions?.total ?? '?'} assertions (${assertions?.failed ?? failures.length} failed)`,
                );
                if (failures.length > 0) {
                  process.exitCode = 1;
                  for (const failure of failures) {
                    const line = [failure.source?.name, failure.error?.test, failure.error?.message]
                      .filter(Boolean)
                      .join(' · ');
                    console.error(`test FAIL: ${line}`);
                  }
                }
              }
              resolve();
            },
          );
        });
      } finally {
        await server.close();
      }
      if (server.failures > 0) {
        console.error(`test: ${server.failures} requests did not match a unique recording`);
        process.exitCode = 1;
      }
      if (server.remaining.length > 0) {
        console.error(`test: ${server.remaining.length} canonical recordings were not exercised`);
        process.exitCode = 1;
      }
    });
}
