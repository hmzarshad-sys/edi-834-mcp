// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Members are identified in results without exposing PII. By default a member
// is shown as "Member #n (subscriber ...1234, Self)" — the last four
// characters of the subscriber ID, never a name, SSN or birth date.

import { e, memberRef } from './parser.mjs';
import { RELATIONSHIP } from './codes.mjs';

export function maskId(id) {
  if (!id) return '(no ID)';
  const s = String(id);
  return s.length <= 4 ? '*'.repeat(s.length) : `…${s.slice(-4)}`;
}

export function memberLabel(member, index, { showPii = false } = {}) {
  const sub = memberRef(member, '0F');
  const rel = RELATIONSHIP[e(member.ins, 2)] || e(member.ins, 2) || 'unknown relationship';
  if (showPii && member.nm1) {
    const name = [e(member.nm1, 4), e(member.nm1, 3)].filter(Boolean).join(' ');
    // The subscriber ID stays masked even with showPii: many employers use the SSN as the ID.
    return `Member #${index + 1} (${name || 'no name'}, subscriber ${maskId(sub)}, ${rel})`;
  }
  return `Member #${index + 1} (subscriber ${maskId(sub)}, ${rel})`;
}
