// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compare834, summarize834 } from '../src/summary.mjs';
import { explainCode } from '../src/explain.mjs';
import { build834, SUBSCRIBER, DEPENDENT } from './fixtures/build834.mjs';

const types = (r) => r.changes.map(c => c.type);

test('identical files produce no changes', () => {
  const f = build834({ action: 'RX' });
  const r = compare834(f, f);
  assert.deepEqual(r.changes, []);
});

test('a dependent dropped from a full file is an error (coverage gap)', () => {
  const oldF = build834({ action: 'RX' });
  const newF = build834({ action: 'RX', members: [SUBSCRIBER()] });
  const r = compare834(oldF, newF);
  assert.ok(types(r).includes('member_missing'));
  assert.equal(r.changes[0].severity, 'error');
});

test('a member absent from a change file is only information', () => {
  const r = compare834(build834({ action: '2' }), build834({ action: '2', members: [SUBSCRIBER()] }));
  assert.ok(types(r).includes('member_not_in_change_file'));
  assert.ok(!types(r).includes('member_missing'));
});

test('detects terminations, tier changes, added coverage and begin-date changes', () => {
  const oldF = build834({ members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20260101' }] })] });
  const newF = build834({ members: [SUBSCRIBER({ coverages: [
    { hd: ['001', '', 'HLT', 'PPO', 'FAM'], begin: '20260201' },
    { hd: ['021', '', 'DEN', 'DENT', 'EMP'], begin: '20260101' },
  ] })] });
  const t = types(compare834(oldF, newF));
  for (const expected of ['coverage_level_changed', 'coverage_added', 'begin_date_changed']) assert.ok(t.includes(expected), expected);

  const termF = build834({ members: [SUBSCRIBER({ ins: ['Y', '18', '024', '08', 'A', '', '', 'TE'], coverages: [{ hd: ['024', '', 'HLT', 'PPO', 'EMP'], begin: '20260101', end: '20260131' }] })] });
  assert.ok(types(compare834(oldF, termF)).includes('coverage_terminated'));
});

test('coverage missing from a full file is flagged', () => {
  const oldF = build834({ action: 'RX', members: [SUBSCRIBER({ coverages: [
    { hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20260101' }, { hd: ['021', '', 'VIS', 'V1', 'EMP'], begin: '20260101' }] })] });
  const newF = build834({ action: 'RX', members: [SUBSCRIBER({ coverages: [{ hd: ['030', '', 'HLT', 'PPO', 'EMP'], begin: '20260101' }] })] });
  assert.ok(types(compare834(oldF, newF)).includes('coverage_missing'));
});

test('demographic changes are reported without values', () => {
  const r = compare834(build834(), build834({ members: [SUBSCRIBER({ dob: '19850215' }), DEPENDENT()] }));
  assert.ok(types(r).includes('birth_date_changed'));
  assert.ok(!JSON.stringify(r).includes('19850215'));
  assert.ok(!JSON.stringify(r).includes('Doe'));
});

test('summary counts members, actions and coverage without PII', () => {
  const s = summarize834(build834());
  const t = s.transactions[0];
  assert.equal(t.members, 2);
  assert.equal(t.subscribers, 1);
  assert.equal(t.dependents, 1);
  assert.equal(t.coverage_lines.Health.Addition, 2);
  assert.ok(!JSON.stringify(s).includes('Doe'));
});

test('explainCode looks up single codes and whole tables', () => {
  assert.equal(explainCode('relationship', '19').meaning, 'Child');
  assert.equal(explainCode('coverage_level', 'esp').meaning, 'Employee and Spouse');
  assert.equal(explainCode('relationship', 'ZZ').found, false);
  assert.ok(explainCode('insurance_line').codes.HLT);
  assert.ok(explainCode('nope').error);
});
