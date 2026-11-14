// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { PLATFORMS, PLATFORM_IDS, platformHint, platformProfile, withFixLocations } from '../src/platforms.mjs';
import { validate834 } from '../src/validator.mjs';
import { build834 } from './fixtures/build834.mjs';

const TODAY = new Date('2026-01-05T00:00:00Z');

async function ruleIds() {
  const src = await readFile(new URL('../src/validator.mjs', import.meta.url), 'utf8');
  return [...new Set([...src.matchAll(/add\('(?:error|warning|info)', '([A-Z0-9-]+)'/g)].map(m => m[1]))];
}

test('every platform with hints has a fix location for every validator rule', async () => {
  const ids = await ruleIds();
  for (const id of PLATFORM_IDS) {
    if (!PLATFORMS[id].hints) continue;
    assert.deepEqual(ids.filter(r => !platformHint(id, r)), [], `${id} is missing hints`);
  }
});

test('every platform hint names a place and an action, and has no stray rules', async () => {
  const ids = new Set(await ruleIds());
  for (const id of PLATFORM_IDS) {
    for (const [rule, h] of Object.entries(PLATFORMS[id].hints || {})) {
      assert.ok(h.where && h.how, `${id} ${rule}`);
      assert.ok(ids.has(rule), `${id} has a hint for unknown rule ${rule}`);
    }
  }
});

test('generic adds no fix locations; other platforms do', () => {
  const findings = [{ rule: 'HD05', severity: 'error' }];
  assert.equal(withFixLocations(findings, 'generic')[0].where_to_fix, undefined);
  assert.match(withFixLocations(findings, 'workday_ccb_834_v2')[0].where_to_fix.where, /Loop2300_HD05/);
  assert.match(withFixLocations(findings, 'employee_navigator')[0].where_to_fix.where, /834 EDI.*Fields.*HD_05/);
});

test('Employee Navigator expects full files; a carrier profile can override', () => {
  assert.equal(platformProfile('employee_navigator').expected_file_type, 'full');
  assert.equal(platformProfile('employee_navigator', { expected_file_type: null }).expected_file_type, null);
  assert.deepEqual(platformProfile('generic'), {});
  const change = build834({ action: '2' });
  const rules = (raw, platform) => validate834(raw, { today: TODAY, profile: platformProfile(platform) }).findings.map(f => f.rule);
  assert.ok(rules(change, 'employee_navigator').includes('HDR-FILE-TYPE'));
  assert.ok(!rules(change, 'generic').includes('HDR-FILE-TYPE'));
  assert.ok(!rules(build834({ action: '4' }), 'employee_navigator').includes('HDR-FILE-TYPE'));
});

test('Employee Navigator hints point mapping problems at the Fields step and data problems at the record', () => {
  assert.match(platformHint('employee_navigator', 'INS02').where, /Fields/);
  assert.match(platformHint('employee_navigator', 'INS02').how, /Default Value/);
  assert.match(platformHint('employee_navigator', 'SSN-INVALID').where, /record/);
  assert.match(platformHint('employee_navigator', 'ENV-TEST-FILE').where, /File Status/);
});
