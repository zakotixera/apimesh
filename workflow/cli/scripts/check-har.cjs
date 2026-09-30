// Exercise the deterministic workflow in a disposable collection. This is a compatibility
// check, not semantic classification or an import into the user's canonical corpus.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { parse } = require('yaml');
const { stableStringify } = require('../dist/lib/stable-json');
const { bodyForAnalysis } = require('../dist/lib/body');
const { walk } = require('../dist/lib/fsx');
const { captureFidelity } = require('./lib/capture-fidelity.cjs');

const repo = path.resolve(__dirname, '../../..');
const cli = path.resolve(__dirname, '../dist/cli.js');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const snapshot = (dir) => walk(dir).map((file) => [path.relative(dir, file), hash(fs.readFileSync(file))]);

function checkHar(inputs) {
  if (inputs.length === 0) throw new Error('Supply at least one HAR path');
  const files = inputs.map((input) => path.resolve(input));
  const sourceHashes = files.map((file) => hash(fs.readFileSync(file)));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apic-har-check-'));
  const completedStages = [];
  const write = (name, data) => {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, stableStringify(data));
  };
  const run = (...args) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 16 * 1024 * 1024 });
    if (result.status !== 0) {
      // Do not echo request/response values or Newman output from private captures.
      const reportFile = path.join(root, '.reports/validate.json');
      const details = args[0] === 'validate' && fs.existsSync(reportFile)
        ? [...new Set(JSON.parse(fs.readFileSync(reportFile, 'utf8')).issues.map((issue) => `${issue.code}${issue.path ? ` (${issue.path})` : ''}`))].join(', ')
        : 'Check capture compatibility with this stage';
      throw new Error(`${args[0]} failed (exit ${result.status ?? 'unavailable'}): ${details}`);
    }
    if (!completedStages.includes(args[0])) completedStages.push(args[0]);
  };
  try {
    fs.mkdirSync(path.join(root, 'workflow'));
    fs.cpSync(path.join(repo, 'schema'), path.join(root, 'schema'), { recursive: true });
    const entries = files.flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).log.entries);
    if (entries.length === 0) throw new Error('HAR contains no recordings');
    const origins = [...new Set(entries.map((entry) => new URL(entry.request.url).origin))].sort();
    const collection = JSON.parse(fs.readFileSync(path.join(repo, 'workflow/templates/collection.json'), 'utf8'));
    collection.bases = Object.fromEntries(origins.map((origin, index) => [`capture-${index}`, origin]));
    write('collection.json', collection);
    const glossary = JSON.parse(fs.readFileSync(path.join(repo, 'workflow/templates/glossary.json'), 'utf8'));
    // Mechanical test grouping only; production vocabulary comes from semantic classification.
    glossary.domains.push({ slug: 'observed', meaning: 'Test fixture grouping; no outcome semantics inferred' });
    write('glossary.json', glossary);
    run('extract', ...files);
    const extracted = snapshot(path.join(root, '.raw'));
    run('extract', ...files);
    if (JSON.stringify(extracted) !== JSON.stringify(snapshot(path.join(root, '.raw')))) throw new Error('Extraction is not stable');

    let recordings = 0;
    let endpoints = 0;
    let additionalRecordings = 0;
    const directories = new Set();
    const expectedCaptures = new Map();
    for (const file of walk(path.join(root, '.raw'), (file) => file.endsWith('.yaml'))) {
      for (const endpoint of parse(fs.readFileSync(file, 'utf8')).endpoints) {
        const segments = endpoint.path.slice(1).split('/');
        if (segments.some((segment) => !segment || /[<>:"\\|?*]/.test(segment) || segment === '.' || segment === '..' || /[. ]$/.test(segment))) {
          throw new Error('Endpoint path cannot be represented by the current directory model');
        }
        const dir = path.join('apis', ...segments);
        if (directories.has(dir)) throw new Error('Multiple methods share a canonical directory');
        directories.add(dir);
        const hosts = new Set(endpoint.frames.map((frame) => new URL(frame.request.url).host));
        if (hosts.size > 1) throw new Error('Multiple hosts share a canonical endpoint; semantic adjudication is required');
        const names = [];
        const tuples = new Set();
        const types = new Set();
        for (const frame of endpoint.frames) {
          const tuple = `${frame.http}.${frame.code === null ? 'http-only' : `code${frame.code}`}.observed`;
          if (tuples.has(tuple)) additionalRecordings += 1;
          tuples.add(tuple);
          const name = `${tuple}.${hash(stableStringify(frame)).slice(0, 16)}.json`;
          const target = path.join(dir, 'examples', name);
          if (fs.existsSync(path.join(root, target))) throw new Error('Recording identifier collision');
          names.push(name);
          expectedCaptures.set(name, structuredClone(frame));
          write(target, frame);
          const body = bodyForAnalysis(frame.response);
          types.add(body === null ? 'null' : Array.isArray(body) ? 'array' : typeof body);
          recordings += 1;
        }
        write(path.join(dir, 'definition.json'), {
          api: `capture.endpoint-${++endpoints}`, name: 'Observed endpoint',
          endpoint: { method: endpoint.method, path: endpoint.path }, source: 'Isolated HAR compatibility check',
          responses: [{ variant: 'observed', status: 'Recorded outcome; semantics not classified',
            codes: [...new Set(endpoint.frames.map((frame) => frame.code).filter((code) => code !== null))],
            http: [...new Set(endpoint.frames.map((frame) => frame.http))],
            schema: { type: [...types].sort() }, examples: names }],
        });
      }
    }
    run('validate', '--strict');
    run('render', '--all');
    const rendered = snapshot(path.join(root, 'dist'));
    run('render', '--all');
    if (JSON.stringify(rendered) !== JSON.stringify(snapshot(path.join(root, 'dist')))) throw new Error('Rendering is not stable');
    run('test');
    // Replay and exports share canonical data. Compare separately against extraction evidence
    // so a serialization error cannot pass merely because both sides make the same mistake.
    const postman = JSON.parse(fs.readFileSync(path.join(root, 'dist/postman/endpoints.postman_collection.json'), 'utf8'));
    const fidelity = captureFidelity(expectedCaptures, postman);
    if (fidelity.mismatches > 0) throw new Error(`Capture fidelity failed: ${fidelity.mismatches} recording exports differ from extraction evidence`);
    completedStages.push('capture-fidelity');
    run('drift', ...files);
    const driftFile = walk(path.join(root, '.reports'), (file) => path.basename(file).startsWith('drift-'))[0];
    const drift = JSON.parse(fs.readFileSync(driftFile, 'utf8'));
    if (drift.changes.length) throw new Error('Baseline HAR unexpectedly produces drift');
    if (files.some((file, index) => hash(fs.readFileSync(file)) !== sourceHashes[index])) throw new Error('Source HAR changed');
    return { sourceEntries: entries.length, recordings, duplicates: entries.length - recordings, endpoints, additionalRecordings,
      validation: 'passed', extractionStability: 'passed', renderStability: 'passed', replay: 'passed', captureFidelity: 'passed', baselineDrift: 'none' };
  } catch (error) {
    error.completedStages = completedStages;
    throw error;
  } finally {
    if (path.dirname(root) !== os.tmpdir() || !path.basename(root).startsWith('apic-har-check-')) throw new Error('Unsafe cleanup path');
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { checkHar };
if (require.main === module) {
  try { console.log(JSON.stringify(checkHar(process.argv.slice(2)), null, 2)); }
  catch (error) { console.error(JSON.stringify({ error: error.message, completedStages: error.completedStages ?? [] })); process.exitCode = 1; }
}
