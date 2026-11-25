import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const checks = [
  ['validate', ['run', 'validate']],
  ['test', ['test']],
  ['docker smoke', ['run', 'test:docker']]
];

for (const [label, args] of checks) {
  console.log(`\n=== QA: ${label} ===`);
  const result = spawnSync(npm, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    console.error(`QA ${label} failed to start: ${result.error.message}`);
    process.exitCode = 1;
    break;
  }
  if (result.status !== 0) {
    console.error(`QA ${label} failed with exit code ${result.status}.`);
    process.exitCode = result.status || 1;
    break;
  }
}

if (!process.exitCode) console.log('\nQA PASS: validate, test and Docker smoke completed.');
