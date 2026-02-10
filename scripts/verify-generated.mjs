import { execSync } from 'node:child_process';

function run(cmd) {
  execSync(cmd, { stdio: 'inherit' });
}

function read(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

// 1) Rebuild generated JSON
run('node scripts/build-data.mjs');

// 2) Fail CI if generated files are not committed
let status = '';
try {
  status = read('git status --porcelain');
} catch {
  // Not a git repo (e.g., someone downloaded a zip). Nothing to validate.
  process.exit(0);
}

if (!status) process.exit(0);

const changed = status
  .split(/\r?\n/)
  .map((l) => l.trimEnd())
  .filter(Boolean)
  // Format: "XY path" or "XY old -> new". Use last token as path.
  .map((l) => l.replace(/^..\s+/, ''))
  .map((p) => (p.includes(' -> ') ? p.split(' -> ').pop() : p));

const relevant = changed.filter((p) => p.startsWith('data/'));

if (relevant.length) {
  console.error("Generated data is out of date. Run 'npm run build:data' and commit the changes.");
  for (const p of relevant) console.error(p);
  process.exit(1);
}

process.exit(0);
