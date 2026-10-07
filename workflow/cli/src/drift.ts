import path from 'node:path';
import { Command } from 'commander';
import { loadCorpus, type LoadedApi } from './lib/canonical';
import { writeJsonStable } from './lib/fsx';
import { buildCaptureFrame, pathnameOf, readHar } from './lib/capture';
import { maskConfigFromCollection } from './lib/mask';
import { defaultSecurityMaskerConfig } from './lib/security-masker';
import { rel, resolvePaths } from './lib/paths';
import { compareCodepoint } from './lib/stable-json';
import { bodyForAnalysis } from './lib/body';
import { compareBody } from './lib/body-drift';
import type { DriftChange, DriftReport, ExtractFrame, Variant } from './lib/types';

/** Compare new HAR captures with canonical definitions. Match method/path and HTTP/business code, then recursively inspect the BodyNode structure. Findings are advisory and do not change the exit code. */

/** Match both HTTP status and business code; null codes match HTTP-only variants. */
function variantMatches(v: Variant, http: number, code: number | null, api: LoadedApi): boolean {
  const recordings = api.examples.filter((example) => v.examples?.includes(example.name));
  if (recordings.length > 0) {
    return recordings.some(({ data }) => data.http === http && data.code === code);
  }
  // Definitions without recordings retain the legacy declaration-based fallback.
  if (!v.http.includes(http)) return false;
  return code === null ? v.codes.length === 0 : v.codes.includes(code);
}

/** Check a numeric business code; null is never a registered business code. */
function codesInclude(v: Variant, code: number | null): boolean {
  return code !== null && v.codes.includes(code);
}

function apiMatchesOrigin(api: LoadedApi, origin: string): boolean {
  try {
    if (api.definition.endpoint.url) {
      return new URL(api.definition.endpoint.url).origin === origin;
    }
    const origins = new Set(api.examples.map((example) => new URL(example.data.request.url).origin));
    return origins.size === 0 || origins.has(origin);
  } catch {
    return false;
  }
}

/** Classify a frame into zero or more observations. Compare matched BodyNode schemas recursively; field absence is advisory because requiredness is unknown. */
function classifyFrame(
  frame: ExtractFrame,
  requestPath: string,
  apis: LoadedApi[],
): DriftChange[] {
  const frameOrigin = new URL(frame.request.url).origin;
  const candidates = apis.filter(
    (a) =>
      a.definition.endpoint.method === frame.request.method &&
      a.definition.endpoint.path === requestPath &&
      apiMatchesOrigin(a, frameOrigin),
  );
  if (candidates.length > 1) {
    return [{
      api: `${frame.request.method} ${requestPath}`,
      kind: 'noise',
      summary: `Ambiguous endpoint origin: ${frame.request.method} ${requestPath}`,
      detail: `Capture origin ${frameOrigin} matches multiple canonical definitions`,
    }];
  }
  const api = candidates[0];
  if (!api) {
    return [
      {
        api: `${frame.request.method} ${requestPath}`,
        kind: 'non-breaking',
        summary: `New endpoint: ${frame.request.method} ${requestPath} (not in canonical)`,
        detail: 'No canonical definition matches this method and path',
      },
    ];
  }

  const variants = api.definition.responses;
  const matches = variants.filter((v) => variantMatches(v, frame.http, frame.code, api));
  if (matches.length > 1) {
    return [{ api: api.definition.api, kind: 'noise',
      summary: `Ambiguous HTTP/code pairing: HTTP ${frame.http}, code ${frame.code}`,
      detail: `Matches variants [${matches.map((v) => v.variant).join(', ')}]; semantic evidence is required before comparing body shapes` }];
  }
  const matched = matches[0];
  if (matched) {
    if (frame.response.bodyMeta?.source === 'missing' || frame.response.bodyMeta?.representation === 'base64') return [];
    return compareBody(bodyForAnalysis(frame.response), matched.schema).map((change) => ({
      api: api.definition.api,
      kind: change.kind,
      summary: `${change.path}: ${change.detail}`,
      detail: `variant ${matched.variant}`,
    }));
  }

  const httpWithoutCode = variants.some(
    (v) => v.http.includes(frame.http) && !codesInclude(v, frame.code),
  );
  if (httpWithoutCode) {
    const shells = variants
      .filter((v) => v.http.includes(frame.http))
      .map((v) => v.variant)
      .join(', ');
    return [
      {
        api: api.definition.api,
        kind: 'breaking',
        summary: `Unregistered HTTP/code pairing: HTTP ${frame.http}, code ${frame.code}`,
        detail: `HTTP ${frame.http} is registered in variants [${shells}], but none matches code ${frame.code}`,
      },
    ];
  }

  const codeWithoutHttp = variants.some(
    (v) => codesInclude(v, frame.code) && !v.http.includes(frame.http),
  );
  if (codeWithoutHttp) {
    const holders = variants
      .filter((v) => codesInclude(v, frame.code))
      .map((v) => v.variant)
      .join(', ');
    return [
      {
        api: api.definition.api,
        kind: 'breaking',
        summary: `Registered business code observed with HTTP ${frame.http}`,
        detail: `Code ${frame.code} is registered in variants [${holders}], but none matches HTTP ${frame.http}`,
      },
    ];
  }

  return [
    {
      api: api.definition.api,
      kind: 'breaking',
      summary: `New observation: HTTP ${frame.http} / code ${frame.code}`,
      detail: `No single variant registers both HTTP ${frame.http} and code ${frame.code}`,
    },
  ];
}

interface DriftOptions {
  out?: string;
}

/** Write an advisory drift report for new HAR captures. */
export function driftCommand(): Command {
  return new Command()
    .command('drift <har...>')
    .description('Compare HAR captures with canonical definitions and write advisory drift reports')
    .option('--out <dir>', 'Report output directory (default: .reports)')
    .action(async (hars: string[], options: DriftOptions, command: Command) => {
      const paths = resolvePaths(undefined, command.optsWithGlobals().root);
      const corpus = loadCorpus(paths);
      const cfg = maskConfigFromCollection(corpus.collection);
      const sec = defaultSecurityMaskerConfig();

      const baseline: string[] = [];
      const changes: DriftChange[] = [];
      const seen = new Set<string>();
      let frameCount = 0;

      for (const harArg of hars) {
        const harPath = path.resolve(harArg);
        const har = readHar(harPath);
        baseline.push(path.basename(harPath));
        for (const entry of har.log.entries) {
          const frame = buildCaptureFrame(entry, corpus.collection, cfg, sec);
          const requestPath = pathnameOf(frame.request.url, 'match');
          for (const change of classifyFrame(frame, requestPath, corpus.apis)) {
            const key = `${change.api}\u0000${change.kind}\u0000${change.summary}\u0000${change.detail}`;
            if (!seen.has(key)) {
              seen.add(key);
              changes.push(change);
            }
          }
          frameCount += 1;
        }
      }

      // Sort deterministically by API, kind, summary and detail.
      changes.sort((a, b) => {
        if (a.api !== b.api) return compareCodepoint(a.api, b.api);
        if (a.kind !== b.kind) return compareCodepoint(a.kind, b.kind);
        if (a.summary !== b.summary) return compareCodepoint(a.summary, b.summary);
        return compareCodepoint(a.detail, b.detail);
      });

      const breaking = changes.filter((c) => c.kind === 'breaking').length;
      const nonBreaking = changes.filter((c) => c.kind === 'non-breaking').length;
      const noise = changes.filter((c) => c.kind === 'noise').length;

      const report: DriftReport = {
        command: 'drift',
        baseline,
        changes,
        breaking,
        nonBreaking,
        noise,
      };

      const outDir = path.resolve(options.out ?? paths.reports);
      const firstBase = path.basename(baseline[0], path.extname(baseline[0]));
      const reportFile = path.join(outDir, `drift-${firstBase}.json`);
      writeJsonStable(reportFile, report);

      console.log(
        `drift: ${baseline.length} HAR files / ${frameCount} frames -> ${rel(paths.root, reportFile)}`,
      );
      console.log(`Changes: ${breaking} breaking / ${nonBreaking} non-breaking / ${noise} advisory`);
      for (const change of changes) {
        console.log(`  [${change.kind}] ${change.api}: ${change.summary}`);
      }
    });
}
