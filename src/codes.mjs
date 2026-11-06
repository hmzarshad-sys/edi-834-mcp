// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Code lists for the ASC X12 005010X220A1 Benefit Enrollment and Maintenance
// (834) transaction. These are the codes most employers, carriers and
// administrators exchange. A carrier's companion guide may restrict them
// further; see companion profiles in the README.

export const IMPLEMENTATION_GUIDE = '005010X220A1';

export const BGN_PURPOSE = {
  '00': 'Original',
  '15': 'Re-submission',
  '22': 'Information Copy',
};

export const BGN_ACTION = {
  '2': 'Change (Update) — only changed members are sent',
  '4': 'Verify — a full audit/reconciliation file',
  'RX': 'Replace — a full file that replaces everything the carrier has',
};

export const RELATIONSHIP = {
  '01': 'Spouse', '03': 'Father or Mother', '04': 'Grandfather or Grandmother',
  '05': 'Grandson or Granddaughter', '06': 'Uncle or Aunt', '07': 'Nephew or Niece',
  '08': 'Cousin', '09': 'Adopted Child', '10': 'Foster Child',
  '11': 'Son-in-law or Daughter-in-law', '12': 'Brother-in-law or Sister-in-law',
  '13': 'Mother-in-law or Father-in-law', '14': 'Brother or Sister', '15': 'Ward',
  '16': 'Stepparent', '17': 'Stepson or Stepdaughter', '18': 'Self', '19': 'Child',
  '23': 'Sponsored Dependent', '24': 'Dependent of a Minor Dependent', '25': 'Ex-spouse',
  '26': 'Guardian', '31': 'Court Appointed Guardian', '38': 'Collateral Dependent',
  '53': 'Life Partner', '60': 'Annuitant', 'D2': 'Trustee',
  'G8': 'Other Relationship', 'G9': 'Other Relative',
};

export const MAINTENANCE_TYPE = {
  '001': 'Change',
  '021': 'Addition',
  '024': 'Cancellation or Termination',
  '025': 'Reinstatement',
  '030': 'Audit or Compare',
};

// Common INS04 / HD02 maintenance reason codes. Unknown codes are reported as
// information, not errors, because companion guides add their own.
export const MAINTENANCE_REASON = {
  '01': 'Divorce', '02': 'Birth', '03': 'Death', '04': 'Retirement', '05': 'Adoption',
  '06': 'Strike', '07': 'Termination of Benefits', '08': 'Termination of Employment',
  '09': 'COBRA', '10': 'COBRA Premium Paid', '11': 'Surviving Spouse',
  '14': 'Voluntary Withdrawal', '15': 'Primary Care Provider (PCP) Change', '16': 'Quit',
  '17': 'Fired', '18': 'Suspended', '20': 'Active', '21': 'Disability', '22': 'Plan Change',
  '25': 'Change in Identifying Data Elements', '26': 'Declined Coverage',
  '27': 'Pre-Enrollment', '28': 'Initial Enrollment', '29': 'Benefit Selection',
  '31': 'Legal Separation', '32': 'Marriage', '33': 'Personnel Data',
  '37': 'Leave of Absence with Benefits', '38': 'Leave of Absence without Benefits',
  '39': 'Lay Off with Benefits', '40': 'Lay Off without Benefits', '41': 'Re-enrollment',
  '43': 'Change of Location', '59': 'Non Payment', 'AI': 'No Reason Given',
  'XN': 'Notification Only', 'XT': 'Transfer',
};

export const BENEFIT_STATUS = {
  'A': 'Active',
  'C': 'Consolidated Omnibus Budget Reconciliation Act (COBRA)',
  'S': 'Surviving Insured',
  'T': 'Tax Equity and Fiscal Responsibility Act (TEFRA)',
};

export const EMPLOYMENT_STATUS = {
  'AC': 'Active Continuation', 'AO': 'Active Military - Overseas', 'AU': 'Active Military - USA',
  'FT': 'Full-time', 'L1': 'Leave of Absence', 'PT': 'Part-time', 'RT': 'Retired', 'TE': 'Terminated',
};

export const INSURANCE_LINE = {
  'AG': 'Preventative Care/Wellness', 'AH': '24 Hour Care', 'AJ': 'Medicare Risk',
  'AK': 'Mental Health', 'DCP': 'Dental Capitation', 'DEN': 'Dental',
  'EPO': 'Exclusive Provider Organization', 'FAC': 'Facility', 'HE': 'Hearing',
  'HLT': 'Health', 'HMO': 'Health Maintenance Organization', 'LTC': 'Long-Term Care',
  'LTD': 'Long-Term Disability', 'MM': 'Major Medical', 'MOD': 'Mail Order Drug',
  'PDG': 'Prescription Drug', 'POS': 'Point of Service', 'PPO': 'Preferred Provider Organization',
  'PRA': 'Practitioners', 'STD': 'Short-Term Disability', 'UR': 'Utilization Review', 'VIS': 'Vision',
};

export const COVERAGE_LEVEL = {
  'CHD': 'Children Only', 'DEP': 'Dependents Only',
  'E1D': 'Employee and One Dependent', 'E2D': 'Employee and Two Dependents',
  'E3D': 'Employee and Three Dependents', 'E5D': 'Employee and One or More Dependents',
  'E6D': 'Employee and Two or More Dependents', 'E7D': 'Employee and Three or More Dependents',
  'E8D': 'Employee and Four or More Dependents', 'E9D': 'Employee and Five or More Dependents',
  'ECH': 'Employee and Children', 'EMP': 'Employee Only', 'ESP': 'Employee and Spouse',
  'FAM': 'Family', 'IND': 'Individual', 'SPC': 'Spouse and Children', 'SPO': 'Spouse Only',
  'TWO': 'Two Party',
};

// Coverage levels that by definition cover only the subscriber.
export const SINGLE_COVERAGE = new Set(['EMP', 'IND']);

export const GENDER = { F: 'Female', M: 'Male', U: 'Unknown' };

export const DATE_QUALIFIER = {
  '007': 'Effective', '050': 'Received', '286': 'Retirement', '296': 'Initial Disability Period Return To Work',
  '297': 'Initial Disability Period Last Day Worked', '300': 'Enrollment Signature Date',
  '301': 'COBRA Qualifying Event', '303': 'Maintenance Effective', '336': 'Employment Begin',
  '337': 'Employment End', '338': 'Medicare Begin', '339': 'Medicare End', '340': 'COBRA Begin',
  '341': 'COBRA End', '348': 'Benefit Begin', '349': 'Benefit End', '350': 'Education Begin',
  '351': 'Education End', '356': 'Eligibility Begin', '357': 'Eligibility End', '382': 'Enrollment',
  '383': 'Adjusted Hire', '385': 'Credited Service Begin', '386': 'Credited Service End',
  '393': 'Plan Begin', '394': 'Plan End', '473': 'Medicaid Begin', '474': 'Medicaid End',
  '543': 'Last Premium Paid', '695': 'Previous Period',
};

export const ID_QUALIFIER = {
  '34': 'Social Security Number',
  'ZZ': 'Mutually Defined (e.g. member or employee ID)',
};

export const CODE_TABLES = {
  relationship: { element: 'INS02', table: RELATIONSHIP },
  maintenance_type: { element: 'INS03 / HD01', table: MAINTENANCE_TYPE },
  maintenance_reason: { element: 'INS04 / HD02', table: MAINTENANCE_REASON },
  benefit_status: { element: 'INS05', table: BENEFIT_STATUS },
  employment_status: { element: 'INS08', table: EMPLOYMENT_STATUS },
  insurance_line: { element: 'HD03', table: INSURANCE_LINE },
  coverage_level: { element: 'HD05', table: COVERAGE_LEVEL },
  date_qualifier: { element: 'DTP01', table: DATE_QUALIFIER },
  bgn_purpose: { element: 'BGN01', table: BGN_PURPOSE },
  bgn_action: { element: 'BGN08', table: BGN_ACTION },
  gender: { element: 'DMG03', table: GENDER },
  id_qualifier: { element: 'NM108', table: ID_QUALIFIER },
};

// Segment IDs used anywhere in a 005010X220A1 transaction, including the envelope.
// Anything else is a typo or a segment from another transaction set.
export const KNOWN_SEGMENTS = new Set([
  'ISA', 'IEA', 'GS', 'GE', 'ST', 'SE', 'BGN', 'REF', 'DTP', 'QTY', 'N1', 'ACT', 'INS', 'NM1', 'PER',
  'N3', 'N4', 'DMG', 'EC', 'ICM', 'AMT', 'HLH', 'LUI', 'DSB', 'HD', 'IDC', 'LX', 'PRV', 'PLA', 'COB',
  'LS', 'LE',
]);

// Maximum element lengths from 005010X220A1 for free-text and ID elements that
// HR systems commonly overflow. Key: segment ID, value: { element number: [name, max] }.
export const ELEMENT_MAX = {
  BGN: { 2: ['BGN02 reference number', 50] },
  N1: { 2: ['N102 name', 60], 4: ['N104 identification code', 80] },
  REF: { 2: ['REF02 reference identification', 50] },
  NM1: { 3: ['NM103 last name', 60], 4: ['NM104 first name', 35], 5: ['NM105 middle name', 25], 9: ['NM109 identification code', 80] },
  N3: { 1: ['N301 address line', 55], 2: ['N302 address line', 55] },
  N4: { 1: ['N401 city', 30], 2: ['N402 state code', 2], 3: ['N403 postal code', 15], 4: ['N404 country code', 3] },
  PER: { 2: ['PER02 contact name', 60], 4: ['PER04 communication number', 256] },
  HD: { 4: ['HD04 plan coverage description', 50], 5: ['HD05 coverage level', 3] },
};

// US states, DC, territories and military "states" accepted in N402 for US addresses.
export const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
  'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC',
  'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
  'AS', 'GU', 'MP', 'PR', 'VI', 'FM', 'MH', 'PW', 'AA', 'AE', 'AP',
]);
