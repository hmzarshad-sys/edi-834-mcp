#!/usr/bin/env node
// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Local web UI for edi-834-mcp: `npm run ui`, then open http://localhost:8834
//
// This server only hands static UI files to the browser. It never receives
// 834 files: the page reads them with FileReader and validates them in the
// browser. It listens on 127.0.0.1 only and serves a fixed allowlist of folders.

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.EDI_834_UI_PORT || 8834);
const ALLOWED = ['ui', 'src', `test${sep}fixtures`].map(d => resolve(ROOT, d) + sep);
const BLOCKED = new Set(['index.mjs', 'files.mjs', 'server.mjs']); // Node-only modules
const TYPES = { '.html': 'text/html; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

const server = createServer(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end(); return; }
  let path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/') { res.writeHead(302, { Location: '/ui/' }).end(); return; }
  if (path.endsWith('/')) path += 'index.html';
  const file = resolve(ROOT, '.' + path);
  const base = file.split(sep).pop();
  if (!ALLOWED.some(d => file.startsWith(d)) || BLOCKED.has(base) || !TYPES[extname(file)]) {
    res.writeHead(404).end('Not found'); return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)],
      'Cache-Control': 'no-store',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'none'; img-src 'self' data:",
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404).end('Not found');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`EDI 834 Validator UI: http://localhost:${PORT}`);
  console.log('Files you open are validated in your browser and never sent to this server.');
});
