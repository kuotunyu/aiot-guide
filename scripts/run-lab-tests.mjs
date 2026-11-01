// Runs every tests/labs-*.test.js and fails if a chapter with a lab has no test.
import {readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';

const tests = readdirSync('tests').filter(f => /^labs-.*\.test\.js$/.test(f));
const labs = readdirSync('static/assets/labs');
let failed = 0;
for (const lab of labs) if (!tests.includes(`labs-${lab.replace('.js', '')}.test.js`)) { console.error(`no test for ${lab}`); failed++; }
for (const t of tests) {
  const r = spawnSync(process.execPath, ['tests/' + t], {encoding: 'utf8'});
  if (r.status) { console.error(`FAIL ${t}\n${r.stderr}`); failed++; }
}
if (failed) process.exit(1);
console.log(`lab logic: ${tests.length} test files passed`);
