# Working on this repo

EDI 834 MCP: a local MCP server that validates, compares, summarizes and explains HIPAA X12 834 files.

## Layout

- `src/parser.mjs`: delimiter detection, segment parsing (1-based positions), member/coverage model
- `src/codes.mjs`: 005010X220A1 code lists
- `src/validator.mjs`: rules; every finding = `{ severity, rule, segment, message, fix }`
- `src/summary.mjs`: `summarize834` and `compare834`
- `src/mask.mjs`: member labels without PII
- `src/files.mjs`: reads only inside `EDI_834_DIR`
- `src/workday.mjs`: Workday CCB 834 V2 setup guide, service chooser, and a fix location for every rule
- `src/index.mjs`: MCP tool wiring only, no logic
- `docs/rules.md`: rule catalog. Keep it in sync with the validator.

## Rules for changes

- Logic stays in pure functions that take raw text and return plain objects, so tests need no server or files.
- Never put names, SSNs, birth dates or addresses in a message unless `showPii` is set. SSNs and birth dates never appear, even with it.
- A new rule needs: a stable ID, a plain-English message that says what is wrong, a `fix`, an entry in `docs/rules.md`, a test that fires on bad input, and the clean baseline test must stay at zero findings.
- Carrier-specific behavior goes behind a profile option with a neutral default.
- No network calls. No new dependencies without a strong reason.
- Test data comes only from `test/fixtures/build834.mjs` (fictional people). Never commit real files.

Every validator rule also needs an entry in `WORKDAY_HINTS` (a test enforces it). After changing `src/workday.mjs`, run `npm run docs` to regenerate `docs/workday-ccb-834-v2.md`.

Run `npm test` before every commit.
