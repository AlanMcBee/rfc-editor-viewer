import { build } from 'esbuild';
import { copyFile, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve('.');
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(root, 'src/extension/content-script.js')],
    outfile: resolve(dist, 'content-script.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120',
    minify: false,
    sourcemap: false
  }),
  build({
    entryPoints: [resolve(root, 'src/extension/background.js')],
    outfile: resolve(dist, 'background.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120'
  }),
  build({
    entryPoints: [resolve(root, 'src/extension/popup.js')],
    outfile: resolve(dist, 'popup.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120'
  }),
  build({
    entryPoints: [resolve(root, 'src/extension/options.js')],
    outfile: resolve(dist, 'options.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'chrome120'
  })
]);

await Promise.all([
  copyFile(resolve(root, 'src/extension/manifest.json'), resolve(dist, 'manifest.json')),
  copyFile(resolve(root, 'src/extension/popup.html'), resolve(dist, 'popup.html')),
  copyFile(resolve(root, 'src/extension/options.html'), resolve(dist, 'options.html')),
  copyFile(resolve(root, 'src/extension/styles.css'), resolve(dist, 'styles.css'))
]);

console.log('Built extension into /dist');
