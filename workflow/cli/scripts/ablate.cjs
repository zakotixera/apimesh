// One-factor removals run in disposable copies of the built CLI, schemas and harness.
// Production files, caller recordings, and the Git index are never modified.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const repo = path.resolve(__dirname, '../../..');
const harness = 'workflow/cli/scripts/check-har.cjs';
function replace(root, name, before, after) {
  const file = path.join(root, name);
  const text = fs.readFileSync(file, 'utf8');
  if (text.split(before).length !== 2) throw new Error(`Ablation target changed: ${name}`);
  fs.writeFileSync(file, text.replace(before, after));
}
function editSchema(root, edit) {
  const file = path.join(root, 'schema/example.schema.json');
  const schema = JSON.parse(fs.readFileSync(file, 'utf8'));
  edit(schema);
  fs.writeFileSync(file, JSON.stringify(schema));
}

const experiments = [
  { id: 'baseline', remove: 'Nothing', mutate() {} },
  { id: 'metadata-schema', remove: 'Schema permission to store bodyMeta', mutate(root) {
    editSchema(root, (schema) => { delete schema.properties.request.properties.bodyMeta; delete schema.properties.response.properties.bodyMeta; });
  } },
  { id: 'metadata-data', remove: 'bodyMeta from canonical copies only', mutate(root) {
    replace(root, harness, 'write(target, frame);', 'delete frame.request.bodyMeta; delete frame.response.bodyMeta; write(target, frame);');
  } },
  { id: 'recording-id', remove: 'Optional recording suffix', mutate(root) {
    replace(root, harness, 'const name = `${tuple}.${hash(stableStringify(frame)).slice(0, 16)}.json`;', 'const name = `${tuple}.json`;');
  } },
  { id: 'masked-url', remove: 'Masked URL allowance (restore strict URI format)', mutate(root) {
    editSchema(root, (schema) => { schema.properties.request.properties.url.format = 'uri'; });
  } },
  { id: 'http2-adapter', remove: 'Request pseudo-header filtering', mutate(root) {
    replace(root, 'workflow/cli/dist/renderers/postman.js', "header: toHeaders(ex.request.headers).filter((h) => !h.key.startsWith(':') &&", 'header: toHeaders(ex.request.headers).filter((h) =>');
  } },
  { id: 'compression-adapter', remove: 'Decoded-response compression header filtering', mutate(root) {
    replace(root, 'workflow/cli/dist/mock/replay.js', "['content-length', 'content-encoding', 'transfer-encoding']", "['content-length', 'transfer-encoding']");
  } },
  { id: 'fixture-vocabulary', remove: 'Test-only glossary registration', mutate(root) {
    replace(root, harness, "glossary.domains.push({ slug: 'observed', meaning: 'Test fixture grouping; no outcome semantics inferred' });", '// No test-only glossary registration.');
  } },
];

function syntheticHar() {
  return { log: { version: '1.2', entries: [0, 1, 2].map((index) => ({
    startedDateTime: `2026-01-01T00:00:0${index}Z`,
    request: { method: 'POST', url: 'https://example.invalid/probe?token=synthetic',
      headers: [{ name: ':method', value: 'POST' }, { name: 'content-type', value: 'application/json' }],
      postData: { mimeType: 'application/json', text: `{"id":900719925474099312${index}}` } },
    response: { status: 200, headers: [{ name: 'content-encoding', value: index % 2 ? 'br' : 'gzip' }],
      content: { mimeType: 'application/json', text: index === 2 ? '{"message":"recorded"}' : `{"code":0,"value":${index}}` } },
  })) } };
}

function main() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'apic-ablation-'));
  try {
    const inputs = process.argv.slice(2).map((file) => path.resolve(file));
    const synthetic = inputs.length === 0;
    if (synthetic) {
      const input = path.join(scratch, 'synthetic.har');
      fs.writeFileSync(input, JSON.stringify(syntheticHar()));
      inputs.push(input);
    }
    const sourceHashes = inputs.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex'));
    const results = [];
    for (const experiment of experiments) {
      const root = path.join(scratch, experiment.id);
      for (const dir of ['schema', 'workflow/templates', 'workflow/cli/dist', 'workflow/cli/scripts']) {
        fs.cpSync(path.join(repo, dir), path.join(root, dir), { recursive: true });
      }
      experiment.mutate(root);
      const result = spawnSync(process.execPath, [path.join(root, harness), ...inputs], {
        encoding: 'utf8', timeout: 120000, maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, NODE_PATH: [path.join(repo, 'workflow/cli/node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) },
      });
      let outcome;
      try { outcome = JSON.parse(result.status === 0 ? result.stdout : result.stderr); }
      catch { throw new Error(`Ablation ${experiment.id} did not produce a structured result`); }
      const row = { id: experiment.id, removed: experiment.remove, passed: result.status === 0, ...outcome };
      results.push(row);
      console.log(`${experiment.id}: ${row.passed ? 'passed' : row.error}`);
      if (experiment.id === 'baseline' && !row.passed) throw new Error('Baseline failed; ablation comparisons would be invalid');
    }
    if (inputs.some((file, index) => createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== sourceHashes[index])) throw new Error('Source changed');
    const report = { dataset: synthetic ? 'synthetic' : 'caller-supplied HAR', sourceHashes,
      node: process.version, platform: process.platform, method: 'One factor removed per isolated copy; first failing check reported; no semantic classification performed', results };
    const output = path.join(repo, '.reports', synthetic ? 'ablation-synthetic.json' : 'ablation-har.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Report: ${output}`);
  } finally {
    if (path.dirname(scratch) !== os.tmpdir() || !path.basename(scratch).startsWith('apic-ablation-')) throw new Error('Unsafe cleanup path');
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
