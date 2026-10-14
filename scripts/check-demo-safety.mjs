import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
const hosting = JSON.parse(await readFile('.openai/hosting.json', 'utf8'));
assert.equal(hosting.project_id, 'appgprj_6a9759b55d94819191e4dca301a4372f');
assert.equal(hosting.d1, null);
assert.equal(hosting.r2, null);
const seed = JSON.parse(await readFile('lib/seed-data.json', 'utf8'));
assert.ok(seed.transactions.every((row) => row.id.startsWith('demo-')));
assert.equal(seed.sourceFile, 'Synthetic demo data');
const banned =
  /kaikei-expenses-2026\.ktanzyl|GOOGLE_SHEET_SYNC_URL|GOOGLE_SHEET_SYNC_SECRET|KAIKEI_SYNC_SECRET|1GkD_UAsStUcLoWSVgOKnXlF01llB4WIuNugp3HoKa34|from ['"](?:@\/|\.\.\/)db\//;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = directory + '/' + entry.name;
    if (entry.isDirectory()) await scan(path);
    else if (/\.(?:ts|tsx|js|mjs|json|html|webmanifest)$/.test(path))
      assert.doesNotMatch(await readFile(path, 'utf8'), banned, path);
  }
}
for (const dir of ['app', 'lib', 'public']) await scan(dir);
for (const path of [
  'app/api/ledger/route.ts',
  'app/api/ledger/[id]/route.ts',
  'app/api/budgets/route.ts',
])
  assert.match(await readFile(path, 'utf8'), /status: 405/);
const runtime = await readFile('lib/demo-runtime.ts', 'utf8');
assert.doesNotMatch(runtime, /\bfetch\s*\(/);
assert.match(runtime, /startsWith\('\/api\/'\)/);
try {
  await scan('dist/client');
  await scan('dist/server');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log(
  'Demo safety verified: fictional seed, separate hosting, no private bridge/DB imports or external transport fallback.',
);
