// npm changes cwd to this package. Restore the caller before parsing --root.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const result = spawnSync(process.execPath, [path.join(__dirname, '../dist/cli.js'), 'init', ...process.argv.slice(2)], {
  cwd: process.env.INIT_CWD || process.cwd(),
  stdio: 'inherit',
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
