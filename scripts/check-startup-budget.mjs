import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const manifest = JSON.parse(
  await readFile('dist/client/.vite/manifest.json', 'utf8'),
);
const seen = new Set();
function include(key) {
  if (seen.has(key)) return;
  if (!manifest[key]) throw new Error(`Missing startup manifest entry: ${key}`);
  seen.add(key);
  for (const dependency of manifest[key].imports || []) include(dependency);
}
for (const key of [
  'app/page.tsx',
  'virtual:vinext-app-browser-entry',
])
  include(key);
// Providers can be folded into the client page when it imports the theme hook.
if (manifest['app/providers.tsx']) include('app/providers.tsx');
if (
  [...seen].some((key) =>
    /transactions-view|transaction-columns|budgets-view|transaction-dialog|feedback-host/.test(
      key,
    ),
  )
)
  throw new Error('An unopened screen has entered the static launch graph.');
const files = [
  ...new Set(
    [...seen]
      .map((key) => manifest[key].file)
      .filter((file) => file.endsWith('.js')),
  ),
];
let rawBytes = 0,
  gzipBytes = 0;
for (const file of files) {
  const bytes = await readFile('dist/client/' + file);
  rawBytes += bytes.length;
  gzipBytes += gzipSync(bytes).length;
}
const budget = 260_000;
console.log(
  JSON.stringify({
    staticChunks: files.length,
    rawBytes,
    gzipBytes,
    gzipBudgetBytes: budget,
    upstreamV3102GzipBytes: 250_505,
  }),
);
if (gzipBytes > budget)
  throw new Error('Initial JavaScript exceeds the startup regression budget.');
