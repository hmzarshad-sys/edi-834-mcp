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
test('profile can require a full or a change file', () => {
  fires('HDR-FILE-TYPE', { action: '2' }, { profile: { expected_file_type: 'full' } });
  fires('HDR-FILE-TYPE', { action: 'RX' }, { profile: { expected_file_type: 'change' } });
  assert.ok(!rules(run({ action: 'RX' }, { profile: { expected_file_type: 'full' } })).includes('HDR-FILE-TYPE'));
  assert.ok(!rules(run({ action: '2' }, { profile: { expected_file_type: 'change' } })).includes('HDR-FILE-TYPE'));
  assert.ok(!rules(run({ action: '2' })).includes('HDR-FILE-TYPE'));
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

// ─── Full 834 structure (heading, 2100A–2200 extras, segment limits) ─────────

const sub = (o = {}) => SUBSCRIBER(o);
const cov = (extra) => [{ hd: ['030', '', 'HLT', 'PPO-GOLD', 'FAM'], begin: '20260101', extra }];

test('a file using the optional loops of the 834 structure stays clean', () => {
  const r = run({
    headerExtra: ['REF*38*POLICY123', 'DTP*007*D8*20260101', 'N1*BO*Example Broker*94*B123', 'ACT*ACCT77'],
    members: [
      sub({
        extraRefs: ['REF*17*EMPNO1'],
        extra: ['PER*IP**HP*5555550100', 'AMT*C1*250', 'NM1*31*1', 'N3*PO BOX 10', 'N4*CHICAGO*IL*60601', 'DSB*2', 'DTP*360*D8*20250601'],
        coverages: cov(['DTP*303*D8*20260101', 'AMT*P3*100', 'REF*X9*INT1']),
      }),
      DEPENDENT(),
    ],
  });
  assert.deepEqual(rules(r), []);
});

test('dates in the heading and in the disability loop are checked', () => {
  fires('DTP-DATE', { headerExtra: ['DTP*007*D8*20261340'] });
  fires('DTP-DATE', { members: [sub({ extra: ['DSB*2', 'DTP*360*D8*20250631'] }), DEPENDENT()] });
});

test('segments repeated beyond the implementation guide limits are rejected', () => {
  fires('SEG-MAX-USE', { headerExtra: ['REF*38*A', 'REF*38*B'] });
  fires('SEG-MAX-USE', { headerExtra: ['N1*BO*B1*94*1', 'N1*TV*T1*94*2', 'N1*BO*B2*94*3'] });
  const dtps = Array.from({ length: 6 }, () => 'DTP*303*D8*20260101');
  fires('SEG-MAX-USE', { members: [sub({ coverages: cov(dtps) }), DEPENDENT()] }); // 348 + 6 = 7 DTP
  const refs = Array.from({ length: 15 }, (_, i) => `REF*X9*R${i}`);
  fires('SEG-MAX-USE', { members: [sub({ coverages: cov(refs) }), DEPENDENT()] });
  const amts = Array.from({ length: 8 }, () => 'AMT*C1*1');
  fires('SEG-MAX-USE', { members: [sub({ extra: amts }), DEPENDENT()] });
  const many = Array.from({ length: 100 }, (_, i) => ({ hd: ['030', '', 'HLT', `P${i}`, 'FAM'], begin: '20260101' }));
  fires('SEG-MAX-USE', { members: [sub({ coverages: many }), DEPENDENT()] });
});

test('segments at the limit are accepted', () => {
  const dtps = Array.from({ length: 5 }, () => 'DTP*303*D8*20260101');
  assert.ok(!rules(run({ members: [sub({ coverages: cov(dtps) }), DEPENDENT()] })).includes('SEG-MAX-USE'));
  const refs = Array.from({ length: 14 }, (_, i) => `REF*X9*R${i}`);
  assert.ok(!rules(run({ members: [sub({ coverages: cov(refs) }), DEPENDENT()] })).includes('SEG-MAX-USE'));
});

// ─── Provider, COB and reporting-category loops; corrected names; records ────

test('2310, 2320 and 2700/2750 loops are not counted as coverage dates or policy numbers', () => {
  const reporting = ['LS*2700'];
  for (let i = 1; i <= 8; i++) reporting.push(`LX*${i}`, `N1*75*CATEGORY ${i}`, `REF*17*${i}`, 'DTP*007*D8*20260101');
  reporting.push('LE*2700');
  const r = run({ members: [sub({ coverages: cov([
    'LX*1', 'NM1*Y2*2******SV*PROV1*72',
    'COB*P*POLICY1*1', 'DTP*344*D8*20260101', 'DTP*345*D8*20261231',
    ...reporting,
  ]) }), DEPENDENT()] });
  assert.deepEqual(rules(r), []);
});

test('dates inside reporting categories are still checked', () => {
  fires('DTP-DATE', { members: [sub({ coverages: cov(['LS*2700', 'LX*1', 'N1*75*X', 'REF*17*1', 'DTP*007*RD8*20260101-20261340', 'LE*2700']) }), DEPENDENT()] });
});

test('NM1*74 (corrected name) is the member name; NM1*70 and its DMG are the prior name', () => {
  const raw = build834({ members: [sub(), DEPENDENT()], seCountDelta: 2 }) // two segments are added below
    .replace('NM1*IL*1*Doe*Jane****34*123451234~\nDMG*D8*19850214*F~', 'NM1*74*1*Doe*Jane****34*123451234~\nDMG*D8*19850214*F~\nNM1*70*1*Roe*Jane~\nDMG*D8*19850214*F~');
  assert.match(raw, /NM1\*74/);
  const r = validate834(raw, { today: TODAY });
  assert.deepEqual(rules(r), []);
});

test('placeholder SSNs are a warning in test files and an error in production files', () => {
  const bad = { members: [sub({ ssn: '999999991' }), DEPENDENT()] };
  assert.equal(run({ ...bad, usage: 'T' }).findings.find(f => f.rule === 'SSN-INVALID').severity, 'warning');
  assert.equal(run(bad).findings.find(f => f.rule === 'SSN-INVALID').severity, 'error');
});

test('every member gets a record with its status, coverages and no PII', () => {
  const r = run({ members: [sub(), DEPENDENT({ dob: '20151331' }), sub({ sub: 'EMP2', name: ['Lee', 'Kim'], ssn: '123451235' })] });
  assert.equal(r.records.length, 3);
  assert.deepEqual(r.records.map(x => x.status), ['correct', 'error', 'correct']);
  assert.equal(r.records_correct, 2);
  assert.deepEqual(r.records[1].rules, ['DMG-DOB']);
  assert.ok(r.records[1].position > r.records[0].position);
  assert.ok(r.segment_count > r.records[2].position);
  assert.deepEqual(r.records[0].coverages[0], { line: 'Health', plan: 'PPO-GOLD', level: 'FAM', maintenance: 'Addition', begin: '2026-01-01', end: '' });
  const text = JSON.stringify(r.records);
  for (const pii of ['Doe', 'Jane', 'Lee', '123451234', '19850214']) assert.ok(!text.includes(pii), pii);
});
