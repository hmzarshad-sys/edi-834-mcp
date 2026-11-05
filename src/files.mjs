// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// File access is confined to one folder (EDI_834_DIR). Paths that escape it
// are refused, so the server can never be pointed at the rest of the disk.

import { readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export const MAX_FILE_MB = Number(process.env.EDI_834_MAX_MB || 50);

export function baseDir() {
  const dir = process.env.EDI_834_DIR;
  if (!dir) return null;
  return resolve(dir);
}

export function safePath(relative) {
  const base = baseDir();
  if (!base) {
    const err = new Error('EDI_834_DIR is not set, so files cannot be read.');
    err.code = 'NO_BASE_DIR';
    err.suggestion = 'Set EDI_834_DIR to the folder holding your 834 files when you add the server to Claude (see README).';
    throw err;
  }
  const abs = resolve(base, relative);
  if (abs !== base && !abs.startsWith(base + sep)) {
    const err = new Error(`"${relative}" is outside the allowed folder.`);
    err.code = 'PATH_OUTSIDE_DIR';
    err.suggestion = 'Use a path relative to EDI_834_DIR.';
    throw err;
  }
  return abs;
}

export async function readEdiFile(relative) {
  const abs = safePath(relative);
  if (!existsSync(abs)) {
    const err = new Error(`File not found: ${relative}`);
    err.code = 'FILE_NOT_FOUND';
    err.suggestion = 'Check the file name; paths are relative to EDI_834_DIR.';
    throw err;
  }
  const s = await stat(abs);
  if (s.size > MAX_FILE_MB * 1048576) {
    const err = new Error(`${relative} is ${(s.size / 1048576).toFixed(1)} MB, over the ${MAX_FILE_MB} MB limit.`);
    err.code = 'FILE_TOO_LARGE';
    err.suggestion = 'Raise EDI_834_MAX_MB if this is expected.';
    throw err;
  }
  return readFile(abs, 'latin1');
}

export async function readJson(relative) {
  return JSON.parse(await readEdiFile(relative));
}
