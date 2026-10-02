import path from 'node:path';
import { queryFromUrl } from './lib/http-fields';
import { Command } from 'commander';
import { stringify as yamlStringify } from 'yaml';
import { loadCollection } from './lib/canonical';
import {
  exists,
  readJson,
  writeJsonStable,
} from './lib/fsx';
import {
  captureContent,
  capturePostData,
  codeFromBody,
  headersToMap,
  normalizeCaptured,
  parseHar,
  requestHttpMeta,
  responseHttpMeta,
} from './lib/har';
import type { HarEntry, HarLog } from './lib/har';
import {
  maskConfigFromCollection,
  type MaskConfig,
} from './lib/mask';
import {
  defaultSecurityMaskerConfig,
  maskCapturedBody,
  maskHeadersSecure,
  maskUrlSecure,
  type SecurityMaskerConfig,
} from './lib/security-masker';
import { rel, resolvePaths } from './lib/paths';
import { stableStringify } from './lib/stable-json';
import { headerValue } from './lib/body';
import { writeExtractOutput } from './lib/extract-output';
import type {
  Collection,
  ExtractDoc,
  ExtractEndpoint,
  ExtractFrame,
  ExtractReport,
  HttpMethod,
} from './lib/types';

/** Supported HttpMethod values from lib/types.ts. */
const HTTP_METHODS: readonly HttpMethod[] = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
];

function asHttpMethod(raw: string, url: string): HttpMethod {
  const method = raw.toUpperCase();
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw new Error(`Unsupported HTTP method: ${raw} (URL: ${url})`);
  }
  return method as HttpMethod;
}

/** Group requests by pathname, excluding query parameters. */
function pathnameOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    throw new Error(`Cannot group an invalid URL: ${url}`);
  }
}

/** Resolve the capture origin by matching the request host to collection.bases. */
function detectOrigin(url: string, collection: Collection): string | undefined {
  let host: string;
  try {
    host = new URL(url).host;
  } catch {
    return undefined;
  }
  for (const [key, base] of Object.entries(collection.bases)) {
    try {
      if (new URL(base).host === host) return key;
    } catch {
      /** Skip an invalid base URL. */
    }
  }
  return undefined;
}

/** Preserve input order when capture timestamps are equal. */
interface OrderedFrame {
  frame: ExtractFrame;
  order: number;
}

interface Group {
  method: HttpMethod;
  path: string;
  frames: OrderedFrame[];
}

function buildFrame(
  entry: HarEntry,
  cfg: MaskConfig,
  sec: SecurityMaskerConfig,
  account: string,
  forcedOrigin: string | undefined,
  collection: Collection,
  order: number,
): ExtractFrame {
  const method = asHttpMethod(entry.request.method, entry.request.url);
  const status = entry.response.status;
  const responseHeaders = maskHeadersSecure(headersToMap(entry.response.headers), cfg, sec) ?? {};
  const requestHeaders = maskHeadersSecure(headersToMap(entry.request.headers), cfg, sec) ?? {};
  const url = maskUrlSecure(entry.request.url, cfg, sec);
  const response = maskCapturedBody(captureContent(entry.response.content, headerValue(responseHeaders, 'content-type')), cfg, sec);
  const request = maskCapturedBody(capturePostData(entry.request.postData, headerValue(requestHeaders, 'content-type')), cfg, sec);
  const origin =
    forcedOrigin ??
    (typeof entry._origin === 'string' && entry._origin.length > 0
      ? entry._origin
      : detectOrigin(entry.request.url, collection));
  return {
    http: status,
    code: codeFromBody(response.body),
    captured: normalizeCaptured(entry.startedDateTime),
    ...(origin !== undefined ? { origin } : {}),
    account,
    request: {
      httpMeta: requestHttpMeta(entry.request),
      method,
      url,
      headers: requestHeaders,
      query: queryFromUrl(url),
      body: request.body,
      ...(request.bodyMeta ? { bodyMeta: request.bodyMeta } : {}),
    },
    response: {
      httpMeta: responseHttpMeta(entry),
      status,
      headers: responseHeaders,
      body: response.body,
      ...(response.bodyMeta ? { bodyMeta: response.bodyMeta } : {}),
    },
  };
}

/** `/catalog/items` -> `GET.catalog.items.yaml`; `/` -> `GET.yaml`. */
function endpointFileName(endpoint: ExtractEndpoint): string {
  const segments = endpoint.path.split('/').filter((s) => s.length > 0);
  const stem =
    segments.length > 0 ? `${endpoint.method}.${segments.join('.')}` : endpoint.method;
  return `${stem}.yaml`;
}

function readHar(file: string): HarLog {
  if (!exists(file)) throw new Error(`HAR file not found: ${file}`);
  let raw: unknown;
  try {
    raw = readJson(file);
  } catch (err) {
    throw new Error(`Cannot read HAR ${file}: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parseHar(raw);
}

interface ExtractOptions {
  out?: string;
  account: string;
  origin?: string;
}

/** Extract masked, grouped and deduplicated HAR frames into YAML drafts and a report. */
export function extractCommand(): Command {
  return new Command()
    .command('extract <har...>')
    .description('Extract HAR into masked, deduplicated YAML drafts and reports')
    .option('--out <dir>', 'Output directory; update only unchanged managed files (default <root>/.raw)')
    .option('--account <label>', 'Sanitized account label', 'anonymous')
    .option('--origin <label>', 'Override the capture origin for every frame (default: auto-detect)')
    .action(async (hars: string[], options: ExtractOptions, command: Command) => {
      const paths = resolvePaths(undefined, command.optsWithGlobals().root);
      const collection = loadCollection(paths);
      const cfg = maskConfigFromCollection(collection);
      const sec = defaultSecurityMaskerConfig();
      const forcedOrigin =
        typeof options.origin === 'string' && options.origin.length > 0
          ? options.origin
          : undefined;

      const inputs: string[] = [];
      const groups = new Map<string, Group>();
      let totalFrames = 0;

      for (const harArg of hars) {
        const harPath = path.resolve(harArg);
        const har = readHar(harPath);
        inputs.push(path.basename(harPath));
        for (const entry of har.log.entries) {
          const frame = buildFrame(
            entry,
            cfg,
            sec,
            options.account,
            forcedOrigin,
            collection,
            totalFrames,
          );
          const requestPath = pathnameOf(entry.request.url);
          const key = `${frame.request.method} ${requestPath}`;
          let group = groups.get(key);
          if (!group) {
            group = { method: frame.request.method, path: requestPath, frames: [] };
            groups.set(key, group);
          }
          group.frames.push({ frame, order: totalFrames });
          totalFrames += 1;
        }
      }

      // Sort endpoints by method and path for deterministic files and reports.
      const orderedGroups = [...groups.values()].sort((a, b) => {
        if (a.method !== b.method) return a.method < b.method ? -1 : 1;
        return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
      });

      // Generate all content first; update unchanged managed files without clearing the directory.
      const outDir = path.resolve(options.out ?? paths.extract);
      if (outDir === paths.root) {
        throw new Error(`--out must not point to the repository root: ${outDir}`);
      }
      const outputFiles: Array<{ name: string; content: string }> = [];

      const reportEndpoints: ExtractReport['endpoints'] = [];
      let totalDuplicates = 0;

      for (const group of orderedGroups) {
        // Sort by capture time, then by original input order.
        const sorted = [...group.frames].sort((a, b) => {
          const ta = Date.parse(a.frame.captured);
          const tb = Date.parse(b.frame.captured);
          if (ta !== tb) return ta - tb;
          return a.order - b.order;
        });

        // Keep the earliest frame for each identical request/response pair.
        const seen = new Set<string>();
        const kept: ExtractFrame[] = [];
        let duplicates = 0;
        for (const { frame } of sorted) {
          // Timing varies between otherwise identical captures; retain the earliest observation.
          const { entryTime: _entryTime, ...httpMeta } = frame.response.httpMeta ?? {};
          const signature = stableStringify({ request: frame.request, response: { ...frame.response, httpMeta } });
          if (seen.has(signature)) {
            duplicates += 1;
            continue;
          }
          seen.add(signature);
          kept.push(frame);
        }
        totalDuplicates += duplicates;

        const endpoint: ExtractEndpoint = { method: group.method, path: group.path, frames: kept };
        const file = path.join(outDir, endpointFileName(endpoint));
        const doc: ExtractDoc = { version: 1, generated_from: inputs, endpoints: [endpoint] };
        outputFiles.push({ name: path.basename(file), content: yamlStringify(doc, { lineWidth: 0 }) });

        reportEndpoints.push({
          method: endpoint.method,
          path: endpoint.path,
          frames: kept.length,
          duplicates,
          output: rel(paths.root, file),
        });
      }

      writeExtractOutput(outDir, outputFiles);
      const report: ExtractReport = {
        command: 'extract',
        inputs,
        endpoints: reportEndpoints,
        frames: totalFrames,
        duplicates: totalDuplicates,
      };
      const firstBase = path.basename(inputs[0], path.extname(inputs[0]));
      writeJsonStable(path.join(paths.reports, `extract-${firstBase}.json`), report);

      console.log(
        `extract: ${reportEndpoints.length} endpoints / ${totalFrames} frames (${totalDuplicates} duplicates) -> ${outDir}`,
      );
    });
}
