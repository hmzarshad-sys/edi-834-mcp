// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Parser for X12 834 files. Detects delimiters from the ISA header, splits
// segments (keeping their 1-based position for error messages), and builds a
// simple model: envelopes, header segments and one record per member (INS
// loop) with its coverages (HD loops).

export class ParseError extends Error {
  constructor(message, suggestion) {
    super(message);
    this.code = 'PARSE_ERROR';
    this.suggestion = suggestion;
  }
}

export function detectDelimiters(raw) {
  const text = raw.replace(/^﻿/, '').replace(/^\s+/, '');
  if (!text.startsWith('ISA')) {
    throw new ParseError(
      'The file does not start with an ISA segment, so it is not a raw X12 file.',
      'Make sure this is the unencrypted 834 text file (not a PGP/zip delivery file, an Excel export or a carrier report).',
    );
  }
  if (text.length < 106) {
    throw new ParseError('The ISA segment is shorter than the required 106 characters.', 'The file is truncated or the ISA header was edited by hand.');
  }
  const element = text[3];
  const component = text[104];
  let segment = text[105];
  // Some systems put a line break directly after the terminator; if position
  // 105 is itself a line break, the terminator is the newline.
  if (segment === '\r' && text[106] === '\n') segment = '\r\n';
  const isaFields = text.slice(0, 105).split(element);
  return { element, component, segment, repetition: isaFields[11] || '^', text };
}

export function parseSegments(raw) {
  const d = detectDelimiters(raw);
  const pieces = d.text.split(d.segment);
  const segments = [];
  let position = 0;
  for (let piece of pieces) {
    piece = piece.replace(/^[\r\n]+/, '').replace(/[\r\n]+$/, '');
    if (!piece.trim()) continue;
    position++;
    const elements = piece.split(d.element);
    segments.push({ id: elements[0].trim(), elements, position });
  }
  return { delimiters: d, segments };
}

// Element accessor: e(seg, 1) is the first data element (INS01, HD01...).
export function e(seg, n) {
  if (!seg) return '';
  return (seg.elements[n] ?? '').trim();
}

// Build the 834 model.
export function parse834(raw) {
  const { delimiters, segments } = parseSegments(raw);
  const model = {
    delimiters: { element: delimiters.element, component: delimiters.component, segment: delimiters.segment === '\r\n' ? 'CRLF' : delimiters.segment },
    segments,
    isa: null, iea: null, groups: [], transactions: [],
  };

  let group = null;
  let tx = null;
  let member = null;
  let coverage = null;
  let inMemberName = false;

  const closeMember = () => { if (member) { tx.members.push(member); member = null; coverage = null; } };

  for (const seg of segments) {
    switch (seg.id) {
      case 'ISA': model.isa = seg; break;
      case 'IEA': model.iea = seg; break;
      case 'GS':
        group = { gs: seg, ge: null, transactions: [] };
        model.groups.push(group);
        break;
      case 'GE':
        if (group) group.ge = seg;
        break;
      case 'ST':
        tx = { st: seg, se: null, bgn: null, header: [], sponsor: null, payer: null, members: [], segmentCount: 0, group };
        model.transactions.push(tx);
        if (group) group.transactions.push(tx);
        break;
      case 'SE':
        if (tx) {
          closeMember();
          tx.se = seg;
          tx.segmentCount = seg.position - tx.st.position + 1;
          tx = null;
        }
        break;
      default:
        if (!tx) break;
        if (seg.id === 'INS') {
          closeMember();
          member = { ins: seg, refs: [], dtps: [], nm1: null, dmg: null, other: [], coverages: [], position: seg.position };
          inMemberName = false;
          break;
        }
        if (!member) {
          if (seg.id === 'BGN') tx.bgn = seg;
          else if (seg.id === 'N1' && e(seg, 1) === 'P5') tx.sponsor = seg;
          else if (seg.id === 'N1' && e(seg, 1) === 'IN') tx.payer = seg;
          tx.header.push(seg);
          break;
        }
        if (seg.id === 'HD') {
          coverage = { hd: seg, dtps: [], refs: [], other: [], position: seg.position };
          member.coverages.push(coverage);
          break;
        }
        if (coverage) {
          if (seg.id === 'DTP') coverage.dtps.push(seg);
          else if (seg.id === 'REF') coverage.refs.push(seg);
          else coverage.other.push(seg);
          break;
        }
        if (seg.id === 'NM1') {
          // The first NM1 in the member loop is the member name (2100A, NM101=IL).
          if (!member.nm1 && e(seg, 1) === 'IL') { member.nm1 = seg; inMemberName = true; }
          else { member.other.push(seg); inMemberName = false; }
        } else if (seg.id === 'DMG' && inMemberName && !member.dmg) member.dmg = seg;
        else if (seg.id === 'REF' && !member.nm1) member.refs.push(seg);
        else if (seg.id === 'DTP' && !member.nm1) member.dtps.push(seg);
        else member.other.push(seg);
    }
  }
  if (tx) closeMember();
  return model;
}

// Convenience lookups on a member.
export function memberRef(member, qualifier) {
  const r = member.refs.find(s => e(s, 1) === qualifier);
  return r ? e(r, 2) : '';
}

export function findDtp(list, qualifier) {
  return list.find(s => e(s, 1) === qualifier) || null;
}

// Parse a D8 (CCYYMMDD) value. Returns a Date at UTC midnight or null.
export function parseD8(v) {
  if (!/^\d{8}$/.test(v)) return null;
  const y = +v.slice(0, 4), m = +v.slice(4, 6), d = +v.slice(6, 8);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt;
}

// Value of a DTP segment as a single date (D8) or the start/end of a range (RD8).
export function dtpDates(seg) {
  const fmt = e(seg, 2);
  const val = e(seg, 3);
  if (fmt === 'D8') return { start: parseD8(val), end: parseD8(val), raw: val, fmt };
  if (fmt === 'RD8') {
    const [a, b] = val.split('-');
    return { start: parseD8(a || ''), end: parseD8(b || ''), raw: val, fmt };
  }
  return { start: null, end: null, raw: val, fmt };
}

export function formatDate(dt) {
  return dt ? dt.toISOString().slice(0, 10) : '';
}
