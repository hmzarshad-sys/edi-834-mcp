// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { validate834, checkSsn } from '../src/validator.mjs';
import { parse834, detectDelimiters } from '../src/parser.mjs';
import { build834, SUBSCRIBER, DEPENDENT } from './fixtures/build834.mjs';

const TODAY = new Date('2026-01-05T00:00:00Z');
const run = (opts = {}, vopts = {}) => validate834(build834(opts), { today: TODAY, ...vopts });
const rules = (r) => r.findings.map(f => f.rule);
const fires = (rule, opts, vopts) => {
  const r = run(opts, vopts);
  assert.ok(rules(r).includes(rule), `${rule} should fire; got ${JSON.stringify(rules(r))}`);
  return r;
};

// ─── Baseline: a correct file produces no findings at all ────────────────────
// This is the "silent" half for every rule below.

test('a clean file is valid with zero findings', () => {
  const r = run();
  assert.equal(r.valid, true);
  assert.deepEqual(r.findings, []);
  assert.equal(r.members, 2);
});

// ─── Parser ──────────────────────────────────────────────────────────────────

test('detects delimiters from the ISA header, including unusual ones', () => {
  const f = build834().replace(/\*/g, '|').replace(/~\n/g, '\n');
  const d = detectDelimiters(f);
  assert.equal(d.element, '|');
  assert.equal(d.segment, '\n');
  assert.equal(validate834(f, { today: TODAY }).valid, true);
});

test('handles files with no line breaks after terminators', () => {
  const r = validate834(build834({ terminator: '~' }), { today: TODAY });
  assert.equal(r.valid, true);
});

test('rejects non-X12 input with a helpful message', () => {
  assert.throws(() => parse834('-----BEGIN PGP MESSAGE-----'), (e) => e.code === 'PARSE_ERROR' && /PGP/.test(e.suggestion));
});

// ─── Envelope ────────────────────────────────────────────────────────────────

test('ENV-SEGMENT-COUNT fires when SE01 is wrong', () => {
  const r = fires('ENV-SEGMENT-COUNT', { seCountDelta: 1 });
  assert.equal(r.valid, false);
});
test('ENV-CONTROL-ST fires when SE02 differs from ST02', () => fires('ENV-CONTROL-ST', { seControl: '9999' }));
test('ENV-GS01 fires when GS01 is not BE', () => fires('ENV-GS01', { gs01: 'HC' }));
test('ENV-VERSION fires on a 4010 file', () => fires('ENV-VERSION', { version: '004010X095A1' }));
test('ENV-TEST-FILE is information only', () => {
  const r = fires('ENV-TEST-FILE', { usage: 'T' });
  assert.equal(r.valid, true);
});
test('ENV-IEA-MISSING fires on a truncated file', () => {
  const f = build834().split('IEA')[0];
  assert.ok(rules(validate834(f, { today: TODAY })).includes('ENV-IEA-MISSING'));
});

// ─── Header ──────────────────────────────────────────────────────────────────

test('HDR-BGN08 fires on an invalid action code', () => fires('HDR-BGN08', { action: '9' }));
test('HDR-FULL-REPLACE warns that RX replaces the carrier roster', () => fires('HDR-FULL-REPLACE', { action: 'RX' }));
test('HDR-PAYER fires when N1*IN is missing', () => fires('HDR-PAYER', { omit: ['N1*IN'] }));
test('HDR-SPONSOR fires when N1*P5 is missing', () => fires('HDR-SPONSOR', { omit: ['N1*P5'] }));

// ─── Member ──────────────────────────────────────────────────────────────────

test('INS-SELF fires when a subscriber is not relationship 18', () =>
  fires('INS-SELF', { members: [SUBSCRIBER({ ins: ['Y', '01', '021', '28', 'A', '', '', 'FT'] })] }));
test('INS03 fires on an invalid maintenance type', () =>
  fires('INS03', { members: [SUBSCRIBER({ ins: ['Y', '18', '099', '28', 'A', '', '', 'FT'] })] }));
test('INS08-MISSING warns when a subscriber has no employment status', () =>
  fires('INS08-MISSING', { members: [SUBSCRIBER({ ins: ['Y', '18', '021', '28', 'A'] })] }));
test('INS-TERM-ACTIVE warns on a terminated employee kept active', () =>
  fires('INS-TERM-ACTIVE', { members: [SUBSCRIBER({ ins: ['Y', '18', '001', 'XN', 'A', '', '', 'TE'] })] }));
test('INS-TERM-ACTIVE is silent for COBRA continuation', () => {
  const r = run({ members: [SUBSCRIBER({ ins: ['Y', '18', '001', '09', 'C', '', '', 'TE'] })] });
  assert.ok(!rules(r).includes('INS-TERM-ACTIVE'));
});
test('REF-0F fires when the subscriber ID is missing', () =>
  fires('REF-0F', { members: [SUBSCRIBER({ sub: null })] }));
test('DEP-ORPHAN fires when a dependent does not follow its subscriber', () =>
  fires('DEP-ORPHAN', { members: [SUBSCRIBER(), DEPENDENT({ sub: 'EMP9999' })] }));
test('DUP-SUBSCRIBER warns on the same subscriber twice', () =>
  fires('DUP-SUBSCRIBER', { members: [SUBSCRIBER(), SUBSCRIBER()] }));

test('SSN-INVALID fires on never-issued SSNs', () => {
  for (const ssn of ['000123456', '666123456', '912345678', '123001234', '123450000', '111111111', '12345']) {
    fires('SSN-INVALID', { members: [SUBSCRIBER({ ssn })] });
  }
});
test('checkSsn accepts a well-formed SSN', () => assert.equal(checkSsn('123451234'), null));
test('SSN values never appear in findings', () => {
  const r = run({ members: [SUBSCRIBER({ ssn: '666123456' })] });
  assert.ok(!JSON.stringify(r).includes('666123456'));
  assert.ok(!JSON.stringify(r).includes('Doe'), 'names are masked by default');
});
test('names appear only with showPii', () => {
  const r = run({ members: [SUBSCRIBER({ ssn: '666123456' })] }, { showPii: true });
  assert.ok(JSON.stringify(r).includes('Jane Doe'));
});

test('DMG-DOB fires on an impossible date', () =>
  fires('DMG-DOB', { members: [SUBSCRIBER({ dob: '19850231' })] }));
test('DMG-DOB-FUTURE fires on a future birth date', () =>
  fires('DMG-DOB-FUTURE', { members: [SUBSCRIBER({ dob: '20300101' })] }));
test('DMG-MISSING warns when demographics are absent', () =>
  fires('DMG-MISSING', { members: [SUBSCRIBER({ dob: null })] }));
test('DEP-AGE warns for a child at the age limit', () =>
  fires('DEP-AGE', { members: [SUBSCRIBER(), DEPENDENT({ dob: '19990101' })] }));
test('DEP-AGE is silent for a spouse of any age and can be disabled', () => {
  assert.ok(!rules(run({ members: [SUBSCRIBER(), DEPENDENT({ rel: '01', dob: '19600101' })] })).includes('DEP-AGE'));
  assert.ok(!rules(run({ members: [SUBSCRIBER(), DEPENDENT({ dob: '19990101' })] }, { profile: { dependent_age_limit: 0 } })).includes('DEP-AGE'));
});

// ─── Coverage ────────────────────────────────────────────────────────────────

test('DTP-348 fires when the benefit begin date is missing', () =>
  fires('DTP-348', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'] }] })] }));
test('TERM-NO-END fires on a termination with no end date', () =>
  fires('TERM-NO-END', { members: [SUBSCRIBER({ ins: ['Y', '18', '024', '08', 'A', '', '', 'TE'], coverages: [{ hd: ['024', '', 'HLT', 'PPO', 'EMP'], begin: '20250101' }] })] }));
test('TERM-NO-END is silent when DTP*349 is sent', () => {
  const r = run({ members: [SUBSCRIBER({ ins: ['Y', '18', '024', '08', 'A', '', '', 'TE'], coverages: [{ hd: ['024', '', 'HLT', 'PPO', 'EMP'], begin: '20250101', end: '20251231' }] })] });
  assert.ok(!rules(r).includes('TERM-NO-END'));
});
test('END-BEFORE-BEGIN fires on inverted dates', () =>
  fires('END-BEFORE-BEGIN', { members: [SUBSCRIBER({ ins: ['Y', '18', '024', '08', 'A', '', '', 'TE'], coverages: [{ hd: ['024', '', 'HLT', 'PPO', 'EMP'], begin: '20260101', end: '20251231' }] })] }));
test('RETRO warns on coverage far in the past', () =>
  fires('RETRO', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20250101' }] })] }));
test('FUTURE warns on a likely year typo', () =>
  fires('FUTURE', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20270101' }] })] }));
test('DTP-DATE fires on an invalid date value', () =>
  fires('DTP-DATE', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20261301' }] })] }));
test('HD05 fires on an invalid coverage level', () =>
  fires('HD05', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'XXX'], begin: '20260101' }] })] }));
test('HD03 warns on a non-standard insurance line', () =>
  fires('HD03', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'ZZZ', 'PPO', 'EMP'], begin: '20260101' }] })] }));

test('TIER-MISMATCH warns when employee-only coverage has dependents on it', () =>
  fires('TIER-MISMATCH', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20260101' }] }), DEPENDENT()] }));
test('TIER-MISMATCH is silent for family coverage or dependents on another line', () => {
  assert.ok(!rules(run()).includes('TIER-MISMATCH'));
  const r = run({ members: [
    SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'EMP'], begin: '20260101' }, { hd: ['021', '', 'DEN', 'DENT', 'ECH'], begin: '20260101' }] }),
    DEPENDENT({ coverages: [{ hd: ['021', '', 'DEN', 'DENT'], begin: '20260101' }] }),
  ] });
  assert.ok(!rules(r).includes('TIER-MISMATCH'));
});

// ─── Carrier profiles ────────────────────────────────────────────────────────

test('profile restricts insurance lines and coverage levels', () => {
  const profile = { allowed_insurance_lines: ['DEN'], allowed_coverage_levels: ['EMP'] };
  const r = run({}, { profile });
  assert.ok(rules(r).includes('HD03-PROFILE'));
  assert.ok(rules(r).includes('HD05-PROFILE'));
});
test('profile can require a group number', () => {
  fires('REF-1L', {}, { profile: { require_group_number: true } });
  const ok = run({ members: [SUBSCRIBER({ extraRefs: ['REF*1L*GRP100'] }), DEPENDENT({ extraRefs: ['REF*1L*GRP100'] })] }, { profile: { require_group_number: true } });
  assert.ok(!rules(ok).includes('REF-1L'));
});

// ─── Output shape ────────────────────────────────────────────────────────────

test('every finding has a rule, severity, message and fix, and errors sort first', () => {
  const r = run({ seCountDelta: 2, members: [SUBSCRIBER({ ins: ['Y', '18', '021', '28', 'A'] })] });
  for (const f of r.findings) {
    assert.ok(f.rule && f.severity && f.message && f.fix, JSON.stringify(f));
  }
  assert.equal(r.findings[0].severity, 'error');
});

test('subscriber IDs stay masked even with showPii (they are often SSNs)', () => {
  const r = run({ members: [SUBSCRIBER({ sub: '123451234', ssn: '666123456' })] }, { showPii: true });
  assert.ok(!JSON.stringify(r).includes('123451234'));
});

test('docs/rules.md lists every rule the validator can emit', async () => {
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/validator.mjs', import.meta.url), 'utf8');
  const doc = await readFile(new URL('../docs/rules.md', import.meta.url), 'utf8');
  const ids = [...new Set([...src.matchAll(/add\('(?:error|warning|info)', '([A-Z0-9-]+)'/g)].map(m => m[1]))];
  const missing = ids.filter(id => !doc.includes(`| ${id} |`));
  assert.deepEqual(missing, []);
  assert.ok(ids.length >= 60, `expected 60+ rules, found ${ids.length}`);
});

// ─── Segments, element lengths and addresses ─────────────────────────────────

const ADDR = (n4 = 'N4*Chicago*IL*60601') => ['N3*100 Main St', n4];

test('a member with a complete US address stays clean', () => {
  const r = run({ members: [SUBSCRIBER({ address: ADDR() }), DEPENDENT({ address: ['N3*100 Main St', 'N4*Chicago*IL*606011234'] })] });
  assert.deepEqual(r.findings, []);
});

test('a foreign address with N404 skips US state and ZIP checks', () => {
  const r = run({ members: [SUBSCRIBER({ address: ADDR('N4*Toronto*ON*M5V2T6*CA') }), DEPENDENT()] });
  assert.deepEqual(r.findings, []);
});

test('SEG-UNKNOWN fires on a segment that is not part of an 834', () => {
  fires('SEG-UNKNOWN', { members: [SUBSCRIBER({ extraRefs: ['CLM*1*100'] }), DEPENDENT()] });
});

test('ELEM-LENGTH fires on an over-long last name and plan description', () => {
  const r = fires('ELEM-LENGTH', { members: [SUBSCRIBER({ name: ['X'.repeat(61), 'Jane'] }), DEPENDENT()] });
  assert.ok(!JSON.stringify(r.findings).includes('X'.repeat(61)), 'value must not be echoed');
  fires('ELEM-LENGTH', { members: [SUBSCRIBER({ coverages: [{ hd: ['021', '', 'HLT', 'P'.repeat(51), 'FAM'], begin: '20260101' }] }), DEPENDENT()] });
});

test('ADDR-STATE and ADDR-ZIP fire on bad US values without echoing them', () => {
  const r = run({ members: [SUBSCRIBER({ address: ADDR('N4*Chicago*Illinois*60601-1234') }), DEPENDENT()] });
  assert.ok(rules(r).includes('ADDR-STATE'));
  assert.ok(rules(r).includes('ADDR-ZIP'));
  assert.ok(!JSON.stringify(r.findings).includes('60601-1234'));
});

test('ADDR-CITY, ADDR-STREET, ADDR-N3-MISSING and ADDR-N4-MISSING fire', () => {
  fires('ADDR-CITY', { members: [SUBSCRIBER({ address: ADDR('N4**IL*60601') }), DEPENDENT()] });
  fires('ADDR-STREET', { members: [SUBSCRIBER({ address: ['N3*', 'N4*Chicago*IL*60601'] }), DEPENDENT()] });
  fires('ADDR-N3-MISSING', { members: [SUBSCRIBER({ address: ['N4*Chicago*IL*60601'] }), DEPENDENT()] });
  fires('ADDR-N4-MISSING', { members: [SUBSCRIBER({ address: ['N3*100 Main St'] }), DEPENDENT()] });
});

test('the mailing address loop (2100C) is checked separately', () => {
  const r = fires('ADDR-ZIP', { members: [SUBSCRIBER({ address: [...ADDR(), 'NM1*31*1', 'N3*PO Box 5', 'N4*Chicago*IL*ABCDE'] }), DEPENDENT()] });
  assert.ok(r.findings.some(f => f.rule === 'ADDR-ZIP' && f.message.includes('mailing address (2100C)')));
});
