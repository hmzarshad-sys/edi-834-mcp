// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Validation rules for X12 005010X220A1 (834) files. Each finding carries:
//   rule      stable rule ID (see docs/rules.md)
//   severity  error   → the carrier will likely reject the file or the record
//             warning → probably wrong; likely to cause a coverage problem
//             info    → worth a look; not necessarily wrong
//   segment   1-based segment position in the file, plus the segment ID
//   message   what is wrong, in plain English
//   fix       what to change
// Messages never include names, SSNs or birth dates unless showPii is set.

import { parse834, e, memberRef, findDtp, dtpDates, parseD8, formatDate } from './parser.mjs';
import {
  IMPLEMENTATION_GUIDE, BGN_PURPOSE, BGN_ACTION, RELATIONSHIP, MAINTENANCE_TYPE, MAINTENANCE_REASON,
  BENEFIT_STATUS, EMPLOYMENT_STATUS, INSURANCE_LINE, COVERAGE_LEVEL, SINGLE_COVERAGE, GENDER,
  KNOWN_SEGMENTS, ELEMENT_MAX, US_STATES,
} from './codes.mjs';
import { memberLabel } from './mask.mjs';

export const DEFAULT_PROFILE = {
  name: 'X12 005010X220A1 baseline',
  allowed_insurance_lines: null,      // e.g. ["HLT", "DEN", "VIS"]
  allowed_coverage_levels: null,      // e.g. ["EMP", "ESP", "ECH", "FAM"]
  require_group_number: false,        // REF*1L on every member or coverage
  require_ssn: false,                 // NM108=34 on every subscriber
  max_retro_days: 90,                 // flag coverage starting more than N days before the file date
  max_future_days: 180,               // flag coverage starting more than N days after the file date
  dependent_age_limit: 26,            // flag child dependents at or over this age (0 disables)
};

export function validate834(raw, { profile = {}, showPii = false, today = new Date() } = {}) {
  const p = { ...DEFAULT_PROFILE, ...profile };
  const findings = [];
  const add = (severity, rule, seg, message, fix) => findings.push({
    severity, rule, segment: seg ? { position: seg.position, id: seg.id } : null, message, fix,
  });

  const model = parse834(raw);
  validateEnvelope(model, add);
  validateSegments(model, add);

  let memberIndex = 0;
  for (const tx of model.transactions) {
    const fileDate = parseD8(e(tx.bgn, 3)) || today;
    validateHeader(tx, add);
    const seenSubscribers = new Map();
    let currentSubscriber = null;
    const familyCount = new Map();

    for (const m of tx.members) {
      const label = memberLabel(m, memberIndex, { showPii });
      memberIndex++;
      const sub = memberRef(m, '0F');
      if (e(m.ins, 1) === 'Y') {
        currentSubscriber = sub;
        familyCount.set(sub, { subscriber: m, label, dependents: 0 });
      } else if (familyCount.has(sub)) {
        familyCount.get(sub).dependents++;
      }
      validateMember(m, label, { add, p, fileDate, currentSubscriber, seenSubscribers, today, showPii });
    }
    validateFamilies(familyCount, tx, add);
  }

  const counts = { error: 0, warning: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  findings.sort((a, b) => sevRank(a.severity) - sevRank(b.severity) || (a.segment?.position ?? 0) - (b.segment?.position ?? 0));

  return {
    valid: counts.error === 0,
    profile: p.name,
    transactions: model.transactions.length,
    members: memberIndex,
    counts,
    findings,
  };
}

function sevRank(s) { return s === 'error' ? 0 : s === 'warning' ? 1 : 2; }

// ─── Envelope (ISA/GS/ST and their trailers) ─────────────────────────────────

function validateEnvelope(model, add) {
  const { isa, iea } = model;
  if (isa && isa.elements.length !== 17) {
    add('error', 'ENV-ISA-FIELDS', isa, `ISA has ${isa.elements.length - 1} elements; it must have exactly 16.`, 'Regenerate the ISA header. It is fixed-length (106 characters) and should never be edited by hand.');
  }
  if (!iea) {
    add('error', 'ENV-IEA-MISSING', null, 'The file has no IEA trailer, so it is incomplete.', 'Check that the file was not truncated during generation or transfer.');
  } else {
    if (e(iea, 2) !== e(isa, 13)) {
      add('error', 'ENV-CONTROL-ISA', iea, `IEA02 control number "${e(iea, 2)}" does not match ISA13 "${e(isa, 13)}".`, 'Both must carry the same interchange control number.');
    }
    if (Number(e(iea, 1)) !== model.groups.length) {
      add('error', 'ENV-COUNT-GS', iea, `IEA01 says ${e(iea, 1)} functional group(s) but the file has ${model.groups.length}.`, `Set IEA01 to ${model.groups.length}.`);
    }
  }
  if (isa && e(isa, 15) === 'T') {
    add('info', 'ENV-TEST-FILE', isa, 'ISA15 is "T": this is flagged as a test file.', 'Use "P" when sending to production; carriers usually ignore or reject test files in production.');
  }
  if (model.groups.length === 0) add('error', 'ENV-GS-MISSING', null, 'No GS functional group was found.', 'Every 834 must sit inside a GS/GE group.');

  for (const g of model.groups) {
    if (e(g.gs, 1) !== 'BE') {
      add('error', 'ENV-GS01', g.gs, `GS01 is "${e(g.gs, 1)}"; an 834 functional group must be "BE" (Benefit Enrollment).`, 'Set GS01 to BE.');
    }
    if (e(g.gs, 8) !== IMPLEMENTATION_GUIDE) {
      add('error', 'ENV-VERSION', g.gs, `GS08 is "${e(g.gs, 8)}"; expected "${IMPLEMENTATION_GUIDE}".`, `Use version ${IMPLEMENTATION_GUIDE} (HIPAA 5010 834).`);
    }
    if (!g.ge) {
      add('error', 'ENV-GE-MISSING', g.gs, 'This GS group has no GE trailer.', 'Add a GE segment after the last SE of the group.');
    } else {
      if (e(g.ge, 2) !== e(g.gs, 6)) add('error', 'ENV-CONTROL-GS', g.ge, `GE02 "${e(g.ge, 2)}" does not match GS06 "${e(g.gs, 6)}".`, 'Both must carry the same group control number.');
      if (Number(e(g.ge, 1)) !== g.transactions.length) add('error', 'ENV-COUNT-ST', g.ge, `GE01 says ${e(g.ge, 1)} transaction(s) but the group has ${g.transactions.length}.`, `Set GE01 to ${g.transactions.length}.`);
    }
  }

  for (const tx of model.transactions) {
    if (e(tx.st, 1) !== '834') add('error', 'ENV-ST01', tx.st, `ST01 is "${e(tx.st, 1)}"; expected "834".`, 'This validator only checks 834 transactions.');
    if (e(tx.st, 3) && e(tx.st, 3) !== IMPLEMENTATION_GUIDE) add('error', 'ENV-VERSION', tx.st, `ST03 is "${e(tx.st, 3)}"; expected "${IMPLEMENTATION_GUIDE}".`, `Set ST03 to ${IMPLEMENTATION_GUIDE}.`);
    if (!tx.se) {
      add('error', 'ENV-SE-MISSING', tx.st, 'This transaction has no SE trailer.', 'The file is truncated or the generator failed before finishing.');
      continue;
    }
    if (e(tx.se, 2) !== e(tx.st, 2)) add('error', 'ENV-CONTROL-ST', tx.se, `SE02 "${e(tx.se, 2)}" does not match ST02 "${e(tx.st, 2)}".`, 'Both must carry the same transaction control number.');
    if (Number(e(tx.se, 1)) !== tx.segmentCount) {
      add('error', 'ENV-SEGMENT-COUNT', tx.se, `SE01 says ${e(tx.se, 1)} segments but ST through SE contains ${tx.segmentCount}.`, `Set SE01 to ${tx.segmentCount}. A wrong count usually means segments were added or removed after generation.`);
    }
  }
}

// ─── Transaction header (BGN, sponsor, payer) ────────────────────────────────

function validateHeader(tx, add) {
  if (!tx.bgn) {
    add('error', 'HDR-BGN-MISSING', tx.st, 'BGN (beginning segment) is missing after ST.', 'Every 834 needs BGN with purpose code, reference, date and action code.');
  } else {
    if (!BGN_PURPOSE[e(tx.bgn, 1)]) add('error', 'HDR-BGN01', tx.bgn, `BGN01 "${e(tx.bgn, 1)}" is not a valid purpose code.`, `Use one of: ${Object.keys(BGN_PURPOSE).join(', ')}.`);
    if (!parseD8(e(tx.bgn, 3))) add('error', 'HDR-BGN-DATE', tx.bgn, `BGN03 "${e(tx.bgn, 3)}" is not a valid CCYYMMDD date.`, 'Use the file creation date, e.g. 20260105.');
    const action = e(tx.bgn, 8);
    if (!BGN_ACTION[action]) {
      add('error', 'HDR-BGN08', tx.bgn, `BGN08 "${action}" is not a valid action code.`, 'Use 2 (changes only), 4 (verify/audit) or RX (full replacement), as agreed with the carrier.');
    } else if (action === 'RX') {
      add('info', 'HDR-FULL-REPLACE', tx.bgn, 'BGN08 is RX: the carrier will treat this file as a full replacement and may terminate anyone not in it.', 'Make sure every covered member is included before sending a replacement file.');
    }
  }
  if (!tx.sponsor) add('error', 'HDR-SPONSOR', tx.bgn || tx.st, 'Sponsor (N1*P5, loop 1000A) is missing.', 'Add N1*P5 with the employer name and ID.');
  if (!tx.payer) add('error', 'HDR-PAYER', tx.bgn || tx.st, 'Payer (N1*IN, loop 1000B) is missing.', 'Add N1*IN with the carrier or administrator name and ID.');
  if (tx.members.length === 0) add('warning', 'HDR-NO-MEMBERS', tx.st, 'The transaction contains no members (no INS segments).', 'An empty file is valid only if the carrier expects one when there are no changes.');
}

// ─── Member (INS loop) ───────────────────────────────────────────────────────

function validateMember(m, label, ctx) {
  const { add, p, fileDate, currentSubscriber, seenSubscribers, today } = ctx;
  const ins = m.ins;
  const isSub = e(ins, 1);
  const rel = e(ins, 2);
  const mType = e(ins, 3);
  const sub = memberRef(m, '0F');

  if (isSub !== 'Y' && isSub !== 'N') add('error', 'INS01', ins, `${label}: INS01 is "${isSub}"; it must be Y (subscriber) or N (dependent).`, 'Set INS01 to Y for the employee and N for dependents.');
  if (!RELATIONSHIP[rel]) add('error', 'INS02', ins, `${label}: INS02 relationship code "${rel}" is not valid.`, 'Use 18 for the subscriber, 01 for a spouse, 19 for a child (see explain_834_code relationship).');
  if (isSub === 'Y' && rel !== '18') add('error', 'INS-SELF', ins, `${label}: subscriber (INS01=Y) must have relationship 18 (Self), found "${rel}".`, 'Set INS02 to 18 for subscribers.');
  if (isSub === 'N' && rel === '18') add('error', 'INS-SELF', ins, `${label}: dependent (INS01=N) cannot have relationship 18 (Self).`, 'Use the dependent\'s actual relationship code, e.g. 01 spouse or 19 child.');
  if (!MAINTENANCE_TYPE[mType]) add('error', 'INS03', ins, `${label}: INS03 maintenance type "${mType}" is not valid.`, `Use one of: ${Object.entries(MAINTENANCE_TYPE).map(([k, v]) => `${k} ${v}`).join(', ')}.`);
  const reason = e(ins, 4);
  if (reason && !MAINTENANCE_REASON[reason]) add('info', 'INS04', ins, `${label}: INS04 maintenance reason "${reason}" is not a common code.`, 'Confirm it is allowed by the carrier\'s companion guide.');
  if (!BENEFIT_STATUS[e(ins, 5)]) add('error', 'INS05', ins, `${label}: INS05 benefit status "${e(ins, 5)}" is not valid.`, 'Use A (active), C (COBRA), S (surviving insured) or T (TEFRA).');
  const emp = e(ins, 8);
  if (isSub === 'Y' && !emp) add('warning', 'INS08-MISSING', ins, `${label}: subscriber has no employment status (INS08).`, 'Most carriers require INS08 for subscribers, e.g. FT, PT, RT or TE.');
  if (emp && !EMPLOYMENT_STATUS[emp]) add('error', 'INS08', ins, `${label}: INS08 employment status "${emp}" is not valid.`, `Use one of: ${Object.keys(EMPLOYMENT_STATUS).join(', ')}.`);
  if (emp === 'TE' && mType !== '024' && e(ins, 5) !== 'C') {
    add('warning', 'INS-TERM-ACTIVE', ins, `${label}: employment status is Terminated (TE) but the member is not being terminated (INS03 "${mType}") or moved to COBRA.`, 'Send INS03=024 with a benefit end date, or INS05=C for COBRA continuation.');
  }

  // Subscriber ID
  if (!sub) {
    add('error', 'REF-0F', ins, `${label}: subscriber identifier (REF*0F) is missing.`, 'Every member, including dependents, must carry the subscriber\'s ID in REF*0F.');
  } else if (isSub === 'Y') {
    if (seenSubscribers.has(sub)) add('warning', 'DUP-SUBSCRIBER', ins, `${label}: the same subscriber ID appears in another subscriber record (segment ${seenSubscribers.get(sub)}).`, 'Send each subscriber once per transaction; carriers may reject or double-process duplicates.');
    else seenSubscribers.set(sub, ins.position);
  } else if (isSub === 'N' && sub !== currentSubscriber) {
    add('error', 'DEP-ORPHAN', ins, `${label}: dependent's REF*0F does not match the subscriber immediately before it.`, 'Place each dependent right after their subscriber and use the subscriber\'s ID in REF*0F.');
  }
  if (p.require_group_number && !memberRef(m, '1L') && !m.coverages.some(c => c.refs.some(r => e(r, 1) === '1L'))) {
    add('error', 'REF-1L', ins, `${label}: group or policy number (REF*1L) is missing, and this carrier profile requires it.`, 'Add REF*1L with the group/policy number from the carrier.');
  }

  // Name and demographics
  if (!m.nm1) {
    add('error', 'NM1-MISSING', ins, `${label}: member name (NM1*IL, loop 2100A) is missing.`, 'Add NM1*IL with last and first name.');
  } else {
    if (!e(m.nm1, 3)) add('error', 'NM1-LAST', m.nm1, `${label}: last name (NM103) is empty.`, 'Send the member\'s legal last name.');
    if (!e(m.nm1, 4)) add('warning', 'NM1-FIRST', m.nm1, `${label}: first name (NM104) is empty.`, 'Send the member\'s legal first name.');
    const q = e(m.nm1, 8), id = e(m.nm1, 9);
    if (q === '34') {
      const ssnProblem = checkSsn(id);
      if (ssnProblem) add('error', 'SSN-INVALID', m.nm1, `${label}: the SSN in NM109 ${ssnProblem}.`, 'Correct the SSN in the HR system. Never send placeholder SSNs; omit NM108/NM109 if the SSN is unknown and the carrier allows it.');
    } else if (q && !id) {
      add('error', 'NM1-ID', m.nm1, `${label}: NM108 qualifier "${q}" is sent without an ID in NM109.`, 'Send both NM108 and NM109, or neither.');
    }
    if (p.require_ssn && isSub === 'Y' && q !== '34') add('error', 'SSN-REQUIRED', m.nm1, `${label}: this carrier profile requires the subscriber's SSN (NM108=34).`, 'Send NM108=34 with the SSN in NM109.');
  }
  if (!m.dmg) {
    add('warning', 'DMG-MISSING', m.nm1 || ins, `${label}: demographics (DMG) are missing.`, 'Send DMG*D8*CCYYMMDD*gender; most carriers require birth date and gender.');
  } else {
    const dob = parseD8(e(m.dmg, 2));
    if (e(m.dmg, 1) !== 'D8' || !dob) add('error', 'DMG-DOB', m.dmg, `${label}: birth date is not a valid D8 (CCYYMMDD) date.`, 'Send DMG01=D8 and DMG02 as CCYYMMDD.');
    else if (dob > today) add('error', 'DMG-DOB-FUTURE', m.dmg, `${label}: birth date is in the future.`, 'Correct the birth date in the HR system.');
    else if (['19', '09', '10', '17'].includes(rel) && p.dependent_age_limit > 0) {
      const age = ageOn(dob, fileDate);
      if (age >= p.dependent_age_limit && e(ins, 3) !== '024') {
        add('warning', 'DEP-AGE', m.dmg, `${label}: child dependent is ${age} on the file date, at or over the age limit of ${p.dependent_age_limit}.`, 'Confirm a disabled-dependent extension applies, or terminate the dependent\'s coverage at the limit.');
      }
    }
    const g = e(m.dmg, 3);
    if (g && !GENDER[g]) add('error', 'DMG-GENDER', m.dmg, `${label}: gender code "${g}" is not valid.`, 'Use F, M or U.');
  }

  // Addresses (N3/N4 in 2100A residence, 2100C mailing and other name loops)
  validateAddresses(m, label, add);

  // Member-level dates
  for (const d of m.dtps) checkDtpFormat(d, label, add);

  if (m.coverages.length === 0 && mType !== '024') {
    add('warning', 'NO-COVERAGE', ins, `${label}: member has no coverage (HD) segments.`, 'Send at least one HD loop with the plan, unless the carrier accepts demographic-only changes.');
  }
  for (const c of m.coverages) validateCoverage(c, m, label, ctx);
}

// ─── Coverage (HD loop) ──────────────────────────────────────────────────────

function validateCoverage(c, m, label, { add, p, fileDate }) {
  const hd = c.hd;
  const type = e(hd, 1);
  const line = e(hd, 3);
  const level = e(hd, 5);
  const where = `${label}, ${INSURANCE_LINE[line] || line || 'coverage'}`;

  if (!MAINTENANCE_TYPE[type]) add('error', 'HD01', hd, `${where}: HD01 maintenance type "${type}" is not valid.`, `Use one of: ${Object.keys(MAINTENANCE_TYPE).join(', ')}.`);
  if (!line) add('error', 'HD03-MISSING', hd, `${where}: insurance line code (HD03) is empty.`, 'Send the line of coverage, e.g. HLT, DEN or VIS.');
  else if (!INSURANCE_LINE[line]) add('warning', 'HD03', hd, `${where}: HD03 "${line}" is not a standard insurance line code.`, 'Check the carrier\'s companion guide.');
  else if (p.allowed_insurance_lines && !p.allowed_insurance_lines.includes(line)) add('error', 'HD03-PROFILE', hd, `${where}: this carrier profile does not accept insurance line "${line}".`, `Allowed: ${p.allowed_insurance_lines.join(', ')}.`);
  if (level) {
    if (!COVERAGE_LEVEL[level]) add('error', 'HD05', hd, `${where}: HD05 coverage level "${level}" is not valid.`, 'Use e.g. EMP, ESP, ECH or FAM (see explain_834_code coverage_level).');
    else if (p.allowed_coverage_levels && !p.allowed_coverage_levels.includes(level)) add('error', 'HD05-PROFILE', hd, `${where}: this carrier profile does not accept coverage level "${level}".`, `Allowed: ${p.allowed_coverage_levels.join(', ')}.`);
  }
  if (e(m.ins, 1) === 'Y' && type !== '024' && !level) add('warning', 'HD05-MISSING', hd, `${where}: subscriber coverage has no coverage level (HD05).`, 'Send the tier the employee elected, e.g. EMP or FAM.');

  for (const d of c.dtps) checkDtpFormat(d, where, add);
  const begin = findDtp(c.dtps, '348');
  const end = findDtp(c.dtps, '349');
  if (!begin) {
    add('error', 'DTP-348', hd, `${where}: benefit begin date (DTP*348) is missing.`, 'Every HD loop needs DTP*348*D8*CCYYMMDD.');
  } else {
    const b = dtpDates(begin).start;
    if (b && fileDate) {
      const days = Math.round((b - fileDate) / 86400000);
      if (days < -p.max_retro_days) add('warning', 'RETRO', begin, `${where}: coverage begins ${-days} days before the file date (${formatDate(b)}).`, `Many carriers limit retroactive enrollment (this profile: ${p.max_retro_days} days). Confirm the carrier will accept it, or arrange a manual retro change.`);
      if (days > p.max_future_days) add('warning', 'FUTURE', begin, `${where}: coverage begins ${days} days after the file date (${formatDate(b)}).`, 'Check the date; a future year is a common typo.');
    }
  }
  if (type === '024' && !end) add('error', 'TERM-NO-END', hd, `${where}: termination (HD01=024) without a benefit end date (DTP*349).`, 'Send DTP*349 with the last day of coverage; without it the carrier cannot terminate correctly.');
  if (begin && end) {
    const b = dtpDates(begin).start, en = dtpDates(end).start;
    if (b && en && en < b) add('error', 'END-BEFORE-BEGIN', end, `${where}: benefit end date ${formatDate(en)} is before the begin date ${formatDate(b)}.`, 'Correct the dates; for a coverage that never took effect, carriers usually expect end = begin.');
  }
  if (end && type !== '024' && e(m.ins, 3) !== '024') {
    add('info', 'END-ON-ACTIVE', end, `${where}: coverage has an end date but is not marked as a termination (HD01 "${type}").`, 'Confirm whether this is a planned end (e.g. plan year end) or should be sent as HD01=024.');
  }
}

// ─── Family-level checks ─────────────────────────────────────────────────────

function validateFamilies(families, tx, add) {
  // Index dependents by subscriber ID once, so large files stay linear.
  const depsBySub = new Map();
  for (const m of tx.members) {
    if (e(m.ins, 1) !== 'N') continue;
    const sub = memberRef(m, '0F');
    if (!depsBySub.has(sub)) depsBySub.set(sub, []);
    depsBySub.get(sub).push(m);
  }
  for (const [sub, fam] of families) {
    const deps = depsBySub.get(sub) || [];
    if (!deps.length) continue;
    for (const c of fam.subscriber.coverages) {
      const level = e(c.hd, 5), line = e(c.hd, 3);
      if (!SINGLE_COVERAGE.has(level) || e(c.hd, 1) === '024') continue;
      const depsOnLine = deps.filter(m => m.coverages.some(dc => e(dc.hd, 3) === line && e(dc.hd, 1) !== '024'));
      if (depsOnLine.length) {
        add('warning', 'TIER-MISMATCH', c.hd, `${fam.label}: ${INSURANCE_LINE[line] || line} is "${level}" (employee only) but ${depsOnLine.length} dependent(s) are enrolled on the same line.`, 'Either the coverage level is wrong (e.g. should be ESP/ECH/FAM) or the dependents should not be enrolled. Premiums and claims will not match.');
      }
    }
  }
}

// ─── Segment-level checks (all segments) ─────────────────────────────────────

function validateSegments(model, add) {
  for (const seg of model.segments) {
    if (!KNOWN_SEGMENTS.has(seg.id)) {
      add('error', 'SEG-UNKNOWN', seg, `Segment "${seg.id}" is not part of an 834 (005010X220A1).`, 'Remove it or correct the segment ID; carriers reject files with segments that do not belong to the transaction set.');
      continue;
    }
    const limits = ELEMENT_MAX[seg.id];
    if (!limits) continue;
    for (const [n, [name, max]] of Object.entries(limits)) {
      const len = e(seg, Number(n)).length;
      if (len > max) add('error', 'ELEM-LENGTH', seg, `${name} is ${len} characters; the maximum is ${max}.`, 'Shorten the value at the source (or truncate it in the integration). Carriers reject elements longer than the implementation guide allows.');
    }
  }
}

// ─── Addresses (N3/N4) ───────────────────────────────────────────────────────
// Values are never echoed: addresses are PII.

const ADDRESS_LOOPS = { IL: 'residence address (2100A)', '31': 'mailing address (2100C)' };

function validateAddresses(m, label, add) {
  let context = m.nm1 ? 'IL' : null;
  let n3 = null;
  const check = (n4) => {
    const where = `${label}, ${ADDRESS_LOOPS[context] || 'address'}`;
    if (n3 && !e(n3, 1)) add('error', 'ADDR-STREET', n3, `${where}: street address (N301) is empty.`, 'Send the first address line, or omit N3/N4 if the carrier does not need an address.');
    if (n4 && !n3) add('error', 'ADDR-N3-MISSING', n4, `${where}: city/state/ZIP (N4) is sent without a street address (N3).`, 'Send N3 before N4 in the same loop.');
    if (n3 && !n4) { add('error', 'ADDR-N4-MISSING', n3, `${where}: street address (N3) is sent without city/state/ZIP (N4).`, 'Send N4 right after N3.'); return; }
    if (!n4) return;
    if (!e(n4, 1)) add('error', 'ADDR-CITY', n4, `${where}: city (N401) is empty.`, 'Send the city name.');
    const country = e(n4, 4);
    if (country && country !== 'US') return;
    if (!US_STATES.has(e(n4, 2))) add('error', 'ADDR-STATE', n4, `${where}: state (N402) is missing or not a valid US state code.`, 'Use the 2-letter USPS code (e.g. IL). For a foreign address, send the country in N404.');
    if (!/^\d{5}(\d{4})?$/.test(e(n4, 3))) add('error', 'ADDR-ZIP', n4, `${where}: ZIP code (N403) is missing or not 5 or 9 digits.`, 'Send 5 or 9 digits with no dash or spaces (e.g. 60601 or 606011234).');
  };
  for (const seg of m.other) {
    if (seg.id === 'NM1') { if (n3) check(null); n3 = null; context = e(seg, 1); }
    else if (seg.id === 'N3') { if (n3) check(null); n3 = seg; }
    else if (seg.id === 'N4') { check(seg); n3 = null; }
  }
  if (n3) check(null);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function checkDtpFormat(d, where, add) {
  const fmt = e(d, 2);
  const { start, end, raw } = dtpDates(d);
  if (fmt !== 'D8' && fmt !== 'RD8') add('error', 'DTP-FORMAT', d, `${where}: DTP*${e(d, 1)} uses format "${fmt}"; only D8 or RD8 are allowed.`, 'Use D8 with CCYYMMDD.');
  else if (!start || (fmt === 'RD8' && !end)) add('error', 'DTP-DATE', d, `${where}: DTP*${e(d, 1)} value "${raw}" is not a valid date.`, 'Use CCYYMMDD (RD8: CCYYMMDD-CCYYMMDD) with a real calendar date.');
}

// SSN structure rules published by the Social Security Administration:
// area 000, 666 and 900–999, group 00 and serial 0000 are never issued.
export function checkSsn(id) {
  if (!/^\d{9}$/.test(id)) return 'is not 9 digits';
  const area = id.slice(0, 3), group = id.slice(3, 5), serial = id.slice(5);
  if (area === '000' || area === '666' || area[0] === '9') return 'has an area number (first 3 digits) that is never issued';
  if (group === '00') return 'has group digits 00, which are never issued';
  if (serial === '0000') return 'has serial digits 0000, which are never issued';
  if (/^(\d)\1{8}$/.test(id) || id === '123456789') return 'looks like a placeholder';
  return null;
}

function ageOn(dob, on) {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const m = on.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}
