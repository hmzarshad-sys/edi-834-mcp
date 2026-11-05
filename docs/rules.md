# Validation rules

Every finding from `validate_834` carries one of these rule IDs. Severity:

- **error**: the carrier is likely to reject the file or the member record.
- **warning**: probably wrong, and likely to cause a coverage, billing or claims problem.
- **info**: worth a look, not necessarily wrong.

Rules marked *(profile)* only run when a carrier profile turns them on.

## Envelope

| Rule | Severity | What it catches |
|---|---|---|
| ENV-ISA-FIELDS | error | ISA does not have exactly 16 elements |
| ENV-IEA-MISSING | error | No IEA trailer (truncated file) |
| ENV-CONTROL-ISA | error | IEA02 does not match ISA13 |
| ENV-COUNT-GS | error | IEA01 does not match the number of GS groups |
| ENV-TEST-FILE | info | ISA15 = T (test file) |
| ENV-GS-MISSING | error | No GS functional group |
| ENV-GS01 | error | GS01 is not BE |
| ENV-VERSION | error | GS08 or ST03 is not 005010X220A1 |
| ENV-GE-MISSING | error | GS group without GE trailer |
| ENV-CONTROL-GS | error | GE02 does not match GS06 |
| ENV-COUNT-ST | error | GE01 does not match the number of transactions |
| ENV-ST01 | error | ST01 is not 834 |
| ENV-SE-MISSING | error | Transaction without SE trailer |
| ENV-CONTROL-ST | error | SE02 does not match ST02 |
| ENV-SEGMENT-COUNT | error | SE01 does not equal the segments from ST to SE |

## Transaction header

| Rule | Severity | What it catches |
|---|---|---|
| HDR-BGN-MISSING | error | No BGN segment |
| HDR-BGN01 | error | Invalid purpose code |
| HDR-BGN-DATE | error | BGN03 is not a valid date |
| HDR-BGN08 | error | Invalid action code (must be 2, 4 or RX) |
| HDR-FULL-REPLACE | info | RX file: anyone left out may be terminated |
| HDR-SPONSOR | error | No sponsor (N1*P5) |
| HDR-PAYER | error | No payer (N1*IN) |
| HDR-NO-MEMBERS | warning | Transaction has no members |

## Member (INS loop)

| Rule | Severity | What it catches |
|---|---|---|
| INS01 | error | Subscriber indicator is not Y or N |
| INS02 | error | Invalid relationship code |
| INS-SELF | error | Subscriber not coded 18 (Self), or a dependent coded 18 |
| INS03 | error | Invalid maintenance type |
| INS04 | info | Uncommon maintenance reason code |
| INS05 | error | Invalid benefit status |
| INS08-MISSING | warning | Subscriber has no employment status |
| INS08 | error | Invalid employment status |
| INS-TERM-ACTIVE | warning | Employee terminated (TE) but coverage not terminated and not COBRA |
| REF-0F | error | Missing subscriber ID |
| DUP-SUBSCRIBER | warning | Same subscriber sent twice in one transaction |
| DEP-ORPHAN | error | Dependent does not follow its subscriber |
| REF-1L | error *(profile)* | Missing group/policy number |
| NM1-MISSING | error | No member name loop |
| NM1-LAST | error | Empty last name |
| NM1-FIRST | warning | Empty first name |
| NM1-ID | error | ID qualifier sent without an ID |
| SSN-INVALID | error | SSN that is never issued (area 000/666/9xx, group 00, serial 0000) or a placeholder |
| SSN-REQUIRED | error *(profile)* | Subscriber sent without SSN |
| DMG-MISSING | warning | No demographics |
| DMG-DOB | error | Birth date not a valid D8 date |
| DMG-DOB-FUTURE | error | Birth date in the future |
| DEP-AGE | warning | Child dependent at or over the age limit (default 26) |
| DMG-GENDER | error | Gender not F, M or U |
| NO-COVERAGE | warning | Member has no HD coverage loop |

## Coverage (HD loop)

| Rule | Severity | What it catches |
|---|---|---|
| HD01 | error | Invalid coverage maintenance type |
| HD03-MISSING | error | No insurance line code |
| HD03 | warning | Non-standard insurance line code |
| HD03-PROFILE | error *(profile)* | Insurance line the carrier does not accept |
| HD05 | error | Invalid coverage level |
| HD05-PROFILE | error *(profile)* | Coverage level the carrier does not accept |
| HD05-MISSING | warning | Subscriber coverage without a coverage level |
| DTP-348 | error | No benefit begin date |
| RETRO | warning | Coverage begins more than `max_retro_days` before the file date |
| FUTURE | warning | Coverage begins more than `max_future_days` after the file date |
| TERM-NO-END | error | Termination without a benefit end date |
| END-BEFORE-BEGIN | error | End date before begin date |
| END-ON-ACTIVE | info | End date on coverage not marked as terminated |
| DTP-FORMAT | error | Date format other than D8 or RD8 |
| DTP-DATE | error | Date value that is not a real calendar date |
| TIER-MISMATCH | warning | Employee-only tier with dependents enrolled on the same line |

## compare_834 change types

| Type | Severity | Meaning |
|---|---|---|
| member_missing | error | Active member absent from a full file (possible unintended termination) |
| coverage_missing | warning | Active coverage absent from a full file |
| coverage_terminated | warning | Coverage terminated in the new file |
| begin_date_changed | warning | Benefit begin date changed |
| birth_date_changed | warning | Birth date changed (values not shown) |
| member_added | info | New member |
| coverage_added | info | New coverage line |
| coverage_level_changed | info | Tier changed |
| plan_changed | info | Plan code changed |
| gender_changed / last_name_changed | info | Demographic change (values not shown) |
| member_not_in_change_file | info | Not in a change-only file (normal) |
