// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { setupGuide, chooseService, workdayHint, WORKDAY_HINTS, SECTION_ORDER, SERVICES } from '../src/workday.mjs';

test('every validator rule has a Workday fix location', async () => {
  const src = await readFile(new URL('../src/validator.mjs', import.meta.url), 'utf8');
  const ids = [...new Set([...src.matchAll(/add\('(?:error|warning|info)', '([A-Z0-9-]+)'/g)].map(m => m[1]))];
  const missing = ids.filter(id => !workdayHint(id));
  assert.deepEqual(missing, []);
});

test('every hint names a place and an action', () => {
  for (const [rule, h] of Object.entries(WORKDAY_HINTS)) {
    assert.ok(h.where && h.how, rule);
  }
});

test('hints point blank-data findings at security permissions', () => {
  assert.match(workdayHint('DMG-MISSING').where, /Person Data/);
  assert.match(workdayHint('NM1-ID').where, /Dependent National IDs/);
});

test('coverage level hint mentions Maintain Health Care Coverage Targets', () => {
  assert.match(workdayHint('HD05').where, /Maintain Health Care Coverage Targets/);
});

test('setup guide returns all sections in order, or one section', () => {
  const all = setupGuide();
  assert.deepEqual(all.sections.map(s => s.key), SECTION_ORDER);
  for (const s of all.sections) assert.ok(s.title && s.steps.length, s.key);
  assert.equal(setupGuide('maps').sections.length, 1);
  assert.ok(setupGuide('nope').error);
});

test('service chooser', () => {
  assert.equal(chooseService({ file_type: 'changes' }).service, SERVICES.changes_only);
  const actives = chooseService({ file_type: 'full', terminations: 'no' });
  assert.equal(actives.service, SERVICES.actives_only);
  assert.match(actives.warning, /never sent/);
  assert.equal(chooseService({ file_type: 'full', terminations: 'once' }).service, SERVICES.full_report_all_ended_once);
  assert.equal(chooseService({ file_type: 'full', terminate_by: 'plan_type' }).service, SERVICES.full_ended_once_by_plan_type);
  const full = chooseService({ file_type: 'full', history_days: 45 });
  assert.equal(full.service, SERVICES.full_file);
  assert.match(full.settings[0], /45/);
  assert.ok(chooseService({ file_type: 'weekly' }).error);
});
