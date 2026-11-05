// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { CODE_TABLES } from './codes.mjs';

export function explainCode(table, code) {
  const t = CODE_TABLES[table];
  if (!t) return { error: true, message: `Unknown table "${table}".`, tables: Object.keys(CODE_TABLES) };
  if (code === undefined || code === null || code === '') {
    return { table, element: t.element, codes: t.table };
  }
  const key = String(code).trim().toUpperCase();
  const meaning = t.table[key] ?? t.table[String(code).trim()];
  return meaning
    ? { table, element: t.element, code: key, found: true, meaning }
    : { table, element: t.element, code: key, found: false, message: `"${key}" is not in the standard ${table} list. It may be a carrier-specific code; check the companion guide.` };
}
