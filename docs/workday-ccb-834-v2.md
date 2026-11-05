# Workday: Cloud Connect for Benefits: ANSI X12 834 V2

How to set up Workday's 834 V2 connector and use this MCP to test its output. The same content is available from the `workday_834_setup_guide` tool.

> Task names follow Workday naming; menus can differ by release. Confirm against Workday Community documentation for your tenant.

## 1. Integration System User (ISU) and security group

1. Run Create Integration System User. Use a dedicated name (e.g. ISU_<Carrier>_834_V2), a strong password, and tick "Do Not Allow UI Sessions".
2. Run Create Security Group. Type: Integration System Security Group (Unconstrained). Name it (e.g. ISSG_<Carrier>_834_V2) and add the ISU.
3. Run Maintain Domain Permissions for Security Group and grant Get (View) access to: Integration Event (plus Put/Modify, Functional Area: Integration); Person Data: Date of Birth; Person Data: Gender; Person Data: Marital Status; Person Data: ID Information; Worker Data: Workers; Worker Data: Public Worker Reports; Worker Data: Benefit Elections; Worker Data: Beneficiaries and Dependents; Worker Data: Dependent National IDs; Worker Data: Current Staffing Information.
4. If the file carries payroll deductions or contributions, also grant the payroll result domains your tenant requires (for example Get access to segmented payroll calculation and payroll country domains).
5. Run Activate Pending Security Policy Changes.

**Watch out:**

- A missing Person Data or Dependent National IDs permission does not fail the integration: the fields come out blank. The validator then reports DMG-MISSING, DMG-DOB or NM1-ID findings. Check permissions before blaming the data.

## 2. Create the integration system

1. Run Create Integration System. Enter a unique name (e.g. INT_<Carrier>_834_V2).
2. In "New using Template" select "Cloud Connect for Benefits: ANSI X12 834 V2" and click OK.
3. From the integration system's related actions, open Workday Account > Edit and select the ISU from step 1.

**Watch out:**

- Legacy (non-V2) 834 templates behave differently: population exclusions and ended-coverage handling are configured elsewhere. Make sure the V2 template is the one selected.

## 3. Choose exactly one transmission service

1. Related Actions > Integration System > Configure Integration Services. Enable exactly ONE of the CCB ANSI X12 834 V2 transmission services; enabling more than one triggers a validation warning.
2. Changes Only: new enrollments, changes and terminations within the current plan year. Subscribes to the Transaction Log Service (Benefit Election - Event Lite type).
3. Actives Only: active enrollments within the plan year. Ended coverages are never sent.
4. Full File: all active enrollments, plus ended coverages found within the "Ended Coverage History" number of days.
5. Full File - Report All Ended Coverages Once: full active file that always appends coverages ended within the run window.
6. Full File - Report Ended Coverage Once by Plan Type: full active file that reports a termination only when every plan in a plan type has ended.
7. Use choose_workday_834_service to pick the right one from the carrier's requirements.

**Watch out:**

- Ended-coverage handling is part of the transmission service in V2. A carrier that needs terminations will never get them from Actives Only.
- With a full-file service, anyone missing from the file may be terminated by the carrier. Run compare_834 between consecutive files before sending.

## 4A. Configure Integration Attributes

1. Related Actions > Integration System > Configure Integration Attributes.
2. Benefit Plans: select every plan this carrier administers (e.g. Medical PPO, HMO, Dental). A plan left out produces no HD loop for anyone in it.
3. Header elements: enter the carrier-provided envelope IDs (ISA06 sender, ISA08 receiver, GS02 and GS03 application codes).
4. TS_REF38: master policy number.
5. TS_DTP01 / TS_DTP03: file effective date qualifier and value (commonly 007).
6. Loop 1000A / 1000B: sponsor (employer) and payer (carrier) names and IDs.

## 4B. Configure Integration Maps

1. Related Actions > Integration System > Configure Integration Maps.
2. Loop2000_INS02 (relationship): map every Workday relationship (Spouse, Child, Domestic Partner, Stepchild...) to its EDI code (01, 19, 53, 17...).
3. Loop2100A_DMG03 / DMG04: map gender and marital status codes.
4. Loop2300_HD03 (insurance line): map each Workday benefit plan to the carrier's line code (e.g. HLT, DEN, VIS).
5. Loop2300_HD05 (coverage level): map each coverage target (Employee Only, Employee + Spouse...) to EDI codes (EMP, ESP, ECH, FAM...). Run Maintain Health Care Coverage Targets first so the targets appear as internal values.

**Watch out:**

- An unmapped value goes out blank or as the raw Workday value. That shows up as INS02, HD03 or HD05 findings, usually for the less common relationships or tiers.

## 4C. Configure Integration Field Attributes

1. Related Actions > Integration System > Configure Integration Field Attributes.
2. Include or exclude loops, segments and elements at the employee and dependent level to match the carrier's companion guide (e.g. REF*1L group number, PER contact, N3/N4 address, NM108/NM109 IDs for dependents).
3. Greyed-out checkboxes are HIPAA-mandatory elements and cannot be removed.

## 4D. Population eligibility and field overrides

1. The V2 template has no "Exclude Participant from File" override. Instead, create a Boolean calculated field on the Worker business object that returns true for workers to include.
2. Related Actions > Integration System > Configure Integration Population Eligibility, and select that calculated field.
3. For values the template does not provide (e.g. an election signature date as DTP*300 in loop 2300, or a custom address format), use Configure Integration Field Overrides to map calculated fields to the target segment.

**Watch out:**

- Calculated fields used in overrides must return values in EDI format (dates as CCYYMMDD). A wrong format shows up as DTP-DATE or DTP-FORMAT findings.

## 5. File name, delivery and debug

1. CCB - Sequence Generator: set the outgoing file name format the carrier expects.
2. CCB - Delivery Service: configure the carrier's SFTP endpoint (and encryption, if the carrier requires PGP).
3. CCB - Debug Service: enable during testing to run for a single worker or a small test group.

**Watch out:**

- Validate the file exactly as Workday produced it (download from the integration event), before any encryption step.

## 6. Test loop with this MCP

1. Enable the Debug Service and launch for a handful of test workers covering: a new hire, a dependent add, a tier change, a termination, a COBRA case and a child near the age limit.
2. Download the output file from the integration event and save it in EDI_834_DIR.
3. Run validate_834 with platform="workday_ccb_834_v2" (and the carrier's profile). Each finding includes where_to_fix in Workday.
4. Fix the configuration or data, relaunch, and validate again until there are no errors.
5. Run compare_834 between the previous and the new file to confirm only the intended changes appear.
6. Before go-live, launch for the full population, validate, and send the carrier a test file for their acceptance testing.

## Transmission services at a glance

| Carrier wants | Service |
|---|---|
| Only changes since the last file | CCB ANSI X12 834 V2 Changes Only |
| Full file, terminates by omission | CCB ANSI X12 834 V2 Actives Only |
| Full file, terminations repeated within a look-back window | CCB ANSI X12 834 V2 Full File |
| Full file, each termination reported once | CCB ANSI X12 834 V2 Full File - Report All Ended Coverages Once |
| Full file, terminations only when a whole plan type ends | CCB ANSI X12 834 V2 Full File - Report Ended Coverage Once by Plan Type |

## Where to fix each finding

With `platform: "workday_ccb_834_v2"`, every `validate_834` finding carries this location.

| Rule | Where in Workday | What to do |
|---|---|---|
| ENV-ISA-FIELDS | Configure Integration Attributes > Header elements (ISA06, ISA08) | Check that the sender and receiver IDs are within 15 characters and contain no delimiter characters (* ~ : ^). Otherwise see the envelope note: the file was likely altered after generation. |
| ENV-IEA-MISSING | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-CONTROL-ISA | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-COUNT-GS | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-GS-MISSING | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-GE-MISSING | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-CONTROL-GS | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-COUNT-ST | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-SE-MISSING | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-CONTROL-ST | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-SEGMENT-COUNT | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| ENV-GS01 | Create Integration System (template choice) | GS01, GS08 and ST01/ST03 are fixed by the "Cloud Connect for Benefits: ANSI X12 834 V2" template. A wrong value means the file came from another template or system. |
| ENV-VERSION | Create Integration System (template choice) | The V2 template produces 005010X220A1. A 4010 file comes from a legacy template or another system; confirm the integration uses "Cloud Connect for Benefits: ANSI X12 834 V2". |
| ENV-ST01 | Create Integration System (template choice) | ST01 is fixed by the template; this file is not an 834 produced by CCB 834 V2. |
| ENV-TEST-FILE | Configure Integration Attributes > Header elements (usage indicator, if exposed in your release) | Switch the usage indicator to Production before go-live, as agreed with the carrier. |
| HDR-BGN-MISSING | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| HDR-BGN01 | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| HDR-BGN-DATE | Generated by the CCB 834 V2 template (not configurable) | The template builds the envelope correctly, so this usually means the file was changed after Workday produced it (a middleware or encryption step, a manual edit) or was truncated in transfer. Re-download the file from the integration event and validate that copy. |
| HDR-BGN08 | Configure Integration Services (transmission service) | The action code follows the transmission service. Confirm the carrier expects a change file or a full file and pick the matching service (choose_workday_834_service). |
| HDR-FULL-REPLACE | Configure Integration Services (transmission service) | A full-file service is enabled. Run compare_834 against the previous file before every send, and check Population Eligibility so nobody drops out by mistake. |
| HDR-SPONSOR | Configure Integration Attributes > Loop 1000A / 1000B | Enter the sponsor (employer) and payer (carrier) name and identifier. |
| HDR-PAYER | Configure Integration Attributes > Loop 1000A / 1000B | Enter the sponsor (employer) and payer (carrier) name and identifier. |
| HDR-NO-MEMBERS | Configure Integration Attributes > Benefit Plans; Configure Integration Population Eligibility; Debug Service parameters | Check that the carrier's plans are selected, that the eligibility calculated field returns true for the intended workers, and (for Changes Only) that there were changes since the last run. |
| INS01 | Configure Integration Maps > Loop2000_INS02 | Map the Workday relationship type for this dependent to an EDI code. Unmapped relationships (often Domestic Partner, Stepchild, Legal Ward) are the usual cause. |
| INS02 | Configure Integration Maps > Loop2000_INS02 | Map the Workday relationship type for this dependent to an EDI code. Unmapped relationships (often Domestic Partner, Stepchild, Legal Ward) are the usual cause. |
| INS-SELF | Configure Integration Maps > Loop2000_INS02 | Map the Workday relationship type for this dependent to an EDI code. Unmapped relationships (often Domestic Partner, Stepchild, Legal Ward) are the usual cause. |
| INS03 | Generated from the benefit event; Configure Integration Services | The maintenance type follows the benefit event and transmission service. Check the worker's benefit event history for this member. |
| INS04 | Configure Integration Maps (maintenance reason / event mapping, if exposed in your release) | Confirm the carrier accepts this reason code, or map the Workday benefit event reason to one they accept. |
| INS05 | Worker's benefit elections (COBRA / continuation setup) | Benefit status comes from the election (active vs COBRA). Check the worker's COBRA eligibility event. |
| INS08 | Configure Integration Maps (employment status) and Configure Integration Field Attributes | Map Workday worker status / time type to FT, PT, RT, TE, etc. |
| INS08-MISSING | Configure Integration Field Attributes (INS08) and Configure Integration Maps (employment status) | Include INS08 for employees and make sure every worker status is mapped. |
| INS-TERM-ACTIVE | Worker's termination and benefit events in Workday | The worker is terminated but the coverage was not ended. Check that the termination's benefit event (or COBRA event) completed, then relaunch. |
| REF-0F | Configure Integration Attributes / Field Attributes (subscriber identifier) | Choose which ID the carrier uses as subscriber ID (employee ID or national ID) and make sure it is included for employees and dependents. |
| DUP-SUBSCRIBER | Configure Integration Population Eligibility; worker record | Usually a worker with more than one position, or a rehire with two records. Check the eligibility calculated field and the worker's position history. |
| DEP-ORPHAN | Configure Integration Field Overrides; any post-processing step | The template writes dependents under their employee. An orphan usually comes from an override that changes REF*0F for dependents, or from editing or merging files after Workday. |
| REF-1L | Configure Integration Field Attributes (REF*1L) and Configure Integration Attributes / Maps (group number per plan) | Include REF*1L and supply the carrier's group or policy number. |
| NM1-MISSING | Generated by the template | The member name loop is mandatory; if it is missing, the file was altered after generation. |
| NM1-LAST | Worker or dependent legal name | Correct the legal name on the person's record. |
| NM1-FIRST | Worker or dependent legal name | Correct the legal name on the person's record. |
| NM1-ID | ISSG domain permissions (Person Data: ID Information, Worker Data: Dependent National IDs); Configure Integration Field Attributes (NM108/NM109) | Blank IDs across many dependents usually mean the Dependent National IDs domain is missing. For one person, correct the national ID on their record. |
| SSN-REQUIRED | ISSG domain permissions (Person Data: ID Information, Worker Data: Dependent National IDs); Configure Integration Field Attributes (NM108/NM109) | Blank IDs across many dependents usually mean the Dependent National IDs domain is missing. For one person, correct the national ID on their record. |
| SSN-INVALID | The worker's or dependent's national ID in Workday | Correct the SSN on the person's record (never in the file). Placeholder SSNs entered at hire are a common cause. |
| DMG-MISSING | ISSG domain permissions (Person Data: Date of Birth / Gender); the worker or dependent record | If the value is blank for many people, the ISU is missing the Person Data domain: add it and run Activate Pending Security Policy Changes. If it is one person, correct their personal data. |
| DMG-DOB | ISSG domain permissions (Person Data: Date of Birth / Gender); the worker or dependent record | If the value is blank for many people, the ISU is missing the Person Data domain: add it and run Activate Pending Security Policy Changes. If it is one person, correct their personal data. |
| DMG-DOB-FUTURE | ISSG domain permissions (Person Data: Date of Birth / Gender); the worker or dependent record | If the value is blank for many people, the ISU is missing the Person Data domain: add it and run Activate Pending Security Policy Changes. If it is one person, correct their personal data. |
| DMG-GENDER | Configure Integration Maps > Loop2100A_DMG03 | Map every Workday gender value (including "not declared") to F, M or U. |
| DEP-AGE | Dependent eligibility rules / benefit plan eligibility; dependent age-out processing | Check whether an age-out event should have ended this dependent's coverage, or record the disabled-dependent exception. |
| NO-COVERAGE | Configure Integration Attributes > Benefit Plans; Configure Integration Maps > Loop2300_HD03 | The member's plan may not be selected for this integration or not mapped to a line code. |
| HD01 | Generated from the benefit event | Check the benefit event for this coverage. |
| HD03-MISSING | Configure Integration Maps > Loop2300_HD03 | Map each Workday benefit plan to the carrier's insurance line code (HLT, DEN, VIS...). |
| HD03 | Configure Integration Maps > Loop2300_HD03 | Map each Workday benefit plan to the carrier's insurance line code (HLT, DEN, VIS...). |
| HD03-PROFILE | Configure Integration Maps > Loop2300_HD03 | Map each Workday benefit plan to the carrier's insurance line code (HLT, DEN, VIS...). |
| HD05 | Configure Integration Maps > Loop2300_HD05 (after Maintain Health Care Coverage Targets) | Map every coverage target to the carrier's code. If a target is missing from the map list, run Maintain Health Care Coverage Targets first. |
| HD05-MISSING | Configure Integration Maps > Loop2300_HD05 (after Maintain Health Care Coverage Targets) | Map every coverage target to the carrier's code. If a target is missing from the map list, run Maintain Health Care Coverage Targets first. |
| HD05-PROFILE | Configure Integration Maps > Loop2300_HD05 (after Maintain Health Care Coverage Targets) | Map every coverage target to the carrier's code. If a target is missing from the map list, run Maintain Health Care Coverage Targets first. |
| DTP-348 | Worker's benefit event / election in Workday; Configure Integration Field Overrides if a calculated field feeds this date | Coverage dates come from the benefit election. Correct the event (or the calculated field's output format, CCYYMMDD) and relaunch. |
| DTP-DATE | Worker's benefit event / election in Workday; Configure Integration Field Overrides if a calculated field feeds this date | Coverage dates come from the benefit election. Correct the event (or the calculated field's output format, CCYYMMDD) and relaunch. |
| DTP-FORMAT | Worker's benefit event / election in Workday; Configure Integration Field Overrides if a calculated field feeds this date | Coverage dates come from the benefit election. Correct the event (or the calculated field's output format, CCYYMMDD) and relaunch. |
| END-BEFORE-BEGIN | Worker's benefit event / election in Workday; Configure Integration Field Overrides if a calculated field feeds this date | Coverage dates come from the benefit election. Correct the event (or the calculated field's output format, CCYYMMDD) and relaunch. |
| RETRO | Worker's benefit event (retroactive event) | A retro benefit event produced an old begin date. Agree with the carrier whether to send it in the file or process it manually. |
| FUTURE | Worker's benefit election; benefit plan year setup | Check the coverage begin date and the plan year (a wrong year is the usual cause). |
| TERM-NO-END | Configure Integration Services (transmission service ended-coverage handling) | Use a service that reports ended coverages (Changes Only, Full File with Ended Coverage History, or Report All Ended Coverages Once). Actives Only never sends terminations. |
| END-ON-ACTIVE | Benefit plan year setup; worker's benefit election | Usually the plan year end date. Confirm the carrier wants it, or exclude the element in Field Attributes if their guide says so. |
| TIER-MISMATCH | Configure Integration Maps > Loop2300_HD05; the worker's election (covered dependents) | Either a coverage target is mapped to EMP by mistake, or dependents are attached to an employee-only election. Check the map first: it affects everyone on that tier. |

## References

- [ANSI X12 834 V2 Template (Workday Community)](https://community-content.workday.com/content/workday-community/en-us/reference/products/human-capital-management/cloud-connect-for-benefits/ansi-x12-834-v2-template.html)
- [Cloud Connect for Benefits (Workday Community)](https://community-content.workday.com/content/workday-community/en-us/public/products/human-capital-management/cloud-connect-for-benefits.html)

Workday is a trademark of Workday, Inc. This project is not affiliated with or endorsed by Workday.
