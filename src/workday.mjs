// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Workday "Cloud Connect for Benefits: ANSI X12 834 V2" (CCB 834 V2) support:
//   - a step-by-step setup guide, by section
//   - a transmission-service chooser
//   - for every validator rule, where in Workday the fix usually lives
//
// Task and service names follow Workday's own naming. Tenants differ by
// release and configuration, so treat this as a map to the right place, and
// confirm details against Workday Community documentation for your release.

export const WORKDAY_TEMPLATE = 'Cloud Connect for Benefits: ANSI X12 834 V2';

export const GUIDE = {
  security: {
    title: '1. Integration System User (ISU) and security group',
    steps: [
      'Run Create Integration System User. Use a dedicated name (e.g. ISU_<Carrier>_834_V2), a strong password, and tick "Do Not Allow UI Sessions".',
      'Run Create Security Group. Type: Integration System Security Group (Unconstrained). Name it (e.g. ISSG_<Carrier>_834_V2) and add the ISU.',
      'Run Maintain Domain Permissions for Security Group and grant Get (View) access to: Integration Event (plus Put/Modify, Functional Area: Integration); Person Data: Date of Birth; Person Data: Gender; Person Data: Marital Status; Person Data: ID Information; Worker Data: Workers; Worker Data: Public Worker Reports; Worker Data: Benefit Elections; Worker Data: Beneficiaries and Dependents; Worker Data: Dependent National IDs; Worker Data: Current Staffing Information.',
      'If the file carries payroll deductions or contributions, also grant the payroll result domains your tenant requires (for example Get access to segmented payroll calculation and payroll country domains).',
      'Run Activate Pending Security Policy Changes.',
    ],
    pitfalls: [
      'A missing Person Data or Dependent National IDs permission does not fail the integration: the fields come out blank. The validator then reports DMG-MISSING, DMG-DOB or NM1-ID findings. Check permissions before blaming the data.',
    ],
  },
  integration_system: {
    title: '2. Create the integration system',
    steps: [
      'Run Create Integration System. Enter a unique name (e.g. INT_<Carrier>_834_V2).',
      `In "New using Template" select "${WORKDAY_TEMPLATE}" and click OK.`,
      'From the integration system\'s related actions, open Workday Account > Edit and select the ISU from step 1.',
    ],
    pitfalls: [
      'Legacy (non-V2) 834 templates behave differently: population exclusions and ended-coverage handling are configured elsewhere. Make sure the V2 template is the one selected.',
    ],
  },
  transmission_services: {
    title: '3. Choose exactly one transmission service',
    steps: [
      'Related Actions > Integration System > Configure Integration Services. Enable exactly ONE of the CCB ANSI X12 834 V2 transmission services; enabling more than one triggers a validation warning.',
      'Changes Only: new enrollments, changes and terminations within the current plan year. Subscribes to the Transaction Log Service (Benefit Election - Event Lite type).',
      'Actives Only: active enrollments within the plan year. Ended coverages are never sent.',
      'Full File: all active enrollments, plus ended coverages found within the "Ended Coverage History" number of days.',
      'Full File - Report All Ended Coverages Once: full active file that always appends coverages ended within the run window.',
      'Full File - Report Ended Coverage Once by Plan Type: full active file that reports a termination only when every plan in a plan type has ended.',
      'Use choose_workday_834_service to pick the right one from the carrier\'s requirements.',
    ],
    pitfalls: [
      'Ended-coverage handling is part of the transmission service in V2. A carrier that needs terminations will never get them from Actives Only.',
      'With a full-file service, anyone missing from the file may be terminated by the carrier. Run compare_834 between consecutive files before sending.',
    ],
  },
  attributes: {
    title: '4A. Configure Integration Attributes',
    steps: [
      'Related Actions > Integration System > Configure Integration Attributes.',
      'Benefit Plans: select every plan this carrier administers (e.g. Medical PPO, HMO, Dental). A plan left out produces no HD loop for anyone in it.',
      'Header elements: enter the carrier-provided envelope IDs (ISA06 sender, ISA08 receiver, GS02 and GS03 application codes).',
      'TS_REF38: master policy number.',
      'TS_DTP01 / TS_DTP03: file effective date qualifier and value (commonly 007).',
      'Loop 1000A / 1000B: sponsor (employer) and payer (carrier) names and IDs.',
    ],
    pitfalls: [],
  },
  maps: {
    title: '4B. Configure Integration Maps',
    steps: [
      'Related Actions > Integration System > Configure Integration Maps.',
      'Loop2000_INS02 (relationship): map every Workday relationship (Spouse, Child, Domestic Partner, Stepchild...) to its EDI code (01, 19, 53, 17...).',
      'Loop2100A_DMG03 / DMG04: map gender and marital status codes.',
      'Loop2300_HD03 (insurance line): map each Workday benefit plan to the carrier\'s line code (e.g. HLT, DEN, VIS).',
      'Loop2300_HD05 (coverage level): map each coverage target (Employee Only, Employee + Spouse...) to EDI codes (EMP, ESP, ECH, FAM...). Run Maintain Health Care Coverage Targets first so the targets appear as internal values.',
    ],
    pitfalls: [
      'An unmapped value goes out blank or as the raw Workday value. That shows up as INS02, HD03 or HD05 findings, usually for the less common relationships or tiers.',
    ],
  },
  field_attributes: {
    title: '4C. Configure Integration Field Attributes',
    steps: [
      'Related Actions > Integration System > Configure Integration Field Attributes.',
      'Include or exclude loops, segments and elements at the employee and dependent level to match the carrier\'s companion guide (e.g. REF*1L group number, PER contact, N3/N4 address, NM108/NM109 IDs for dependents).',
      'Greyed-out checkboxes are HIPAA-mandatory elements and cannot be removed.',
    ],
    pitfalls: [],
  },
  population: {
    title: '4D. Population eligibility and field overrides',
    steps: [
      'The V2 template has no "Exclude Participant from File" override. Instead, create a Boolean calculated field on the Worker business object that returns true for workers to include.',
      'Related Actions > Integration System > Configure Integration Population Eligibility, and select that calculated field.',
      'For values the template does not provide (e.g. an election signature date as DTP*300 in loop 2300, or a custom address format), use Configure Integration Field Overrides to map calculated fields to the target segment.',
    ],
    pitfalls: [
      'Calculated fields used in overrides must return values in EDI format (dates as CCYYMMDD). A wrong format shows up as DTP-DATE or DTP-FORMAT findings.',
    ],
  },
  transport: {
    title: '5. File name, delivery and debug',
    steps: [
      'CCB - Sequence Generator: set the outgoing file name format the carrier expects.',
      'CCB - Delivery Service: configure the carrier\'s SFTP endpoint (and encryption, if the carrier requires PGP).',
      'CCB - Debug Service: enable during testing to run for a single worker or a small test group.',
    ],
    pitfalls: [
      'Validate the file exactly as Workday produced it (download from the integration event), before any encryption step.',
    ],
  },
  testing: {
    title: '6. Test loop with this MCP',
    steps: [
      'Enable the Debug Service and launch for a handful of test workers covering: a new hire, a dependent add, a tier change, a termination, a COBRA case and a child near the age limit.',
      'Download the output file from the integration event and save it in EDI_834_DIR.',
      'Run validate_834 with platform="workday_ccb_834_v2" (and the carrier\'s profile). Each finding includes where_to_fix in Workday.',
      'Fix the configuration or data, relaunch, and validate again until there are no errors.',
      'Run compare_834 between the previous and the new file to confirm only the intended changes appear.',
      'Before go-live, launch for the full population, validate, and send the carrier a test file for their acceptance testing.',
    ],
    pitfalls: [],
  },
};

export const SECTION_ORDER = ['security', 'integration_system', 'transmission_services', 'attributes', 'maps', 'field_attributes', 'population', 'transport', 'testing'];

export function setupGuide(section = 'all') {
  const keys = section === 'all' ? SECTION_ORDER : [section];
  for (const k of keys) {
    if (!GUIDE[k]) return { error: true, message: `Unknown section "${section}".`, sections: ['all', ...SECTION_ORDER] };
  }
  return {
    template: WORKDAY_TEMPLATE,
    note: 'Task names follow Workday naming; menus can differ by release. Confirm against Workday Community documentation for your tenant.',
    sections: keys.map(k => ({ key: k, ...GUIDE[k] })),
  };
}

// ─── Transmission service chooser ────────────────────────────────────────────

export const SERVICES = {
  changes_only: 'CCB ANSI X12 834 V2 Changes Only',
  actives_only: 'CCB ANSI X12 834 V2 Actives Only',
  full_file: 'CCB ANSI X12 834 V2 Full File',
  full_report_all_ended_once: 'CCB ANSI X12 834 V2 Full File - Report All Ended Coverages Once',
  full_ended_once_by_plan_type: 'CCB ANSI X12 834 V2 Full File - Report Ended Coverage Once by Plan Type',
};

export function chooseService({ file_type, terminations = 'yes', terminate_by = 'plan', history_days }) {
  if (file_type === 'changes') {
    return {
      service: SERVICES.changes_only,
      why: 'The carrier wants only adds, changes and terminations since the last run.',
      settings: ['The service subscribes to the Transaction Log Service (Benefit Election - Event Lite). Make sure the first run has a sensible start point so the first file is not empty or huge.'],
      expect_in_file: 'BGN08 is normally 2 (change). compare_834 reports absent members as information only.',
    };
  }
  if (file_type !== 'full') return { error: true, message: 'file_type must be "changes" or "full".' };
  if (terminations === 'no') {
    return {
      service: SERVICES.actives_only,
      why: 'Full file of active enrollments; the carrier terminates anyone who drops off the file.',
      settings: [],
      warning: 'Ended coverages are never sent. Confirm in writing that the carrier terminates by omission, and run compare_834 on every file: an accidental omission becomes a coverage termination.',
      expect_in_file: 'Full file (BGN08 commonly RX or 4).',
    };
  }
  if (terminate_by === 'plan_type') {
    return {
      service: SERVICES.full_ended_once_by_plan_type,
      why: 'Full file; a termination is reported once, only when all plans in a plan type have ended (e.g. switching medical plans is not a medical termination).',
      settings: [],
      expect_in_file: 'Full file with 024 terminations only for whole plan types.',
    };
  }
  if (terminations === 'once') {
    return {
      service: SERVICES.full_report_all_ended_once,
      why: 'Full file that appends each ended coverage once, within the run window.',
      settings: [],
      expect_in_file: 'Full file plus HD01=024 loops with DTP*349 for coverages that ended since the last run.',
    };
  }
  return {
    service: SERVICES.full_file,
    why: 'Full file of active enrollments plus ended coverages within a look-back window.',
    settings: [`Set the Ended Coverage History attribute to ${history_days ?? 'the number of days the carrier wants terminations repeated (often 30–60)'}.`],
    expect_in_file: 'Full file; recently ended coverages repeat on every run within the window.',
  };
}

// ─── Where to fix each finding in Workday ────────────────────────────────────

const ENVELOPE = {
  where: 'Generated by the CCB 834 V2 template (not configurable)',
  how: 'The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy.',
};

const SPONSOR_PAYER = { where: 'Configure Integration Attributes > Loop 1000A / 1000B', how: 'Enter the sponsor (employer) and payer (carrier) name and identifier.' };
const RELATIONSHIP = { where: 'Configure Integration Maps > Loop2000_INS02', how: 'Map the Workday relationship type for this dependent to an EDI code. Unmapped relationships (often Domestic Partner, Stepchild, Legal Ward) are the usual cause.' };
const COVERAGE_LEVEL = { where: 'Configure Integration Maps > Loop2300_HD05 (after Maintain Health Care Coverage Targets)', how: 'Map every coverage target to the carrier\'s code. If a target is missing from the map list, run Maintain Health Care Coverage Targets first.' };
const INSURANCE_LINE = { where: 'Configure Integration Maps > Loop2300_HD03', how: 'Map each Workday benefit plan to the carrier\'s insurance line code (HLT, DEN, VIS...).' };
const BENEFIT_DATES = { where: 'Worker\'s benefit event / election in Workday; Configure Integration Field Overrides if a calculated field feeds this date', how: 'Coverage dates come from the benefit election. Correct the event (or the calculated field\'s output format, CCYYMMDD) and relaunch.' };
const DEMOGRAPHICS = { where: 'ISSG domain permissions (Person Data: Date of Birth / Gender); the worker or dependent record', how: 'If the value is blank for many people, the ISU is missing the Person Data domain: add it and run Activate Pending Security Policy Changes. If it is one person, correct their personal data.' };
const NATIONAL_ID = { where: 'ISSG domain permissions (Person Data: ID Information, Worker Data: Dependent National IDs); Configure Integration Field Attributes (NM108/NM109)', how: 'Blank IDs across many dependents usually mean the Dependent National IDs domain is missing. For one person, correct the national ID on their record.' };

const ADDRESS = { where: 'Worker or dependent home / mailing address in Workday; Configure Integration Field Attributes (N3/N4)', how: 'Correct the address on the person\'s record. If many dependents lack addresses, they may not have one entered; ask whether the carrier needs dependent addresses or exclude N3/N4 for dependents in Field Attributes.' };

export const WORKDAY_HINTS = {
  'ENV-ISA-FIELDS': { where: 'Configure Integration Attributes > Header elements (ISA06, ISA08)', how: 'Check that the sender and receiver IDs are within 15 characters and contain no delimiter characters (* ~ : ^). Otherwise see the envelope note: the file was likely altered after generation.' },
  'ENV-IEA-MISSING': ENVELOPE, 'ENV-CONTROL-ISA': ENVELOPE, 'ENV-COUNT-GS': ENVELOPE, 'ENV-GS-MISSING': ENVELOPE,
  'ENV-GE-MISSING': ENVELOPE, 'ENV-CONTROL-GS': ENVELOPE, 'ENV-COUNT-ST': ENVELOPE, 'ENV-SE-MISSING': ENVELOPE,
  'ENV-CONTROL-ST': ENVELOPE, 'ENV-SEGMENT-COUNT': ENVELOPE,
  'ENV-GS01': { where: 'Create Integration System (template choice)', how: `GS01, GS08 and ST01/ST03 are fixed by the "${WORKDAY_TEMPLATE}" template. A wrong value means the file came from another template or system.` },
  'ENV-VERSION': { where: 'Create Integration System (template choice)', how: `The V2 template produces 005010X220A1. A 4010 file comes from a legacy template or another system; confirm the integration uses "${WORKDAY_TEMPLATE}".` },
  'ENV-ST01': { where: 'Create Integration System (template choice)', how: 'ST01 is fixed by the template; this file is not an 834 produced by CCB 834 V2.' },
  'ENV-TEST-FILE': { where: 'Configure Integration Attributes > Header elements (usage indicator, if exposed in your release)', how: 'Switch the usage indicator to Production before go-live, as agreed with the carrier.' },
  'HDR-BGN-MISSING': ENVELOPE, 'HDR-BGN01': ENVELOPE, 'HDR-BGN-DATE': ENVELOPE,
  'HDR-BGN08': { where: 'Configure Integration Services (transmission service)', how: 'The action code follows the transmission service. Confirm the carrier expects a change file or a full file and pick the matching service (choose_workday_834_service).' },
  'HDR-FULL-REPLACE': { where: 'Configure Integration Services (transmission service)', how: 'A full-file service is enabled. Run compare_834 against the previous file before every send, and check Population Eligibility so nobody drops out by mistake.' },
  'HDR-SPONSOR': SPONSOR_PAYER, 'HDR-PAYER': SPONSOR_PAYER,
  'HDR-NO-MEMBERS': { where: 'Configure Integration Attributes > Benefit Plans; Configure Integration Population Eligibility; Debug Service parameters', how: 'Check that the carrier\'s plans are selected, that the eligibility calculated field returns true for the intended workers, and (for Changes Only) that there were changes since the last run.' },
  'INS01': RELATIONSHIP, 'INS02': RELATIONSHIP, 'INS-SELF': RELATIONSHIP,
  'INS03': { where: 'Generated from the benefit event; Configure Integration Services', how: 'The maintenance type follows the benefit event and transmission service. Check the worker\'s benefit event history for this member.' },
  'INS04': { where: 'Configure Integration Maps (maintenance reason / event mapping, if exposed in your release)', how: 'Confirm the carrier accepts this reason code, or map the Workday benefit event reason to one they accept.' },
  'INS05': { where: 'Worker\'s benefit elections (COBRA / continuation setup)', how: 'Benefit status comes from the election (active vs COBRA). Check the worker\'s COBRA eligibility event.' },
  'INS08': { where: 'Configure Integration Maps (employment status) and Configure Integration Field Attributes', how: 'Map Workday worker status / time type to FT, PT, RT, TE, etc.' },
  'INS08-MISSING': { where: 'Configure Integration Field Attributes (INS08) and Configure Integration Maps (employment status)', how: 'Include INS08 for employees and make sure every worker status is mapped.' },
  'INS-TERM-ACTIVE': { where: 'Worker\'s termination and benefit events in Workday', how: 'The worker is terminated but the coverage was not ended. Check that the termination\'s benefit event (or COBRA event) completed, then relaunch.' },
  'REF-0F': { where: 'Configure Integration Attributes / Field Attributes (subscriber identifier)', how: 'Choose which ID the carrier uses as subscriber ID (employee ID or national ID) and make sure it is included for employees and dependents.' },
  'DUP-SUBSCRIBER': { where: 'Configure Integration Population Eligibility; worker record', how: 'Usually a worker with more than one position, or a rehire with two records. Check the eligibility calculated field and the worker\'s position history.' },
  'DEP-ORPHAN': { where: 'Configure Integration Field Overrides; any post-processing step', how: 'The template writes dependents under their employee. An orphan usually comes from an override that changes REF*0F for dependents, or from editing or merging files after Workday.' },
  'REF-1L': { where: 'Configure Integration Field Attributes (REF*1L) and Configure Integration Attributes / Maps (group number per plan)', how: 'Include REF*1L and supply the carrier\'s group or policy number.' },
  'NM1-MISSING': { where: 'Generated by the template', how: 'The member name loop is mandatory; if it is missing, the file was altered after generation.' },
  'NM1-LAST': { where: 'Worker or dependent legal name', how: 'Correct the legal name on the person\'s record.' },
  'NM1-FIRST': { where: 'Worker or dependent legal name', how: 'Correct the legal name on the person\'s record.' },
  'NM1-ID': NATIONAL_ID, 'SSN-REQUIRED': NATIONAL_ID,
  'SSN-INVALID': { where: 'The worker\'s or dependent\'s national ID in Workday', how: 'Correct the SSN on the person\'s record (never in the file). Placeholder SSNs entered at hire are a common cause.' },
  'DMG-MISSING': DEMOGRAPHICS, 'DMG-DOB': DEMOGRAPHICS, 'DMG-DOB-FUTURE': DEMOGRAPHICS,
  'DMG-GENDER': { where: 'Configure Integration Maps > Loop2100A_DMG03', how: 'Map every Workday gender value (including "not declared") to F, M or U.' },
  'DEP-AGE': { where: 'Dependent eligibility rules / benefit plan eligibility; dependent age-out processing', how: 'Check whether an age-out event should have ended this dependent\'s coverage, or record the disabled-dependent exception.' },
  'NO-COVERAGE': { where: 'Configure Integration Attributes > Benefit Plans; Configure Integration Maps > Loop2300_HD03', how: 'The member\'s plan may not be selected for this integration or not mapped to a line code.' },
  'HD01': { where: 'Generated from the benefit event', how: 'Check the benefit event for this coverage.' },
  'HD03-MISSING': INSURANCE_LINE, 'HD03': INSURANCE_LINE, 'HD03-PROFILE': INSURANCE_LINE,
  'HD05': COVERAGE_LEVEL, 'HD05-MISSING': COVERAGE_LEVEL, 'HD05-PROFILE': COVERAGE_LEVEL,
  'DTP-348': BENEFIT_DATES, 'DTP-DATE': BENEFIT_DATES, 'DTP-FORMAT': BENEFIT_DATES, 'END-BEFORE-BEGIN': BENEFIT_DATES,
  'RETRO': { where: 'Worker\'s benefit event (retroactive event)', how: 'A retro benefit event produced an old begin date. Agree with the carrier whether to send it in the file or process it manually.' },
  'FUTURE': { where: 'Worker\'s benefit election; benefit plan year setup', how: 'Check the coverage begin date and the plan year (a wrong year is the usual cause).' },
  'TERM-NO-END': { where: 'Configure Integration Services (transmission service ended-coverage handling)', how: 'Use a service that reports ended coverages (Changes Only, Full File with Ended Coverage History, or Report All Ended Coverages Once). Actives Only never sends terminations.' },
  'END-ON-ACTIVE': { where: 'Benefit plan year setup; worker\'s benefit election', how: 'Usually the plan year end date. Confirm the carrier wants it, or exclude the element in Field Attributes if their guide says so.' },
  'SEG-UNKNOWN': { where: 'Configure Integration Field Overrides; any post-processing step', how: 'The template only writes 834 segments. An unknown segment usually comes from a custom override or from editing or merging the file after Workday.' },
  'ELEM-LENGTH': { where: 'The worker or dependent record; Configure Integration Field Overrides (to truncate)', how: 'Shorten the value on the person\'s record, or add a field override that truncates it to the carrier\'s limit. Long names, plan descriptions and address lines are the usual cause.' },
  'ADDR-STREET': ADDRESS, 'ADDR-N3-MISSING': ADDRESS, 'ADDR-N4-MISSING': ADDRESS, 'ADDR-CITY': ADDRESS, 'ADDR-STATE': ADDRESS, 'ADDR-ZIP': ADDRESS,
  'TIER-MISMATCH': { where: 'Configure Integration Maps > Loop2300_HD05; the worker\'s election (covered dependents)', how: 'Either a coverage target is mapped to EMP by mistake, or dependents are attached to an employee-only election. Check the map first: it affects everyone on that tier.' },
};

export function workdayHint(rule) {
  return WORKDAY_HINTS[rule] || null;
}
