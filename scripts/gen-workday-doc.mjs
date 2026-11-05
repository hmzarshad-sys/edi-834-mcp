// Regenerates docs/workday-ccb-834-v2.md from src/workday.mjs. Run: npm run docs
import { writeFileSync } from 'node:fs';
import { setupGuide, WORKDAY_HINTS, SERVICES, WORKDAY_TEMPLATE } from '../src/workday.mjs';
const g = setupGuide();
let md = `# Workday: ${WORKDAY_TEMPLATE}\n\nHow to set up Workday's 834 V2 connector and use this MCP to test its output. The same content is available from the \`workday_834_setup_guide\` tool.\n\n> ${g.note}\n\n`;
for (const s of g.sections) {
  md += `## ${s.title}\n\n` + s.steps.map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n';
  if (s.pitfalls.length) md += '\n**Watch out:**\n\n' + s.pitfalls.map(x => `- ${x}`).join('\n') + '\n';
  md += '\n';
}
md += `## Transmission services at a glance\n\n| Carrier wants | Service |\n|---|---|\n| Only changes since the last file | ${SERVICES.changes_only} |\n| Full file, terminates by omission | ${SERVICES.actives_only} |\n| Full file, terminations repeated within a look-back window | ${SERVICES.full_file} |\n| Full file, each termination reported once | ${SERVICES.full_report_all_ended_once} |\n| Full file, terminations only when a whole plan type ends | ${SERVICES.full_ended_once_by_plan_type} |\n\n`;
md += `## Where to fix each finding\n\nWith \`platform: "workday_ccb_834_v2"\`, every \`validate_834\` finding carries this location.\n\n| Rule | Where in Workday | What to do |\n|---|---|---|\n`;
for (const [k, h] of Object.entries(WORKDAY_HINTS)) md += `| ${k} | ${h.where.replace(/\|/g, '\\|')} | ${h.how.replace(/\|/g, '\\|')} |\n`;
md += `\n## References\n\n- [ANSI X12 834 V2 Template (Workday Community)](https://community-content.workday.com/content/workday-community/en-us/reference/products/human-capital-management/cloud-connect-for-benefits/ansi-x12-834-v2-template.html)\n- [Cloud Connect for Benefits (Workday Community)](https://community-content.workday.com/content/workday-community/en-us/public/products/human-capital-management/cloud-connect-for-benefits.html)\n\nWorkday is a trademark of Workday, Inc. This project is not affiliated with or endorsed by Workday.\n`;
writeFileSync(new URL('../docs/workday-ccb-834-v2.md', import.meta.url), md);
