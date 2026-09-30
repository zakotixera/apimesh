// Exercise rejection paths on a disposable copy of an actual recording.
// Return only issue codes; never expose captured values in diagnostics.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bodyForAnalysis } = require('../../dist/lib/body');

function validationProbes(root, cli, definitionFile, exampleFile) {
  const originalDefinition = fs.readFileSync(definitionFile);
  const originalExample = fs.readFileSync(exampleFile);
  const cases = [
    ['schema-definition', (def) => { def.responses = [null]; }],
    ['schema-definition', (def) => { def.request = { query: { q: null } }; }],
    ['schema-example', (_def, ex) => { ex.response.bodyMeta = { representation: 'text', source: 'missing' }; ex.response.body = 'not missing'; }],
    ['variant-slug-duplicate', (def) => { def.responses.push({ ...def.responses[0], codes: [], examples: [] }); }],
    ['example-method-mismatch', (def, ex) => { ex.request.method = def.endpoint.method === 'GET' ? 'POST' : 'GET'; }],
    ['example-url-mismatch', (_def, ex) => { const url = new URL(ex.request.url); url.pathname += '/validation-probe'; ex.request.url = url.href; }],
    ['example-body-type', (def, ex) => {
      const body = bodyForAnalysis(ex.response);
      def.responses[0].schema = { type: typeof body === 'boolean' ? 'number' : 'boolean' };
    }],
  ];
  const results = [];
  const reportFile = path.join(root, '.reports/validate.json');
  try {
    for (const [expected, mutate] of cases) {
      const def = JSON.parse(originalDefinition);
      const ex = JSON.parse(originalExample);
      mutate(def, ex);
      fs.writeFileSync(definitionFile, JSON.stringify(def));
      fs.writeFileSync(exampleFile, JSON.stringify(ex));
      fs.rmSync(reportFile, { force: true });
      const result = spawnSync(process.execPath, [cli, 'validate', '--strict'], {
        cwd: root, encoding: 'utf8', timeout: 30000,
      });
      const report = fs.existsSync(reportFile) ? JSON.parse(fs.readFileSync(reportFile, 'utf8')) : null;
      if (result.status !== 1 || !report || report.ok || !report.issues.some((issue) => issue.code === expected)) {
        throw new Error(`Validation probe failed to report ${expected}`);
      }
      results.push(expected);
    }
  } finally {
    fs.writeFileSync(definitionFile, originalDefinition);
    fs.writeFileSync(exampleFile, originalExample);
  }
  return results;
}

module.exports = { validationProbes };
