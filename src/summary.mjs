// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// summarize834 — what is in a file, in counts (no PII).
// compare834   — what changed between two files for the same group/carrier.

import { parse834, e, memberRef, findDtp, dtpDates, formatDate } from './parser.mjs';
import { BGN_ACTION, MAINTENANCE_TYPE, INSURANCE_LINE, COVERAGE_LEVEL, RELATIONSHIP } from './codes.mjs';
import { memberLabel } from './mask.mjs';

export function summarize834(raw) {
  const model = parse834(raw);
  const out = {
    interchange: model.isa ? {
      sender: e(model.isa, 6), receiver: e(model.isa, 8),
      date: e(model.isa, 9), control_number: e(model.isa, 13),
      usage: e(model.isa, 15) === 'P' ? 'Production' : e(model.isa, 15) === 'T' ? 'Test' : e(model.isa, 15),
    } : null,
    delimiters: model.delimiters,
    transactions: [],
  };
  for (const tx of model.transactions) {
    const t = {
      control_number: e(tx.st, 2),
      file_date: e(tx.bgn, 3),
      action: BGN_ACTION[e(tx.bgn, 8)] || e(tx.bgn, 8),
      sponsor: tx.sponsor ? e(tx.sponsor, 2) : null,
      payer: tx.payer ? e(tx.payer, 2) : null,
      members: tx.members.length,
      subscribers: 0,
      dependents: 0,
      member_actions: {},
      coverage_lines: {},
      coverage_levels: {},
      terminations: 0,
    };
    for (const m of tx.members) {
      if (e(m.ins, 1) === 'Y') t.subscribers++; else t.dependents++;
      const mt = MAINTENANCE_TYPE[e(m.ins, 3)] || e(m.ins, 3);
      t.member_actions[mt] = (t.member_actions[mt] || 0) + 1;
      if (e(m.ins, 3) === '024') t.terminations++;
      for (const c of m.coverages) {
        const line = INSURANCE_LINE[e(c.hd, 3)] || e(c.hd, 3);
        const act = MAINTENANCE_TYPE[e(c.hd, 1)] || e(c.hd, 1);
        t.coverage_lines[line] ??= {};
        t.coverage_lines[line][act] = (t.coverage_lines[line][act] || 0) + 1;
        if (e(c.hd, 5)) {
          const lvl = COVERAGE_LEVEL[e(c.hd, 5)] || e(c.hd, 5);
          t.coverage_levels[lvl] = (t.coverage_levels[lvl] || 0) + 1;
        }
      }
    }
    out.transactions.push(t);
  }
  return out;
}

// ─── Compare ─────────────────────────────────────────────────────────────────

function memberKey(m) {
  const sub = memberRef(m, '0F');
  if (e(m.ins, 1) === 'Y') return `${sub}|18`;
  const first = (m.nm1 ? e(m.nm1, 4) : '').toUpperCase();
  const dob = m.dmg ? e(m.dmg, 2) : '';
  return `${sub}|${e(m.ins, 2)}|${dob}|${first}`;
}

function coverageMap(m) {
  const map = new Map();
  for (const c of m.coverages) {
    const line = e(c.hd, 3);
    const begin = findDtp(c.dtps, '348');
    const end = findDtp(c.dtps, '349');
    map.set(line, {
      line,
      plan: e(c.hd, 4),
      level: e(c.hd, 5),
      terminated: e(c.hd, 1) === '024' || e(m.ins, 3) === '024',
      begin: begin ? formatDate(dtpDates(begin).start) : '',
      end: end ? formatDate(dtpDates(end).start) : '',
    });
  }
  return map;
}

function indexMembers(model) {
  const map = new Map();
  let i = 0;
  for (const tx of model.transactions) {
    for (const m of tx.members) map.set(memberKey(m), { m, index: i++ });
  }
  return map;
}

export function compare834(oldRaw, newRaw, { showPii = false } = {}) {
  const oldM = parse834(oldRaw);
  const newM = parse834(newRaw);
  const oldIdx = indexMembers(oldM);
  const newIdx = indexMembers(newM);
  const newAction = e(newM.transactions[0]?.bgn, 8);
  const newIsFull = newAction === 'RX' || newAction === '4';
  const changes = [];
  const add = (severity, type, label, detail) => changes.push({ severity, type, member: label, detail });

  for (const [key, { m, index }] of newIdx) {
    const label = memberLabel(m, index, { showPii });
    const prev = oldIdx.get(key);
    if (!prev) {
      add('info', 'member_added', label, `New ${RELATIONSHIP[e(m.ins, 2)] || 'member'} in the new file (${MAINTENANCE_TYPE[e(m.ins, 3)] || e(m.ins, 3)}).`);
      continue;
    }
    const oc = coverageMap(prev.m), nc = coverageMap(m);
    for (const [line, n] of nc) {
      const o = oc.get(line);
      const lineName = INSURANCE_LINE[line] || line;
      if (!o) { add('info', 'coverage_added', label, `${lineName} coverage added${n.begin ? ` from ${n.begin}` : ''}.`); continue; }
      if (n.terminated && !o.terminated) add('warning', 'coverage_terminated', label, `${lineName} terminated${n.end ? ` effective ${n.end}` : ' (no end date sent)'}.`);
      if (o.level !== n.level && n.level) add('info', 'coverage_level_changed', label, `${lineName} coverage level ${COVERAGE_LEVEL[o.level] || o.level || 'none'} → ${COVERAGE_LEVEL[n.level] || n.level}.`);
      if (o.plan !== n.plan && n.plan) add('info', 'plan_changed', label, `${lineName} plan changed.`);
      if (o.begin && n.begin && o.begin !== n.begin) add('warning', 'begin_date_changed', label, `${lineName} benefit begin date changed ${o.begin} → ${n.begin}.`);
    }
    for (const [line, o] of oc) {
      if (!nc.has(line) && !o.terminated && newIsFull) {
        add('warning', 'coverage_missing', label, `${INSURANCE_LINE[line] || line} coverage is active in the old file but absent from this full file — the carrier may drop it.`);
      }
    }
    if (prev.m.dmg && m.dmg) {
      if (e(prev.m.dmg, 2) !== e(m.dmg, 2)) add('warning', 'birth_date_changed', label, 'Birth date changed.');
      if (e(prev.m.dmg, 3) !== e(m.dmg, 3)) add('info', 'gender_changed', label, 'Gender changed.');
    }
    if (prev.m.nm1 && m.nm1 && e(prev.m.nm1, 3) !== e(m.nm1, 3)) add('info', 'last_name_changed', label, 'Last name changed.');
  }

  for (const [key, { m, index }] of oldIdx) {
    if (newIdx.has(key)) continue;
    const label = memberLabel(m, index, { showPii });
    const wasActive = e(m.ins, 3) !== '024';
    if (newIsFull && wasActive) {
      add('error', 'member_missing', label, `${RELATIONSHIP[e(m.ins, 2)] || 'Member'} is in the old file but missing from this full-replacement file. The carrier may terminate their coverage. If this is unintended, it is a coverage gap.`);
    } else if (wasActive) {
      add('info', 'member_not_in_change_file', label, 'Not in the new file. Normal for a change-only file if nothing changed for this member.');
    }
  }

  const rank = { error: 0, warning: 1, info: 2 };
  changes.sort((a, b) => rank[a.severity] - rank[b.severity]);
  const counts = {};
  for (const c of changes) counts[c.type] = (counts[c.type] || 0) + 1;

  return {
    old_file: { members: oldIdx.size, action: BGN_ACTION[e(oldM.transactions[0]?.bgn, 8)] || null },
    new_file: { members: newIdx.size, action: BGN_ACTION[newAction] || null },
    new_file_is_full: newIsFull,
    counts,
    changes,
    note: newIsFull
      ? 'The new file is a full file, so members or coverages missing from it are treated as potential terminations.'
      : 'The new file is a change file, so members absent from it are reported only as information.',
  };
}
