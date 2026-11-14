// Regenerates docs/employee-navigator.md from src/employee-navigator.mjs. Run: npm run docs
import { writeFileSync } from 'node:fs';
import { EN_HINTS, EN_NAME } from '../src/employee-navigator.mjs';

const cell = (v) => v.replace(/\|/g, '\\|');
let md = `# ${EN_NAME}

How to use this MCP and the web UI with 834 files from ${EN_NAME}'s 834 EDI configuration (Home > Admin Only > 834 EDI).

> Screen and field names follow ${EN_NAME}'s public documentation and carrier setup guides. They can differ by release and license; confirm them in your instance.

## What is different about ${EN_NAME} files

- **Full files only.** The EDI engine sends full files for medical, dental, vision and Rx plans. It does not send change-only files or HSA enrollments. With \`platform: "employee_navigator"\`, a file that is not a full file is flagged (rule HDR-FILE-TYPE).
- **Terminations by omission.** In a full file, anyone left out may be terminated by the carrier. Run \`compare_834\` against the previous file before every send.
- **${EN_NAME} is the source of truth.** A fix made only in the carrier's portal is overwritten by the next file. Fix the record in ${EN_NAME}.
- **Default Values win.** On the Fields step, a field's Default Value is sent regardless of its mapping rules. Stray defaults are a common cause of wrong plan or tier codes.

## Where to fix each finding

With \`platform: "employee_navigator"\`, every \`validate_834\` finding carries this location.

| Rule | Where in ${EN_NAME} | What to do |
|---|---|---|
`;
for (const [k, h] of Object.entries(EN_HINTS)) md += `| ${k} | ${cell(h.where)} | ${cell(h.how)} |\n`;
md += `
## References

- [EDI 834 (Employee Navigator Marketplace)](https://www.employeenavigator.com/marketplace/product/edi-834-)

Employee Navigator is a trademark of its owner. This project is not affiliated with or endorsed by Employee Navigator.
`;
writeFileSync(new URL('../docs/employee-navigator.md', import.meta.url), md);
