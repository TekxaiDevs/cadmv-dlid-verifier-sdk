/*!
 * Copyright 2024 - 2026 California Department of Motor Vehicles.
 * Copyright 2018 - 2026 Digital Bazaar, Inc.
 *
 * SPDX-License-Identifier: BSD-3-Clause
 *
 * Bundle the CA DMV verifier + verifyBarcode wrapper for Android WebView.
 */
import * as esbuild from 'esbuild';
import {cpSync, mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dist = join(root, 'dist');
const androidAssets = join(
  root, '..', 'android', 'Cadmv.DlidVerifier.Demo', 'Assets', 'verifier');

mkdirSync(dist, {recursive: true});

const bannerJs =
  '/* CA DMV DL/ID verifier WebView bundle — npm run build */';

const result = await esbuild.build({
  entryPoints: [join(root, 'src', 'verifyBarcode.js')],
  bundle: true,
  outfile: join(dist, 'ca-verifier.bundle.js'),
  format: 'iife',
  globalName: 'CaVerifierModule',
  platform: 'browser',
  target: ['es2020'],
  // Minify: unminified bundle was ~1MB / 28k lines and dominated WebView cold start.
  minify: true,
  legalComments: 'none',
  // Node builtins must not leak into the WebView bundle.
  mainFields: ['browser', 'module', 'main'],
  conditions: ['browser', 'import', 'default'],
  // Prefer browser builds of http-client / fetch polyfills.
  // IIFE format replaces import.meta with {} — that breaks Digital Bazaar
  // context packages that do `new URL('../contexts/…', import.meta.url)` at
  // module init (contexts are already inlined; only the URL metadata breaks).
  // A stable absolute base keeps those constructors valid in WebView.
  define: {
    'process.env.NODE_ENV': '"production"',
    global: 'globalThis',
    'import.meta.url':
      '"https://appassets.androidplatform.net/assets/verifier/ca-verifier.bundle.js"'
  },
  banner: {
    js: bannerJs
  },
  footer: {
    js: [
      '',
      '/* Expose stable WebView API */',
      'globalThis.CaVerifier = Object.assign(',
      '  globalThis.CaVerifier || {},',
      '  CaVerifierModule',
      ');',
      'try {',
      '  if (globalThis.CaVerifierBridge &&',
      '      typeof CaVerifierBridge.onReady === \"function\") {',
      '    CaVerifierBridge.onReady();',
      '  }',
      '} catch (e) {}'
    ].join('\n')
  },
  logLevel: 'info',
  metafile: true,
  // PDF417 decode (and some DB deps) expect Node's Buffer in the WebView.
  inject: [join(root, 'src', 'polyfill-buffer.js')]
});

const firstOutput = result.metafile?.outputs ?
  Object.values(result.metafile.outputs)[0] :
  undefined;
const bytes = firstOutput?.bytes;
writeFileSync(
  join(dist, 'build-info.json'),
  JSON.stringify({
    builtAt: new Date().toISOString(),
    bundleBytes: bytes ?? null,
    sdkPin: 'file:../.. (repo root; pin commit when shipping)',
    entry: 'src/verifyBarcode.js'
  }, null, 2) + '\n'
);

// Copy HTML + bundle into Android demo assets when that tree exists.
mkdirSync(androidAssets, {recursive: true});
const htmlSrc = join(root, 'src', 'verifier.html');
const htmlDst = join(androidAssets, 'verifier.html');
cpSync(htmlSrc, htmlDst);
cpSync(
  join(dist, 'ca-verifier.bundle.js'),
  join(androidAssets, 'ca-verifier.bundle.js'));

console.log(`Wrote ${join(dist, 'ca-verifier.bundle.js')}` +
  (bytes ? ` (${bytes} bytes)` : ''));
console.log(`Copied assets → ${androidAssets}`);
