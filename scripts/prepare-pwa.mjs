import { readFile, writeFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const root = path.resolve('dist/client');
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : [path.join(directory, entry.name)],
      ),
    )
  ).flat();
}
const assets = (await files(path.join(root, '_next/static')))
  .filter((file) => /\.(?:js|css)$/.test(file))
  .sort();
const entry = JSON.parse(
  await readFile(path.join(root, 'vinext-client-entry-manifest.json'), 'utf8'),
).appBrowserEntry;
if (typeof entry !== 'string' || !assets.includes(path.join(root, entry)))
  throw new Error('Missing PWA browser entry.');
const template = await readFile('public/sw.js', 'utf8');
const hash = createHash('sha256').update(template);
for (const file of assets)
  hash.update(path.relative(root, file)).update(await readFile(file));
const version = hash.digest('hex').slice(0, 16);
const source = template
  .replace("'kaikei-shell-v40'", JSON.stringify(`kaikei-shell-${version}`))
  .replace(
    "const APP_ENTRY = '__KAIKEI_APP_ENTRY__';",
    `const APP_ENTRY = ${JSON.stringify('/' + entry)};`,
  )
  .replace(
    'const PRECACHE_ASSETS = [];',
    `const PRECACHE_ASSETS = ${JSON.stringify(assets.map((file) => '/' + path.relative(root, file)))};`,
  );
await writeFile(path.join(root, 'sw.js'), source);
console.log(
  `PWA: ${assets.length} versioned JS/CSS files prepared; previous offline version retained.`,
);
