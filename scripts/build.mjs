import { build } from 'esbuild';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const dist = resolve(root, 'dist');
const debug = process.argv.includes('--debug') || process.env.REV_BUILD_MODE === 'debug';

const pkg = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));

const common = {
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome120',
  minify: !debug,
  sourcemap: debug ? 'inline' : false,
  define: { __REV_DEBUG__: JSON.stringify(debug) }
};

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all(
  ['content-script', 'background', 'options'].map((name) =>
    build({
      ...common,
      entryPoints: [resolve(root, `src/extension/${name}.js`)],
      outfile: resolve(dist, `${name}.js`)
    })
  )
);

const manifest = JSON.parse(await readFile(resolve(root, 'src/extension/manifest.json'), 'utf8'));
manifest.version = pkg.version;
if (debug) {
  manifest.version_name = `${pkg.version}-debug`;
}

await Promise.all([
  writeFile(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`),
  copyFile(resolve(root, 'src/extension/options.html'), resolve(dist, 'options.html')),
  copyFile(resolve(root, 'src/extension/styles.css'), resolve(dist, 'styles.css'))
]);

console.log(`Built ${debug ? 'debug' : 'release'} extension v${pkg.version} into /dist`);
