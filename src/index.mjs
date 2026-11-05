#!/usr/bin/env node
// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// EDI 834 MCP server: validates, summarizes and compares HIPAA X12 834
// benefit enrollment files locally. No network calls; PII masked by default.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

import { validate834, DEFAULT_PROFILE } from './validator.mjs';
import { summarize834, compare834 } from './summary.mjs';
import { explainCode } from './explain.mjs';
import { CODE_TABLES } from './codes.mjs';
import { readEdiFile, readJson, baseDir } from './files.mjs';

const VERSION = '0.1.0';
const server = new McpServer({ name: 'edi-834-mcp', version: VERSION });

const profileSchema = z.object({
  name: z.string().optional(),
  allowed_insurance_lines: z.array(z.string()).nullable().optional(),
  allowed_coverage_levels: z.array(z.string()).nullable().optional(),
  require_group_number: z.boolean().optional(),
  require_ssn: z.boolean().optional(),
  max_retro_days: z.number().optional(),
  max_future_days: z.number().optional(),
  dependent_age_limit: z.number().optional(),
}).partial();

const source = {
  file_path: z.string().optional().describe('Path of the 834 file relative to EDI_834_DIR (preferred: the data never enters the conversation).'),
  content: z.string().optional().describe('Raw 834 text, if the file is not on disk. Avoid pasting production data.'),
};

async function loadSource({ file_path, content }) {
  if (file_path) return readEdiFile(file_path);
  if (content) return content;
  const err = new Error('Provide file_path or content.');
  err.code = 'NO_INPUT';
  throw err;
}

function ok(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 2) }] };
}
function fail(e) {
  return { content: [{ type: 'text', text: JSON.stringify({ error: true, code: e.code || 'ERROR', message: e.message, suggestion: e.suggestion || null }) }] };
}

server.tool(
  'validate_834',
  [
    'Validate a HIPAA X12 005010X220A1 (834) benefit enrollment file before it goes to a carrier.',
    'Checks the envelope (ISA/GS/ST counts and control numbers), header (BGN, sponsor, payer),',
    'every member (relationship, maintenance codes, subscriber ID, SSN structure, birth date, age',
    'limits) and every coverage (insurance line, coverage tier, begin/end dates, retro and future',
    'dates, terminations without end dates, employee-only tiers with dependents enrolled).',
    'Each finding has a rule ID, severity, segment position, plain-English message and fix.',
    'Names, SSNs and birth dates are never included unless show_pii=true.',
    'Pass a carrier profile (inline or profile_path) to apply companion-guide rules.',
  ].join('\n'),
  {
    ...source,
    profile: profileSchema.optional().describe('Carrier companion-guide rules. See README "Carrier profiles".'),
    profile_path: z.string().optional().describe('JSON profile file relative to EDI_834_DIR, e.g. "profiles/acme-health.json".'),
    show_pii: z.boolean().optional().describe('Include member names in messages. Default false.'),
    max_findings: z.number().int().positive().optional().describe('Limit findings returned (errors first). Default 200.'),
  },
  async (args) => {
    try {
      const raw = await loadSource(args);
      const profile = args.profile_path ? await readJson(args.profile_path) : (args.profile || {});
      const r = validate834(raw, { profile, showPii: !!args.show_pii });
      const limit = args.max_findings || 200;
      return ok({ ...r, findings: r.findings.slice(0, limit), findings_truncated: r.findings.length > limit });
    } catch (e) { return fail(e); }
  },
);

server.tool(
  'summarize_834',
  'Summarize an 834 file without PII: sender/receiver, file date, full vs change file, sponsor and payer, member/subscriber/dependent counts, actions (adds, changes, terminations) and coverage lines and tiers.',
  { ...source },
  async (args) => {
    try { return ok(summarize834(await loadSource(args))); } catch (e) { return fail(e); }
  },
);

server.tool(
  'compare_834',
  [
    'Compare two 834 files for the same group (e.g. last week\'s and this week\'s) and report what changed:',
    'members added or missing, coverages added, terminated or missing, tier and plan changes,',
    'begin-date and demographic changes. When the new file is a full file (BGN08 RX or 4), members or',
    'coverages missing from it are flagged as potential unintended terminations — the most common',
    'cause of coverage gaps.',
  ].join('\n'),
  {
    old_file: z.string().describe('Earlier file, relative to EDI_834_DIR'),
    new_file: z.string().describe('Later file, relative to EDI_834_DIR'),
    show_pii: z.boolean().optional().describe('Include member names. Default false.'),
  },
  async ({ old_file, new_file, show_pii }) => {
    try {
      return ok(compare834(await readEdiFile(old_file), await readEdiFile(new_file), { showPii: !!show_pii }));
    } catch (e) { return fail(e); }
  },
);

server.tool(
  'explain_834_code',
  `Explain an 834 code, or list a whole code table. Tables: ${Object.keys(CODE_TABLES).join(', ')}.`,
  {
    table: z.enum(Object.keys(CODE_TABLES)).describe('Which code list'),
    code: z.string().optional().describe('The code to look up. Omit to list the table.'),
  },
  async ({ table, code }) => ok(explainCode(table, code)),
);

server.tool(
  'get_default_profile',
  'Show the baseline validation settings that a carrier profile can override.',
  {},
  async () => ok(DEFAULT_PROFILE),
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`[edi-834-mcp ${VERSION}] started. Files: ${baseDir() || '(EDI_834_DIR not set — only inline content can be checked)'}\n`);
