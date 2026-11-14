// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Builds dist/edi-834-validator.html: the UI and every module it imports in
// one self-contained file that works offline, opened from disk or hosted.
// No dependencies: each ES module is wrapped in a function scope and its
// imports and exports are rewritten. This relies on the repo's own style
// (named imports and `export const|function|class` only).
//
//   npm run build:ui

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENTRY = resolve(ROOT, 'ui/app.mjs');
const OUT = resolve(ROOT, 'dist/edi-834-validator.html');
const NO_DOWNLOAD = process.argv.includes('--hosted');

const IMPORT_RE = /^import\s*\{([\s\S]*?)\}\s*from\s*['"](\.{1,2}\/[^'"]+)['"];?/gm;
const EXPORT_RE = /^export\s+(?:async\s+)?(const|let|function\*?|class)\s+([A-Za-z_$][\w$]*)/gm;

const order = [];
const seen = new Map();

async function load(file) {
  if (seen.has(file)) return seen.get(file);
  const id = relative(ROOT, file).replace(/\\/g, '/');
  const mod = { id, file, code: '' };
  seen.set(file, mod);
  let src = await readFile(file, 'utf8');
  if (/^\s*import\s+(?!\{)/m.test(src) || /^export\s+(default|\{|\*)/m.test(src)) {
    throw new Error(`${id}: only named imports and declaration exports are supported by build-ui.`);
  }
  const deps = [];
  for (const m of src.matchAll(IMPORT_RE)) deps.push(resolve(dirname(file), m[2]));
  for (const d of deps) await load(d);
  src = src.replace(IMPORT_RE, (_, names, spec) => {
    const dep = seen.get(resolve(dirname(file), spec));
    const bindings = names.split(',').map(s => s.trim()).filter(Boolean).map(s => s.replace(/\s+as\s+/, ': ')).join(', ');
    return `const { ${bindings} } = __mods[${JSON.stringify(dep.id)}];`;
  });
  const exported = [...src.matchAll(EXPORT_RE)].map(m => m[2]);
  src = src.replace(/^export\s+/gm, '');
  mod.code = `__mods[${JSON.stringify(id)}] = (() => {\n${src}\nreturn { ${exported.join(', ')} };\n})();`;
  order.push(mod);
  return mod;
}

await load(ENTRY);
const pkg = JSON.parse(await readFile(resolve(ROOT, 'package.json'), 'utf8'));
const bundle = [
  `// edi-834-mcp ${pkg.version} browser build. MIT License, Copyright (c) 2026 Humza Arshad.`,
  NO_DOWNLOAD ? 'window.EDI834_NO_DOWNLOAD = true;' : '',
  'const __mods = {};',
  ...order.map(m => `// ── ${m.id}\n${m.code}`),
].join('\n').replace(/<\/script/gi, '<\\/script');

const html = await readFile(resolve(ROOT, 'ui/index.html'), 'utf8');
const tag = '<script type="module" src="./app.mjs"></script>';
if (!html.includes(tag)) throw new Error('ui/index.html no longer contains the app.mjs script tag.');
const out = html.replace(tag, () => `<script type="module">\n${bundle}\n</script>`);

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, out);
console.log(`Wrote ${relative(ROOT, OUT)} (${Math.round(out.length / 1024)} KB, ${order.length} modules)`);
