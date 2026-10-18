// Release helper: snapshot the current build as a playable version.
//
//   node tools/release.mjs --id v1.1 --name "Strike Zone 1.1" \
//     --summary "Scope no longer blocks the view" \
//     --notes "Scoped rifle fades out of the way|Aimed pistols drop below the sight line" \
//     [--no-test] [--no-commit]
//
// What it does:
//   1. syntax-checks index.html
//   2. runs the headless test suite (unless --no-test)
//   3. copies index.html to versions/<id>/index.html and rewrites the in-game
//      "version history" link to point at the hub
//   4. appends the release to versions.json and regenerates versions/index.html
//   5. git add/commit and tags <id> (unless --no-commit)
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { execFileSync } from 'child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const arg = (k, d = null) => {
  const i = args.indexOf('--' + k);
  return i === -1 ? d : args[i + 1];
};
const flag = (k) => args.includes('--' + k);

const id = arg('id');
const name = arg('name') || 'Strike Zone ' + (id || '');
const summary = arg('summary') || '';
const notes = (arg('notes') || '').split('|').map((s) => s.trim()).filter(Boolean);
if (!id || !/^v\d+(\.\d+)*$/.test(id)) {
  console.error('usage: node tools/release.mjs --id v1.1 --name "..." --summary "..." --notes "a|b|c"');
  process.exit(1);
}

const run = (cmd, argv, opts = {}) =>
  execFileSync(cmd, argv, { cwd: root, stdio: 'inherit', ...opts });

// 1. syntax check the module
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) {
  console.error('index.html has no module script');
  process.exit(1);
}
writeFileSync(resolve(root, 'test/.syntax.mjs'), m[1]);
run(process.execPath, ['--check', 'test/.syntax.mjs']);
console.log('syntax: ok');

// 2. tests
if (!flag('no-test')) {
  console.log('running test suite...');
  run(process.execPath, ['test/smoke.mjs']);
}

// 3. snapshot
const dir = resolve(root, 'versions', id);
mkdirSync(dir, { recursive: true });
const snapshot = html.replace(/href="versions\/"/g, 'href="../"');
writeFileSync(resolve(dir, 'index.html'), snapshot);
console.log('snapshot: versions/' + id + '/index.html');

// 4. manifest + hub
const manifestPath = resolve(root, 'versions.json');
const versions = JSON.parse(readFileSync(manifestPath, 'utf8')).filter((v) => v.id !== id);
versions.push({
  id,
  name,
  date: new Date().toISOString().slice(0, 10),
  file: 'versions/' + id + '/index.html',
  summary,
  notes,
});
writeFileSync(manifestPath, JSON.stringify(versions, null, 2) + '\n');
run(process.execPath, ['tools/build-hub.mjs']);

// 5. commit + tag
if (!flag('no-commit')) {
  run('git', ['add', '-A']);
  run('git', ['commit', '-m', id + ': ' + (summary || name)]);
  try {
    run('git', ['tag', '-a', id, '-m', name]);
  } catch {
    console.log('tag ' + id + ' already exists, skipped');
  }
  console.log('committed and tagged ' + id);
}
console.log('done. remember to push: git push --follow-tags');
