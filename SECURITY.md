# Security and privacy

834 files contain protected health information (PHI) and personally identifiable information (PII): names, Social Security numbers, birth dates, addresses and coverage details.

## How the server handles data

- **Local only.** The server makes no network calls. It reads files from disk and returns results to the MCP client on the same machine.
- **Confined to one folder.** Files are read only from the folder in `EDI_834_DIR`. Any path that resolves outside it is refused.
- **Masked output.** Members are identified by position, relationship and the last four characters of the subscriber ID. Names are included only when `show_pii` is set. SSNs, birth dates and addresses are never returned, even with `show_pii`.
- **Read-only.** The server does not modify, move or transmit files.

## What you are responsible for

- The results of a tool call go to the AI model you are using. Masking keeps identifiers out of results, but use `show_pii` only with test data or where your organization's policies allow it.
- Avoid the `content` parameter (pasting file text) for production files: pasted content enters the conversation. Use `file_path` instead.
- Never commit real 834 files to this or any repository. Use the synthetic builder in `test/fixtures/build834.mjs` for examples and tests.
- Follow your organization's HIPAA and data-handling policies.

## Reporting a vulnerability

Please report security issues privately through GitHub's "Report a vulnerability" (Security tab) rather than a public issue.
