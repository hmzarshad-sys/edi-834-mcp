// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describe834, format834, autoFix834, toJson834, AUTO_FIXABLE } from '../src/structure.mjs';
import { validate834 } from '../src/validator.mjs';
import { build834, SUBSCRIBER, DEPENDENT } from './fixtures/build834.mjs';

const TODAY = new Date('2026-01-05T00:00:00Z');
const rules = (raw) => validate834(raw, { today: TODAY }).findings.map(f => f.rule);

test('every segment gets its loop, name and named elements with code meanings', () => {
  const raw = build834({
    headerExtra: ['DTP*007*D8*20260101'],
    members: [
      SUBSCRIBER({ extra: ['NM1*31*1', 'N3*PO BOX 1', 'N4*CHICAGO*IL*60601', 'DSB*2'],
        coverages: [{ hd: ['021', '', 'HLT', 'PPO', 'FAM'], begin: '20260101', extra: ['LX*1', 'NM1*Y2*2', 'COB*P*X*1', 'LS*2700', 'LX*1', 'N1*75*FAM IND', 'REF*17*I', 'LE*2700'] }] }),
      DEPENDENT(),
    ],
  });
  const { segments } = describe834(raw);
  const at = (id, from = 0) => segments.slice(from).find(s => s.id === id);
  const loops = segments.map(s => `${s.id}:${s.loop}`);
  assert.equal(segments[0].loop, 'ENV');
  assert.equal(at('BGN').loop, 'HDR');
  assert.equal(at('DTP').loop, 'HDR');
  assert.ok(loops.includes('N1:1000A') && loops.includes('N1:1000B'));
  assert.equal(at('INS').loop, '2000');
  assert.ok(loops.includes('NM1:2100A') && loops.includes('NM1:2100C') && loops.includes('DSB:2200'));
  assert.ok(loops.includes('HD:2300') && loops.includes('NM1:2310') && loops.includes('COB:2320'));
  assert.ok(loops.includes('N1:2750') && loops.includes('REF:2750') && loops.includes('LE:2700'));
  const hd = at('HD');
  assert.equal(hd.name, 'Health coverage');
  assert.deepEqual(hd.elements.filter(x => x.meaning).map(x => [x.ref, x.meaning]), [['HD01', 'Addition'], ['HD03', 'Health'], ['HD05', 'Family']]);
  assert.equal(hd.elements[2].ref, 'HD03');
  assert.equal(hd.elements[2].meaning, 'Health');
  assert.equal(at('INS').elements[1].meaning, 'Self');
});

test('format834 puts one segment per line and keeps the content', () => {
  const oneLine = build834({ terminator: '~' });
  const formatted = format834(oneLine);
  assert.equal(formatted.trim().split('\n').length, describe834(oneLine).segments.length);
  assert.deepEqual(rules(formatted), rules(oneLine));
});

test('autoFix834 corrects counts and control numbers, and nothing else', () => {
  const broken = build834({ seCountDelta: -2, seControl: '9999' });
  assert.ok(rules(broken).includes('ENV-SEGMENT-COUNT'));
  assert.ok(rules(broken).includes('ENV-CONTROL-ST'));
  const { text, fixes } = autoFix834(broken);
  assert.deepEqual(fixes.map(f => f.rule).sort(), ['ENV-CONTROL-ST', 'ENV-SEGMENT-COUNT']);
  assert.deepEqual(rules(text), []);
  for (const f of fixes) assert.ok(AUTO_FIXABLE.has(f.rule));
  // A clean file is returned unchanged.
  const clean = build834();
  assert.deepEqual(autoFix834(clean), { text: clean, fixes: [] });
  // Member data is never touched.
  assert.equal(text.split('\n').filter(l => /^(INS|NM1|HD|DTP|DMG|REF)/.test(l)).join('\n'), broken.split('\n').filter(l => /^(INS|NM1|HD|DTP|DMG|REF)/.test(l)).join('\n'));
});

test('toJson834 nests members and coverages', () => {
  const j = toJson834(build834());
  assert.equal(j.groups.length, 1);
  const tx = j.groups[0].transactions[0];
  assert.equal(tx.members.length, 2);
  assert.equal(tx.members[0].coverages[0].segments[0].segment, 'HD');
  assert.deepEqual(tx.members[0].segments[0].INS02, { value: '18', meaning: 'Self' });
  assert.equal(tx.trailer.segment, 'SE');
});
