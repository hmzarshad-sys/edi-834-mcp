// Synthetic 834 builder for tests. All people and numbers are fictional; the
// SSNs use area 123 with group/serial values chosen only to be well-formed.

const pad = (v, n) => String(v).padEnd(n, ' ').slice(0, n);

export function isa({ control = '000000001', usage = 'P' } = {}) {
  return [
    'ISA', '00', pad('', 10), '00', pad('', 10), 'ZZ', pad('EMPLOYERID', 15), 'ZZ', pad('CARRIERID', 15),
    '260105', '1200', '^', '00501', control, '0', usage, ':',
  ].join('*');
}

export const SUBSCRIBER = (o = {}) => ({
  ins: o.ins ?? ['Y', '18', '021', '28', 'A', '', '', 'FT'],
  sub: 'sub' in o ? o.sub : 'EMP1001',
  name: o.name ?? ['Doe', 'Jane'],
  ssn: 'ssn' in o ? o.ssn : '123451234',
  dob: 'dob' in o ? o.dob : '19850214',
  gender: o.gender ?? 'F',
  coverages: o.coverages ?? [{ hd: ['021', '', 'HLT', 'PPO-GOLD', 'FAM'], begin: '20260101' }],
  extraRefs: o.extraRefs ?? [],
  address: o.address ?? null,
});

export const DEPENDENT = (o = {}) => ({
  ins: o.ins ?? ['N', o.rel ?? '19', '021', '28', 'A'],
  sub: 'sub' in o ? o.sub : 'EMP1001',
  name: o.name ?? ['Doe', 'Sam'],
  ssn: o.ssn ?? null,
  dob: 'dob' in o ? o.dob : '20150610',
  gender: o.gender ?? 'M',
  coverages: o.coverages ?? [{ hd: ['021', '', 'HLT', 'PPO-GOLD'], begin: '20260101' }],
  extraRefs: o.extraRefs ?? [],
  address: o.address ?? null,
});

function memberSegments(m) {
  const s = [];
  s.push(['INS', ...m.ins].join('*'));
  if (m.sub !== null) s.push(`REF*0F*${m.sub}`);
  for (const r of m.extraRefs) s.push(r);
  s.push(m.ssn ? `NM1*IL*1*${m.name[0]}*${m.name[1]}****34*${m.ssn}` : `NM1*IL*1*${m.name[0]}*${m.name[1]}`);
  if (m.address) s.push(...m.address);
  if (m.dob !== null) s.push(`DMG*D8*${m.dob}*${m.gender}`);
  for (const c of m.coverages) {
    s.push(['HD', ...c.hd].join('*'));
    if (c.begin) s.push(`DTP*348*D8*${c.begin}`);
    if (c.end) s.push(`DTP*349*D8*${c.end}`);
  }
  return s;
}

// Build a complete file. Options let tests break specific parts.
export function build834({
  members = [SUBSCRIBER(), DEPENDENT()],
  bgnDate = '20260105',
  action = '2',
  gs01 = 'BE',
  version = '005010X220A1',
  seCountDelta = 0,
  stControl = '0001',
  seControl = null,
  omit = [],
  terminator = '~\n',
  usage = 'P',
} = {}) {
  const body = [
    `ST*834*${stControl}*${version}`,
    `BGN*00*REF${bgnDate}*${bgnDate}*1200****${action}`,
    'N1*P5*Example Employer Inc*FI*123456789',
    'N1*IN*Example Health Plan*FI*987654321',
    ...members.flatMap(memberSegments),
  ].filter(s => !omit.some(o => s.startsWith(o)));
  const seCount = body.length + 1 + seCountDelta;
  body.push(`SE*${seCount}*${seControl ?? stControl}`);
  const segs = [
    isa({ usage }),
    `GS*${gs01}*EMPLOYERID*CARRIERID*${bgnDate}*1200*1*X*${version}`,
    ...body,
    'GE*1*1',
    'IEA*1*000000001',
  ];
  return segs.join(terminator) + terminator;
}
