// CI owns scheduling and runtime setup. This dependency-free entry point owns
// the local build/test sequence and the required-check decision.
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const packageRoot = path.resolve(__dirname, '..');

function runChecks(run = spawnSync) {
  for (const [name, entry, args] of [
    ['build', 'typescript/bin/tsc', ['-p', 'tsconfig.json']],
    ['test', 'vitest/vitest.mjs', ['run', '--passWithNoTests=false']],
  ]) {
    const result = run(process.execPath, [require.resolve(entry), ...args], {
      cwd: packageRoot,
      stdio: 'inherit',
      shell: false,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`CI ${name} failed (${result.signal ?? result.status ?? 'no exit status'})`);
  }
}

function requireSuccessfulJobs(raw) {
  let jobs;
  try { jobs = JSON.parse(raw); }
  catch { throw new Error('CI_NEEDS must contain the JSON object of required jobs'); }
  if (!jobs || typeof jobs !== 'object' || Array.isArray(jobs) || Object.keys(jobs).length === 0) {
    throw new Error('CI_NEEDS must contain at least one required job');
  }
  const failed = Object.entries(jobs)
    .filter(([, job]) => !job || typeof job !== 'object' || job.result !== 'success')
    .map(([name, job]) => `${name}: ${job?.result ?? 'missing result'}`);
  if (failed.length) throw new Error(`Required CI jobs did not all succeed (${failed.join(', ')})`);
}

function main(args = process.argv.slice(2), env = process.env) {
  if (args.length !== 1 || !['check', 'gate'].includes(args[0])) throw new Error('Usage: node scripts/ci.cjs <check|gate>');
  if (args[0] === 'check') runChecks();
  else requireSuccessfulJobs(env.CI_NEEDS);
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = { runChecks, requireSuccessfulJobs, main };
