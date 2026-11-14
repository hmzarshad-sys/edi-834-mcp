// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// File-level tools that work on the raw 834 text:
//   describe834  every segment with its loop, name, and named elements (with code meanings)
//   format834    one segment per line
//   autoFix834   corrects mechanical envelope errors (counts and control numbers)
//   toJson834    the file as nested JSON (interchange > groups > transactions > members)
//
// Pure functions: raw text in, plain objects out. No PII is added or removed;
// callers decide what to show.

import { parseSegments, e } from './parser.mjs';
import {
  RELATIONSHIP, MAINTENANCE_TYPE, MAINTENANCE_REASON, BENEFIT_STATUS, EMPLOYMENT_STATUS,
  INSURANCE_LINE, COVERAGE_LEVEL, DATE_QUALIFIER, BGN_PURPOSE, BGN_ACTION, GENDER, ID_QUALIFIER,
} from './codes.mjs';

// Segment names and element names for the segments an 834 uses.
export const SEGMENTS = {
  ISA: ['Interchange control header', ['Authorization qualifier', 'Authorization information', 'Security qualifier', 'Security information', 'Sender ID qualifier', 'Sender ID', 'Receiver ID qualifier', 'Receiver ID', 'Interchange date', 'Interchange time', 'Repetition separator', 'Version', 'Control number', 'Acknowledgment requested', 'Usage (P production, T test)', 'Component separator']],
  GS: ['Functional group header', ['Functional ID (BE)', 'Sender code', 'Receiver code', 'Date', 'Time', 'Group control number', 'Agency', 'Version']],
  ST: ['Transaction set header', ['Transaction set (834)', 'Control number', 'Implementation guide']],
  BGN: ['Beginning segment', ['Purpose', 'Reference', 'Date', 'Time', 'Time zone', 'Original reference', 'Transaction type', 'Action']],
  REF: ['Reference', ['Qualifier', 'Reference ID']],
  DTP: ['Date', ['Date qualifier', 'Format (D8 or RD8)', 'Date']],
  QTY: ['Transaction set control totals', ['Quantity qualifier', 'Quantity']],
  N1: ['Name', ['Entity code', 'Name', 'ID qualifier', 'ID']],
  ACT: ['Account information', ['Account number']],
  INS: ['Member level detail', ['Subscriber (Y/N)', 'Relationship', 'Maintenance type', 'Maintenance reason', 'Benefit status', 'Medicare status', 'COBRA event', 'Employment status', 'Student status', 'Handicap', 'Date format', 'Death date']],
  NM1: ['Name', ['Entity code', 'Entity type', 'Last or organization name', 'First name', 'Middle name', 'Prefix', 'Suffix', 'ID qualifier', 'ID']],
  PER: ['Communication numbers', ['Contact function', 'Name', 'Number qualifier', 'Number', 'Number qualifier', 'Number', 'Number qualifier', 'Number']],
  N3: ['Street address', ['Address line 1', 'Address line 2']],
  N4: ['City, state, ZIP', ['City', 'State', 'Postal code', 'Country', 'Location qualifier', 'Location ID']],
  DMG: ['Demographics', ['Date format', 'Birth date', 'Gender', 'Marital status', 'Race or ethnicity', 'Citizenship']],
  EC: ['Employment class', ['Class code', 'Class code', 'Class code']],
  ICM: ['Member income', ['Frequency', 'Wage amount', 'Work hours', 'Location', 'Salary grade']],
  AMT: ['Amount', ['Qualifier', 'Amount']],
  HLH: ['Health information', ['Health code', 'Height', 'Weight']],
  LUI: ['Language', ['Qualifier', 'Language code', 'Description', 'Use']],
  DSB: ['Disability', ['Disability type', 'Quantity', 'Occupation', 'Work intensity', 'Product option', 'Monetary amount', 'Code list qualifier', 'Diagnosis code']],
  HD: ['Health coverage', ['Maintenance type', 'Maintenance reason', 'Insurance line', 'Plan description', 'Coverage level']],
  IDC: ['Identification card', ['Plan coverage', 'Card type', 'Quantity', 'Action']],
  LX: ['Loop counter', ['Number']],
  PLA: ['Place or location', ['Action', 'Entity code', 'Date', 'Time', 'Reason']],
  PRV: ['Provider information', ['Provider code', 'Qualifier', 'Provider ID']],
  COB: ['Coordination of benefits', ['Payer responsibility', 'Policy number', 'Coverage', 'Service type']],
  LS: ['Additional reporting categories (start)', ['Loop ID']],
  LE: ['Additional reporting categories (end)', ['Loop ID']],
  SE: ['Transaction set trailer', ['Segment count', 'Control number']],
  GE: ['Functional group trailer', ['Transaction count', 'Group control number']],
  IEA: ['Interchange control trailer', ['Group count', 'Control number']],
};

// Elements whose codes have a meaning we can show.
const CODED = {
  'INS-2': RELATIONSHIP, 'INS-3': MAINTENANCE_TYPE, 'INS-4': MAINTENANCE_REASON, 'INS-5': BENEFIT_STATUS, 'INS-8': EMPLOYMENT_STATUS,
  'HD-1': MAINTENANCE_TYPE, 'HD-2': MAINTENANCE_REASON, 'HD-3': INSURANCE_LINE, 'HD-5': COVERAGE_LEVEL,
  'DTP-1': DATE_QUALIFIER, 'BGN-1': BGN_PURPOSE, 'BGN-8': BGN_ACTION, 'DMG-3': GENDER, 'NM1-8': ID_QUALIFIER,
  'N1-1': { P5: 'Plan sponsor', IN: 'Insurer (payer)', TV: 'Third party administrator', BO: 'Broker or sales office', '75': 'Participant (reporting category)' },
  'NM1-1': { IL: 'Insured or subscriber', '74': 'Corrected insured', '70': 'Prior incorrect insured', '31': 'Postal mailing address', '36': 'Employer', M8: 'Educational institution', S3: 'Custodial parent', QD: 'Responsible party', E1: 'Person or other entity legally responsible', EI: 'Executor of estate', EXS: 'Ex-spouse', GD: 'Guardian', J6: 'Power of attorney', LR: 'Legal representative', Y2: 'Managed care organization', P3: 'Primary care provider' },
  'REF-1': { '0F': 'Subscriber number', '1L': 'Group or policy number', '17': 'Client reporting category', '23': 'Client number', '3H': 'Case number', '38': 'Master policy number', '4A': 'Personal ID number', '6O': 'Cross reference number', ABB: 'Personal ID number', DX: 'Department or agency number', F6: 'Health insurance claim (HIC) number', Q4: 'Prior ID number', QQ: 'Unit number', ZZ: 'Mutually defined', '9V': 'Payment category', '9X': 'Account category', X9: 'Internal control number', CE: 'Class of contract code', ZX: 'County code', DV: 'Diagnosis-related group' },
  'ISA-15': { P: 'Production', T: 'Test' },
};

// Loop names used in labels.
export const LOOPS = {
  ENV: 'Envelope', HDR: 'Heading', '1000A': 'Sponsor', '1000B': 'Payer', '1000C': 'TPA or broker', '1100C': 'TPA or broker account',
  '2000': 'Member', '2100A': 'Member name', '2100B': 'Incorrect member name', '2100C': 'Mailing address', '2100D': 'Employer',
  '2100E': 'School', '2100F': 'Custodial parent', '2100G': 'Responsible person', '2100H': 'Drop-off location',
  '2200': 'Disability', '2300': 'Health coverage', '2310': 'Provider', '2320': 'Coordination of benefits', '2330': 'COB related entity',
  '2700': 'Reporting categories', '2750': 'Reporting category',
};
const NAME_LOOPS = { IL: '2100A', '74': '2100A', '70': '2100B', '31': '2100C', '36': '2100D', M8: '2100E', S3: '2100F', QD: '2100G', E1: '2100G', EI: '2100G', EXS: '2100G', GD: '2100G', J6: '2100G', LR: '2100G', '45': '2100H' };

// Every segment with its loop, name and named elements.
export function describe834(raw) {
  const { delimiters, segments } = parseSegments(raw);
  let loop = 'ENV';
  const out = [];
  for (const seg of segments) {
    const id = seg.id;
    if (['ISA', 'GS', 'GE', 'IEA'].includes(id)) loop = 'ENV';
    else if (id === 'ST' || id === 'SE') loop = id === 'ST' ? 'HDR' : 'ENV';
    else if (id === 'BGN') loop = 'HDR';
    else if (id === 'N1' && loop !== '2750') loop = { P5: '1000A', IN: '1000B' }[e(seg, 1)] || (['HDR', '1000A', '1000B', '1000C', '1100C'].includes(loop) ? '1000C' : loop);
    else if (id === 'ACT') loop = '1100C';
    else if (id === 'INS') loop = '2000';
    else if (id === 'NM1') {
      const q = e(seg, 1);
      if (['2300', '2310'].includes(loop)) loop = '2310';
      else if (['2320', '2330'].includes(loop)) loop = '2330';
      else loop = NAME_LOOPS[q] || '2100G';
    } else if (id === 'DSB') loop = '2200';
    else if (id === 'HD') loop = '2300';
    else if (id === 'LX' && (loop === '2300' || loop === '2310')) loop = '2310';
    else if (id === 'COB') loop = '2320';
    else if (id === 'LS') loop = '2700';
    else if (id === 'LX' && (loop === '2700' || loop === '2750')) loop = '2750';
    else if (id === 'LE') loop = '2700';

    const [name, elementNames = []] = SEGMENTS[id] || ['Unknown segment', []];
    const elements = seg.elements.slice(1).map((value, i) => {
      const n = i + 1;
      const table = CODED[`${id}-${n}`];
      const v = value.trim();
      return {
        ref: `${id}${String(n).padStart(2, '0')}`,
        name: elementNames[i] || `Element ${n}`,
        value,
        meaning: table && v ? table[v] || null : null,
      };
    });
    out.push({ position: seg.position, id, loop, loop_name: LOOPS[loop] || loop, name, elements, text: seg.elements.join(delimiters.element) });
  }
  return { delimiters: { element: delimiters.element, component: delimiters.component, segment: delimiters.segment }, segments: out };
}

// One segment per line, keeping the file's own delimiters.
export function format834(raw) {
  const { delimiters, segments } = parseSegments(raw);
  const term = delimiters.segment === '\r\n' || delimiters.segment === '\n' ? '' : delimiters.segment;
  return segments.map(s => s.elements.join(delimiters.element) + term).join('\n') + '\n';
}

// Fix the envelope's counts and control numbers. These are mechanical errors
// (usually from editing or merging a file by hand); nothing about a member changes.
export function autoFix834(raw) {
  const { delimiters, segments } = parseSegments(raw);
  const segs = segments.map(s => ({ ...s, elements: [...s.elements] }));
  const fixes = [];
  const set = (seg, n, value, rule, what) => {
    const old = (seg.elements[n] ?? '').trim();
    if (old === String(value)) return;
    while (seg.elements.length <= n) seg.elements.push('');
    seg.elements[n] = String(value);
    fixes.push({ rule, segment: { position: seg.position, id: seg.id }, change: `${what}: "${old}" → "${value}"` });
  };

  let isa = null, gs = null, st = null, groups = 0, txInGroup = 0;
  for (const seg of segs) {
    switch (seg.id) {
      case 'ISA': isa = seg; groups = 0; break;
      case 'GS': gs = seg; groups++; txInGroup = 0; break;
      case 'ST': st = seg; txInGroup++; break;
      case 'SE':
        if (st) {
          set(seg, 1, seg.position - st.position + 1, 'ENV-SEGMENT-COUNT', 'SE01 segment count');
          set(seg, 2, e(st, 2), 'ENV-CONTROL-ST', 'SE02 control number');
          st = null;
        }
        break;
      case 'GE':
        if (gs) {
          set(seg, 1, txInGroup, 'ENV-COUNT-ST', 'GE01 transaction count');
          set(seg, 2, e(gs, 6), 'ENV-CONTROL-GS', 'GE02 control number');
          gs = null;
        }
        break;
      case 'IEA':
        if (isa) {
          set(seg, 1, groups, 'ENV-COUNT-GS', 'IEA01 group count');
          set(seg, 2, (isa.elements[13] ?? '').trim(), 'ENV-CONTROL-ISA', 'IEA02 control number');
        }
        break;
    }
  }
  if (!fixes.length) return { text: raw, fixes };
  // Keep the original layout: one segment per line if the file had line breaks.
  const multiline = /[\r\n]/.test(delimiters.text.slice(0, 400).replace(/\r?\n$/, ''));
  const term = delimiters.segment === '\r\n' || delimiters.segment === '\n' ? '' : delimiters.segment;
  const text = segs.map(s => s.elements.join(delimiters.element) + term).join(multiline || !term ? '\n' : '') + (multiline || !term ? '\n' : '');
  return { text, fixes };
}

// The file as nested JSON. Element values are kept as sent.
export function toJson834(raw) {
  const { segments } = describe834(raw);
  const obj = (s) => ({ segment: s.id, loop: s.loop, ...Object.fromEntries(s.elements.filter(x => x.value !== '').map(x => [x.ref, x.meaning ? { value: x.value, meaning: x.meaning } : x.value])) });
  const out = { interchange: null, groups: [] };
  let group = null, tx = null, member = null, coverage = null;
  for (const s of segments) {
    if (s.id === 'ISA') out.interchange = obj(s);
    else if (s.id === 'IEA') out.interchange_trailer = obj(s);
    else if (s.id === 'GS') { group = { header: obj(s), transactions: [] }; out.groups.push(group); }
    else if (s.id === 'GE') { if (group) group.trailer = obj(s); }
    else if (s.id === 'ST') { tx = { header: [obj(s)], members: [] }; group?.transactions.push(tx); member = null; coverage = null; }
    else if (s.id === 'SE') { if (tx) tx.trailer = obj(s); tx = null; }
    else if (!tx) continue;
    else if (s.id === 'INS') { member = { segments: [obj(s)], coverages: [] }; tx.members.push(member); coverage = null; }
    else if (!member) tx.header.push(obj(s));
    else if (s.id === 'HD') { coverage = { segments: [obj(s)] }; member.coverages.push(coverage); }
    else if (coverage && ['2300', '2310', '2320', '2330'].includes(s.loop)) coverage.segments.push(obj(s));
    else { coverage = null; member.segments.push(obj(s)); }
  }
  return out;
}

// Rules whose findings autoFix834 can correct.
export const AUTO_FIXABLE = new Set(['ENV-SEGMENT-COUNT', 'ENV-CONTROL-ST', 'ENV-COUNT-ST', 'ENV-CONTROL-GS', 'ENV-COUNT-GS', 'ENV-CONTROL-ISA']);
