# 834 structure and what this tool checks

The 834 (Benefit Enrollment and Maintenance, functional group `BE`, version 005010X220A1) carries enrollment from a plan sponsor to a payer. This page maps its basic loop structure to the rules in [rules.md](rules.md). Carriers can require more loops than shown here; their companion guide is the final word.

Usage: **R** required, **S** situational (send when it applies). Max is the number of times the segment may appear in one occurrence of its loop.

## Envelope

| Segment | Name | Usage | Checked by |
|---|---|---|---|
| ISA / IEA | Interchange header and trailer | R | ENV-ISA-FIELDS, ENV-IEA-MISSING, ENV-CONTROL-ISA, ENV-COUNT-GS, ENV-TEST-FILE |
| GS / GE | Functional group header and trailer (GS01 = BE) | R | ENV-GS-MISSING, ENV-GS01, ENV-VERSION, ENV-GE-MISSING, ENV-CONTROL-GS, ENV-COUNT-ST |
| ST / SE | Transaction set header and trailer | R | ENV-ST01, ENV-SE-MISSING, ENV-CONTROL-ST, ENV-SEGMENT-COUNT |

## Heading

| Loop | Segment | Name | Usage | Max | Checked by |
|---|---|---|---|---|---|
| | BGN | Beginning segment (purpose, reference, date, action code) | R | 1 | HDR-BGN-MISSING, HDR-BGN01, HDR-BGN-DATE, HDR-BGN08, HDR-FULL-REPLACE, HDR-FILE-TYPE |
| | REF | Transaction set policy number | S | 1 | SEG-MAX-USE |
| | DTP | File effective date | S | >1 | DTP-FORMAT, DTP-DATE |
| 1000A | N1*P5 | Sponsor name | R | 1 | HDR-SPONSOR |
| 1000B | N1*IN | Payer | R | 1 | HDR-PAYER |
| 1000C | N1 | TPA or broker name (loop repeats up to 2) | S | 1 | SEG-MAX-USE |
| 1100C | ACT | TPA or broker account information | S | 1 | |

## Detail: one member (loop 2000, repeats for every subscriber and dependent)

| Loop | Segment | Name | Usage | Max | Checked by |
|---|---|---|---|---|---|
| 2000 | INS | Member level detail (subscriber flag, relationship, maintenance, status, employment) | R | 1 | HDR-NO-MEMBERS, INS01, INS02, INS-SELF, INS03, INS04, INS05, INS08, INS08-MISSING, INS-TERM-ACTIVE, DUP-SUBSCRIBER, DEP-ORPHAN |
| 2000 | REF*0F | Subscriber identifier | R | 1 | REF-0F |
| 2000 | REF*1L | Member policy number (group number) | S | 1 | REF-1L *(profile)* |
| 2000 | REF*17 etc. | Member supplemental identifier | S | 13 | SEG-MAX-USE |
| 2000 | DTP | Member level dates (employment, eligibility, maintenance effective) | S | 24 | DTP-FORMAT, DTP-DATE, SEG-MAX-USE |
| 2100A | NM1*IL | Member name and ID (SSN) | R | 1 | NM1-MISSING, NM1-LAST, NM1-FIRST, NM1-ID, SSN-INVALID, SSN-REQUIRED *(profile)* |
| 2100A | PER | Member communications numbers | S | 1 | |
| 2100A | N3 / N4 | Member residence street and city, state, ZIP | S / R | 1 | ADDR-STREET, ADDR-N3-MISSING, ADDR-N4-MISSING, ADDR-CITY, ADDR-STATE, ADDR-ZIP |
| 2100A | DMG | Member demographics (birth date, gender) | S | 1 | DMG-MISSING, DMG-DOB, DMG-DOB-FUTURE, DMG-GENDER, DEP-AGE |
| 2100A | AMT | Member policy amounts | S | 7 | SEG-MAX-USE |
| 2100C | NM1*31, N3, N4 | Member mailing address | S | 1 | ADDR-* (same rules as the residence address) |
| 2200 | DSB, DTP | Disability information and eligibility dates (loop repeats) | S | 1 / 2 | DTP-FORMAT, DTP-DATE |
| 2300 | HD | Health coverage (maintenance, insurance line, plan, coverage level); loop repeats up to 99 | S | 1 | NO-COVERAGE, HD01, HD03-MISSING, HD03, HD03-PROFILE, HD05, HD05-MISSING, HD05-PROFILE, TIER-MISMATCH, SEG-MAX-USE |
| 2300 | DTP | Health coverage dates (348 begin, 349 end, 303 maintenance effective...) | R | 6 | DTP-348, DTP-FORMAT, DTP-DATE, END-BEFORE-BEGIN, RETRO, FUTURE, TERM-NO-END, END-ON-ACTIVE, SEG-MAX-USE |
| 2300 | AMT | Health coverage policy amounts | S | 9 | SEG-MAX-USE |
| 2300 | REF | Health coverage policy number | S | 14 | SEG-MAX-USE |

Every segment is also checked against the 834 segment list (SEG-UNKNOWN) and element length limits (ELEM-LENGTH).

## Reference

- ASC X12 005010X220A1 Benefit Enrollment and Maintenance (834) implementation guide, distributed by [X12](https://x12.org) (formerly through Washington Publishing Company).
- [Sample 834 structure (Workday Community)](https://community-content.workday.com/en-us/public/products/human-capital-management/cloud-connect-for-benefits/sample-834-structure.html)
