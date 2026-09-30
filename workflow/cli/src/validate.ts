import path from 'node:path';
import { Command } from 'commander';
import { loadCollection, loadGlossary } from './lib/canonical';
import { readJson, walk, writeJsonStable } from './lib/fsx';
import { codeFromBody } from './lib/har';
import { scanPlaceholders } from './lib/mask';
import { rel, resolvePaths, type ProjectPaths } from './lib/paths';
import { loadSchemas, type SchemaValidators } from './lib/schemas';
import type {
  Collection,
  Definition,
  Example,
  Glossary,
  Issue,
  Variant,
  ValidationReport,
} from './lib/types';

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const API_ID_RE = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
const EXAMPLE_FILE_RE = /^([1-5][0-9]{2})\.(code-?[0-9]+|http-only)\.([a-z0-9]+(?:-[a-z0-9]+)*)\.json$/;

/** Request parameter sections. */
const PARAM_SECTIONS = ['query', 'body'] as const;
/** Observed request header and cookie values. */
const VALUE_SECTIONS = ['headers', 'cookies'] as const;

/* ------------------------------------------------------------------ */
/** Load files while collecting read and parse errors. */
/* ------------------------------------------------------------------ */

interface ExampleFile {
  name: string;
  file: string;
  relFile: string;
  data?: Example;
}

interface ApiEntry {
  file: string;
  relFile: string;
  dir: string;
  relDir: string;
  def?: Definition;
  examples: ExampleFile[];
}

interface Loaded {
  collection?: Collection;
  glossary?: Glossary;
  apis: ApiEntry[];
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function loadTolerant(paths: ProjectPaths, issues: Issue[]): Loaded {
  const loaded: Loaded = { apis: [] };

  try {
    loaded.collection = loadCollection(paths);
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'collection-load',
      message: message(err),
      file: rel(paths.root, paths.collectionFile),
    });
  }
  try {
    loaded.glossary = loadGlossary(paths);
  } catch (err) {
    issues.push({
      severity: 'error',
      code: 'glossary-load',
      message: message(err),
      file: rel(paths.root, paths.glossaryFile),
    });
  }

  const defFiles = walk(paths.apis, (f) => path.basename(f) === 'definition.json');
  for (const file of defFiles) {
    const dir = path.dirname(file);
    const api: ApiEntry = {
      file,
      relFile: rel(paths.root, file),
      dir,
      relDir: rel(paths.apis, dir),
      examples: [],
    };
    try {
      api.def = readJson<Definition>(file);
    } catch (err) {
      issues.push({
        severity: 'error',
        code: 'definition-load',
        message: message(err),
        file: api.relFile,
      });
    }
    const examplesDir = path.join(dir, 'examples');
    for (const ef of walk(examplesDir, (f) => f.endsWith('.json'))) {
      const entry: ExampleFile = {
        name: path.basename(ef),
        file: ef,
        relFile: rel(paths.root, ef),
      };
      try {
        entry.data = readJson<Example>(ef);
      } catch (err) {
        issues.push({
          severity: 'error',
          code: 'example-load',
          message: message(err),
          file: entry.relFile,
        });
      }
      api.examples.push(entry);
    }
    loaded.apis.push(api);
  }
  return loaded;
}

/* ------------------------------------------------------------------ */
/** Helpers. */
/* ------------------------------------------------------------------ */

function intersect(a: number[], b: number[]): number[] {
  const setB = new Set(b);
  return a.filter((x) => setB.has(x));
}

/* ------------------------------------------------------------------ */
/** Validation checks. */
/* ------------------------------------------------------------------ */

function runChecks(paths: ProjectPaths, schemas: SchemaValidators): Issue[] {
  const issues: Issue[] = [];
  const loaded = loadTolerant(paths, issues);
  const { collection, glossary, apis } = loaded;

  // Validate collection and glossary schemas.
  if (collection) {
    for (const m of schemas.collection(collection)) {
      issues.push({ severity: 'error', code: 'schema-collection', message: m, file: 'collection.json' });
    }
  }
  if (glossary) {
    for (const m of schemas.glossary(glossary)) {
      issues.push({ severity: 'error', code: 'schema-glossary', message: m, file: 'glossary.json' });
    }
  }

  // Check glossary slug uniqueness and format.
  const glossarySlugs = new Set<string>();
  if (glossary && Array.isArray(glossary.domains)) {
    glossary.domains.forEach((domain, i) => {
      if (typeof domain?.slug !== 'string') return;
      if (glossarySlugs.has(domain.slug)) {
        issues.push({
          severity: 'error',
          code: 'glossary-slug-duplicate',
          message: `Duplicate glossary slug: ${domain.slug}`,
          file: 'glossary.json',
          path: `domains[${i}]`,
        });
      }
      glossarySlugs.add(domain.slug);
      if (!SLUG_RE.test(domain.slug)) {
        issues.push({
          severity: 'error',
          code: 'glossary-slug-format',
          message: `Invalid glossary slug: ${domain.slug}`,
          file: 'glossary.json',
          path: `domains[${i}].slug`,
        });
      }
    });
  }

  const apiIds = new Set<string>();
  const registeredAuth = new Set<string>(Object.keys(collection?.auth ?? {}));
  const baseKeys = new Set<string>(Object.keys(collection?.bases ?? {}));

  for (const api of apis) {
    const def = api.def;
    if (!def) continue;

    for (const m of schemas.definition(def)) {
      issues.push({ severity: 'error', code: 'schema-definition', message: m, file: api.relFile });
    }

    // Check API identifier uniqueness and format.
    if (typeof def.api === 'string') {
      if (apiIds.has(def.api)) {
        issues.push({ severity: 'error', code: 'api-id-duplicate', message: `Duplicate API identifier: ${def.api}`, file: api.relFile });
      }
      apiIds.add(def.api);
      if (!API_ID_RE.test(def.api)) {
        issues.push({ severity: 'error', code: 'api-id-format', message: `Invalid API identifier: ${def.api}`, file: api.relFile });
      }
    }

    // Check endpoint directory placement.
    const expectedPath = `/${api.relDir}`;
    if (def.endpoint?.path !== expectedPath) {
      issues.push({
        severity: 'error',
        code: 'path-mismatch',
        message: `endpoint.path (${def.endpoint?.path}) does not match its directory (${expectedPath})`,
        file: api.relFile,
        path: 'endpoint.path',
      });
    }

    // Warn about unregistered placeholders in defaults, headers and cookies.
    for (const section of PARAM_SECTIONS) {
      const params = def.request?.[section];
      if (!params) continue;
      for (const [name, param] of Object.entries(params)) {
        for (const ph of scanPlaceholders(param.default)) {
          if (!registeredAuth.has(ph)) {
            issues.push({
              severity: 'warning',
              code: 'placeholder-unregistered',
              message: `Placeholder {{${ph}}} is not registered in collection.auth`,
              file: api.relFile,
              path: `request.${section}.${name}.default`,
            });
          }
        }
      }
    }
    for (const section of VALUE_SECTIONS) {
      const values = def.request?.[section];
      if (!values) continue;
      for (const [name, value] of Object.entries(values)) {
        for (const ph of scanPlaceholders(value)) {
          if (!registeredAuth.has(ph)) {
            issues.push({
              severity: 'warning',
              code: 'placeholder-unregistered',
              message: `Placeholder {{${ph}}} is not registered in collection.auth`,
              file: api.relFile,
              path: `request.${section}.${name}`,
            });
          }
        }
      }
    }

    const variants: Variant[] = Array.isArray(def.responses) ? def.responses : [];
    const fileByName = new Map(api.examples.map((e) => [e.name, e]));
    const referenced = new Map<string, number>();

    variants.forEach((variant, vi) => {
      const at = `responses[${vi}]`;

      if (typeof variant.variant === 'string') {
        if (!SLUG_RE.test(variant.variant)) {
          issues.push({
            severity: 'error',
            code: 'variant-slug-format',
            message: `Invalid variant slug: ${variant.variant}`,
            file: api.relFile,
            path: `${at}.variant`,
          });
        }
        if (glossary && !glossarySlugs.has(variant.variant)) {
          issues.push({
            severity: 'error',
            code: 'variant-slug-unregistered',
            message: `Variant slug is not in the glossary: ${variant.variant}`,
            file: api.relFile,
            path: `${at}.variant`,
          });
        }
      }

      // Warn about variants without examples.
      if (!variant.examples || variant.examples.length === 0) {
        issues.push({
          severity: 'warning',
          code: 'variant-without-example',
          message: `Variant ${variant.variant} has no examples`,
          file: api.relFile,
          path: at,
        });
      }

      for (const [ei, name] of (variant.examples ?? []).entries()) {
        referenced.set(name, (referenced.get(name) ?? 0) + 1);
        const ef = fileByName.get(name);
        const exAt = `${at}.examples[${ei}]`;

        // Check that the referenced file exists.
        if (!ef) {
          issues.push({ severity: 'error', code: 'example-missing', message: `Example file not found: ${name}`, file: api.relFile, path: exAt });
          continue;
        }
        if (!ef.data) continue; // The load error was already recorded.

        // Check the example filename and its HTTP/code/variant components.
        const m = EXAMPLE_FILE_RE.exec(name);
        if (!m) {
          issues.push({ severity: 'error', code: 'filename-format', message: `Invalid example filename: ${name}`, file: ef.relFile });
        } else {
          const fileHttp = Number(m[1]);
          const mid = m[2];
          const fileSlug = m[3];
          const fileCode = mid === 'http-only' ? null : Number.parseInt(mid.slice(4), 10);
          if (fileHttp !== ef.data.http) {
            issues.push({ severity: 'error', code: 'filename-http', message: `Filename HTTP status (${fileHttp}) differs from content HTTP status (${ef.data.http})`, file: ef.relFile });
          }
          if (fileCode !== ef.data.code) {
            issues.push({ severity: 'error', code: 'filename-code', message: `Filename code (${fileCode}) differs from content code (${ef.data.code})`, file: ef.relFile });
          }
          if (fileSlug !== variant.variant) {
            issues.push({ severity: 'error', code: 'filename-slug', message: `Filename slug (${fileSlug}) differs from variant (${variant.variant})`, file: ef.relFile });
          }
        }

        // Check that observations belong to the declared variant.
        if (!Array.isArray(variant.http) || !variant.http.includes(ef.data.http)) {
          issues.push({ severity: 'error', code: 'http-not-observed', message: `example.http (${ef.data.http}) is not in variant.http (${JSON.stringify(variant.http)})`, file: ef.relFile });
        }
        if (ef.data.code !== null && !(Array.isArray(variant.codes) && variant.codes.includes(ef.data.code))) {
          issues.push({ severity: 'error', code: 'code-not-observed', message: `example.code (${ef.data.code}) is not in variant.codes (${JSON.stringify(variant.codes)})`, file: ef.relFile });
        }

        // Check redundant observation fields.
        if (ef.data.response && ef.data.http !== ef.data.response.status) {
          issues.push({ severity: 'error', code: 'http-redundant', message: `example.http(${ef.data.http})≠ response.status(${ef.data.response.status})`, file: ef.relFile });
        }
        if (ef.data.response && codeFromBody(ef.data.response.body) !== ef.data.code) {
          issues.push({ severity: 'error', code: 'code-redundant', message: `example.code(${ef.data.code})≠ response.body.code ?? errno(${codeFromBody(ef.data.response.body)})`, file: ef.relFile });
        }

        // warning 4: origin
        if (typeof ef.data.origin === 'string' && !baseKeys.has(ef.data.origin)) {
          issues.push({ severity: 'warning', code: 'origin-unknown', message: `example.origin (${ef.data.origin}) is not registered in collection.bases`, file: ef.relFile });
        }

        // Check placeholder registration.
        for (const ph of scanPlaceholders(ef.data)) {
          if (!registeredAuth.has(ph)) {
            issues.push({ severity: 'warning', code: 'placeholder-unregistered', message: `Placeholder {{${ph}}} is not registered in collection.auth`, file: ef.relFile });
          }
        }
      }

      // Warn about business codes without a response shape.
      const codes = Array.isArray(variant.codes) ? variant.codes : [];
      if (codes.length > 0 && variant.schema === null) {
        issues.push({ severity: 'warning', code: 'schema-null-with-codes', message: `Variant ${variant.variant} has business codes but a null schema`, file: api.relFile, path: at });
      }

      // Check declared response headers against examples.
      if (variant.headers) {
        for (const [header, value] of Object.entries(variant.headers)) {
          for (const name of variant.examples ?? []) {
            const ef = fileByName.get(name);
            if (!ef || !ef.data || !ef.data.response) continue; // Missing or unreadable files were already reported.
            const actual = Object.entries(ef.data.response.headers ?? {}).find(
              ([k]) => k.toLowerCase() === header.toLowerCase(),
            );
            if (!actual) {
              issues.push({ severity: 'error', code: 'response-header-missing', message: `Declared response header ${header} is missing from example ${name}`, file: ef.relFile });
            } else if (actual[1] !== value) {
              issues.push({ severity: 'error', code: 'response-header-value', message: `Declared response header ${header}=${value} differs from example ${name}: ${actual[1]}`, file: ef.relFile });
            }
          }
        }
      }
    });

    // Check for orphaned examples and duplicate references.
    for (const ef of api.examples) {
      const count = referenced.get(ef.name) ?? 0;
      if (count === 0) {
        issues.push({ severity: 'error', code: 'example-orphan', message: `Example is not referenced by any variant: ${ef.name}`, file: ef.relFile });
      } else if (count > 1) {
        issues.push({ severity: 'error', code: 'example-double-referenced', message: `Example is referenced multiple times: ${ef.name} (${count} references)`, file: ef.relFile });
      }
    }

    // Warn about overlapping business codes.
    for (let i = 0; i < variants.length; i += 1) {
      for (let j = i + 1; j < variants.length; j += 1) {
        const a = Array.isArray(variants[i].codes) ? variants[i].codes : [];
        const b = Array.isArray(variants[j].codes) ? variants[j].codes : [];
        const overlap = intersect(a, b);
        if (overlap.length > 0) {
          issues.push({
            severity: 'warning',
            code: 'codes-intersect',
            message: `Variants ${variants[i].variant} and ${variants[j].variant} have overlapping codes: ${overlap.join(', ')}`,
            file: api.relFile,
          });
        }
      }
    }
  }

  // Validate example file schemas.
  for (const api of apis) {
    for (const ef of api.examples) {
      if (!ef.data) continue;
      for (const m of schemas.example(ef.data)) {
        issues.push({ severity: 'error', code: 'schema-example', message: m, file: ef.relFile });
      }
    }
  }

  return sortIssues(issues);
}

function sortIssues(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    const fa = a.file ?? '';
    const fb = b.file ?? '';
    if (fa !== fb) return fa < fb ? -1 : 1;
    const pa = a.path ?? '';
    const pb = b.path ?? '';
    if (pa !== pb) return pa < pb ? -1 : 1;
    if (a.code !== b.code) return a.code < b.code ? -1 : 1;
    return a.message < b.message ? -1 : a.message > b.message ? 1 : 0;
  });
}

interface ValidateOptions {
  strict?: boolean;
  json?: boolean;
}

/** Validate canonical schemas and cross-references. */
export function validateCommand(): Command {
  return new Command('validate')
    .description('Validate canonical JSON schemas and cross-references; write .reports/validate.json')
    .option('--strict', 'Treat warnings as failures')
    .option('--json', 'Print the report as JSON')
    .action(async (options: ValidateOptions) => {
      const paths = resolvePaths();
      const schemas = loadSchemas(paths);
      const issues = runChecks(paths, schemas);

      const errors = issues.filter((i) => i.severity === 'error').length;
      const warnings = issues.filter((i) => i.severity === 'warning').length;
      const strict = options.strict === true;
      const ok = errors === 0 && (!strict || warnings === 0);

      const report: ValidationReport = { command: 'validate', ok, errors, warnings, issues };
      writeJsonStable(path.join(paths.reports, 'validate.json'), report);

      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        for (const issue of issues) {
          const loc = [issue.file, issue.path].filter(Boolean).join(' :: ');
          console.log(`${issue.severity.toUpperCase().padEnd(7)} [${issue.code}] ${loc}${loc ? ' ' : ''}${issue.message}`);
        }
        console.log(
          `validate: ${errors} errors / ${warnings} warnings -> ${ok ? 'PASS' : 'FAIL'} (report: .reports/validate.json)`,
        );
      }

      process.exitCode = ok ? 0 : 1;
    });
}
