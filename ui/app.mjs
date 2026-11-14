// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Browser UI for edi-834-mcp. Uses the same pure functions as the MCP server,
// so results match the validate_834, compare_834, summarize_834 and
// explain_834_code tools. Files are read with FileReader and never leave the
// browser; this script makes no network calls.

import { validate834 } from '../src/validator.mjs';
import { summarize834, compare834 } from '../src/summary.mjs';
import { workdayHint } from '../src/workday.mjs';
import { explainCode } from '../src/explain.mjs';
import { CODE_TABLES } from '../src/codes.mjs';
import { SAMPLES } from './samples.mjs';

const $ = (id) => document.getElementById(id);
const MAX_MB = 50;

// ─── Tiny DOM helper: text always goes through textContent ──────────────────
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

// ─── Tabs ────────────────────────────────────────────────────────────────────
const VIEWS = ['validate', 'compare', 'explain'];
function showView(name) {
  for (const v of VIEWS) {
    $(`tab-${v}`).setAttribute('aria-selected', String(v === name));
    $(`view-${v}`).hidden = v !== name;
  }
}
for (const v of VIEWS) $(`tab-${v}`).addEventListener('click', () => showView(v));

// ─── File pickers ────────────────────────────────────────────────────────────
const files = { main: null, old: null, new: null };

function readFile(file) {
  return new Promise((resolve, reject) => {
    if (file.size > MAX_MB * 1024 * 1024) return reject(new Error(`This file is larger than ${MAX_MB} MB.`));
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error('The file could not be read.'));
    r.readAsText(file);
  });
}

function setLoaded(slot, name, text) {
  files[slot] = { name, text };
  const drop = $(`drop-${slot}`);
  drop.classList.add('loaded');
  const kb = Math.max(1, Math.round(text.length / 1024));
  drop.replaceChildren(h('strong', {}, name), `${kb} KB · tap to change`);
}

function wireDrop(slot) {
  const drop = $(`drop-${slot}`);
  const input = $(`file-${slot}`);
  const load = async (file) => {
    if (!file) return;
    try { setLoaded(slot, file.name, await readFile(file)); }
    catch (err) { showError(slot === 'main' ? 'validate' : 'compare', err.message); }
  };
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); input.click(); } });
  input.addEventListener('change', () => { load(input.files[0]); input.value = ''; });
  drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); load(ev.dataTransfer.files[0]); });
}
['main', 'old', 'new'].forEach(wireDrop);

for (const btn of document.querySelectorAll('[data-sample]')) {
  btn.addEventListener('click', () => {
    const s = SAMPLES[btn.dataset.sample];
    setLoaded('main', s.name, s.text());
    $('paste-main').value = '';
    runValidate();
  });
}
$('sample-compare').addEventListener('click', () => {
  setLoaded('old', SAMPLES.previous.name, SAMPLES.previous.text());
  setLoaded('new', SAMPLES.current.name, SAMPLES.current.text());
  runCompare();
});

// ─── Carrier profile ─────────────────────────────────────────────────────────
let profile = {};
$('profile-pick').addEventListener('change', (ev) => {
  if (ev.target.value === '__file') $('file-profile').click();
  else profile = {};
});
$('file-profile').addEventListener('change', async (ev) => {
  const file = ev.target.files[0];
  ev.target.value = '';
  const pick = $('profile-pick');
  if (!file) { pick.value = profile.name ? 'custom' : ''; return; }
  try {
    profile = JSON.parse(await readFile(file));
    let opt = pick.querySelector('option[value="custom"]');
    if (!opt) { opt = h('option', { value: 'custom' }); pick.insertBefore(opt, pick.lastElementChild); }
    opt.textContent = profile.name || file.name;
    pick.value = 'custom';
  } catch {
    profile = {};
    pick.value = '';
    showError('validate', 'That profile is not valid JSON. See examples/carrier-profile.example.json in the repo.');
  }
});

// ─── Errors ──────────────────────────────────────────────────────────────────
function showError(view, message, suggestion) {
  const box = $(`${view}-error`);
  box.hidden = !message;
  box.replaceChildren(message ? h('span', {}, message, suggestion ? h('div', { class: 'f-fix', style: 'margin-top:4px' }, suggestion) : null) : '');
}

// ─── Validate ────────────────────────────────────────────────────────────────
let lastReport = null;

function runValidate() {
  showError('validate', null);
  const pasted = $('paste-main').value.trim();
  const source = pasted ? { name: 'Pasted text', text: pasted } : files.main;
  if (!source) { showError('validate', 'Choose a file, paste its contents, or try a sample first.'); return; }
  const platform = $('platform').value;
  const showPii = $('show-pii').checked;
  try {
    const result = validate834(source.text, { profile, showPii });
    const summary = summarize834(source.text);
    if (platform === 'workday_ccb_834_v2') {
      result.findings = result.findings.map(f => ({ ...f, where_to_fix: workdayHint(f.rule) }));
    }
    lastReport = { file: source.name, platform, result, summary };
    renderValidate(lastReport);
  } catch (err) {
    $('validate-results').replaceChildren();
    showError('validate', `This doesn't look like a readable 834 file. ${err.message}`, err.suggestion);
  }
}
$('run-validate').addEventListener('click', runValidate);

const SEV_LABEL = { error: 'Error', warning: 'Warning', info: 'Info' };
let filter = 'all';
let query = '';

function renderValidate({ file, platform, result, summary }) {
  const { counts } = result;
  const verdict = counts.error ? ['b-error', 'Not ready to send'] : counts.warning ? ['b-warning', 'Review warnings before sending'] : ['b-ok', 'Ready to send'];
  const tx = summary.transactions[0] || {};
  const ic = summary.interchange || {};

  const report = h('div', { class: 'card' },
    h('div', { class: 'verdict' },
      h('div', {}, h('h2', { style: 'margin:0' }, 'Validation report'), h('div', { class: 'muted' }, file, ' · ', result.profile)),
      h('span', { class: `badge ${verdict[0]}` }, verdict[1]),
    ),
    h('div', { class: 'metrics' },
      metric('Members', result.members.toLocaleString()),
      metric('Errors', counts.error, 'var(--err)'),
      metric('Warnings', counts.warning, 'var(--warn)'),
      metric('Info', counts.info, 'var(--info)'),
    ),
    h('dl', { class: 'kv' },
      kv('File type', tx.action), kv('File date', fmtD8(tx.file_date)), kv('Sponsor', tx.sponsor), kv('Payer', tx.payer),
      kv('Sender → receiver', ic.sender ? `${ic.sender.trim()} → ${ic.receiver.trim()}` : null),
      kv('Usage', ic.usage), kv('Subscribers / dependents', tx.subscribers !== undefined ? `${tx.subscribers} / ${tx.dependents}` : null),
      kv('Terminations', tx.terminations),
    ),
    h('div', { class: 'row', style: 'margin-top:12px' },
      h('button', { class: 'btn', onclick: (ev) => copyText(ev.currentTarget, reportText(lastReport)) }, 'Copy report'),
      canDownload() ? h('button', { class: 'btn', onclick: () => download(`${baseName(file)}-findings.csv`, reportCsv(lastReport), 'text/csv') }, 'Download CSV') : null,
    ),
  );

  const lines = Object.entries(tx.coverage_lines || {});
  const coverage = lines.length ? h('div', { class: 'card' },
    h('h2', {}, 'Coverage in this file'),
    barList(Object.fromEntries(lines.map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)]))),
    Object.keys(tx.coverage_levels || {}).length ? [h('div', { class: 'muted', style: 'margin:12px 0 6px' }, 'Coverage levels'), barList(tx.coverage_levels)] : null,
  ) : null;

  const list = h('div', { id: 'finding-list' });
  const findingsCard = h('div', { class: 'card' },
    h('h2', {}, `Findings (${result.findings.length})`),
    result.findings.length ? [
      h('div', { class: 'chips' },
        ...['all', 'error', 'warning', 'info'].map(s => h('button', {
          class: 'chip', 'aria-pressed': String(filter === s),
          onclick: (ev) => { filter = s; ev.currentTarget.parentNode.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c === ev.currentTarget))); drawFindings(list, result.findings, platform); },
        }, s === 'all' ? 'All' : `${s === 'info' ? 'Info' : SEV_LABEL[s] + 's'} (${counts[s]})`)),
      ),
      h('input', { type: 'text', placeholder: 'Search rule, segment or message', style: 'width:100%;margin-bottom:6px', value: query,
        oninput: (ev) => { query = ev.target.value.toLowerCase(); drawFindings(list, result.findings, platform); } }),
    ] : null,
    list,
  );
  drawFindings(list, result.findings, platform);

  $('validate-results').replaceChildren(report, findingsCard, coverage || '');
  report.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawFindings(list, findings, platform) {
  if (!findings.length) {
    list.replaceChildren(h('div', { class: 'empty' }, 'No problems found. This file passes every rule in the selected profile.'));
    return;
  }
  const shown = findings.filter(f => (filter === 'all' || f.severity === filter) &&
    (!query || `${f.rule} ${f.segment?.id || ''} ${f.message} ${f.fix}`.toLowerCase().includes(query)));
  if (!shown.length) { list.replaceChildren(h('div', { class: 'empty' }, 'No findings match this filter.')); return; }
  list.replaceChildren(...shown.map(f => h('div', { class: 'finding' },
    h('div', { class: 'f-head' },
      h('span', { class: `badge b-${f.severity}` }, SEV_LABEL[f.severity]),
      h('span', { class: 'rule' }, f.rule, f.segment ? ` · segment ${f.segment.position} (${f.segment.id})` : ''),
    ),
    h('div', { class: 'f-msg' }, f.message),
    f.fix ? h('div', { class: 'f-fix' }, h('b', {}, 'Fix: '), f.fix) : null,
    platform === 'workday_ccb_834_v2' && f.where_to_fix ? h('div', { class: 'f-wd' },
      h('div', {}, h('b', {}, 'Where in Workday: '), f.where_to_fix.where),
      h('div', { class: 'f-fix', style: 'margin-top:2px' }, f.where_to_fix.how),
    ) : null,
  )));
}

// ─── Compare ─────────────────────────────────────────────────────────────────
const CHANGE_LABEL = {
  member_missing: 'Member missing', member_added: 'Member added', member_not_in_change_file: 'Not in change file',
  coverage_added: 'Coverage added', coverage_terminated: 'Coverage terminated', coverage_missing: 'Coverage missing',
  coverage_level_changed: 'Tier changed', plan_changed: 'Plan changed', begin_date_changed: 'Begin date changed',
  birth_date_changed: 'Birth date changed', gender_changed: 'Gender changed', last_name_changed: 'Last name changed',
};

function runCompare() {
  showError('compare', null);
  if (!files.old || !files.new) { showError('compare', 'Choose both the previous file and the new file, or load the samples.'); return; }
  try {
    const r = compare834(files.old.text, files.new.text, { showPii: $('show-pii-cmp').checked });
    renderCompare(r);
  } catch (err) {
    $('compare-results').replaceChildren();
    showError('compare', `One of the files could not be read as an 834. ${err.message}`, err.suggestion);
  }
}
$('run-compare').addEventListener('click', runCompare);

function renderCompare(r) {
  const sev = { error: 0, warning: 0, info: 0 };
  r.changes.forEach(c => sev[c.severity]++);
  const card = h('div', { class: 'card' },
    h('div', { class: 'verdict' },
      h('h2', { style: 'margin:0' }, 'What changed'),
      h('span', { class: `badge ${sev.error ? 'b-error' : sev.warning ? 'b-warning' : 'b-ok'}` },
        sev.error ? 'Possible coverage loss' : sev.warning ? 'Review before sending' : 'No risky changes'),
    ),
    h('div', { class: 'metrics' },
      metric('Previous members', r.old_file.members), metric('New members', r.new_file.members),
      metric('Risky', sev.error, 'var(--err)'), metric('To review', sev.warning, 'var(--warn)'),
    ),
    h('p', { class: 'muted', style: 'margin:0 0 6px' }, r.note),
    r.changes.length
      ? r.changes.map(c => h('div', { class: 'finding' },
          h('div', { class: 'f-head' }, h('span', { class: `badge b-${c.severity}` }, CHANGE_LABEL[c.type] || c.type), h('span', { class: 'rule' }, c.member)),
          h('div', { class: 'f-msg' }, c.detail)))
      : h('div', { class: 'empty' }, 'The two files describe the same members and coverage.'),
  );
  $('compare-results').replaceChildren(card);
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ─── Explain ─────────────────────────────────────────────────────────────────
const tableSel = $('code-table');
for (const [key, t] of Object.entries(CODE_TABLES)) {
  tableSel.append(h('option', { value: key }, `${key.replace(/_/g, ' ')} (${t.element})`));
}
tableSel.value = 'maintenance_type';
function runExplain() {
  const r = explainCode(tableSel.value, $('code-value').value.trim());
  const out = $('explain-results');
  if (r.codes) {
    out.replaceChildren(h('dl', { class: 'kv' }, ...Object.entries(r.codes).flatMap(([k, v]) => [h('dt', { class: 'rule' }, k), h('dd', {}, v)])));
  } else if (r.found) {
    out.replaceChildren(h('div', {}, h('span', { class: 'rule' }, `${r.element} = ${r.code}`), h('div', { style: 'font-size:18px;margin-top:2px' }, r.meaning)));
  } else {
    out.replaceChildren(h('div', { class: 'error-box' }, r.message));
  }
}
$('run-explain').addEventListener('click', runExplain);
$('code-value').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') runExplain(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function metric(label, value, color) {
  return h('div', { class: 'metric' }, h('span', {}, label), h('b', { style: color ? `color:${color}` : null }, value));
}
function kv(k, v) { return v === null || v === undefined || v === '' ? [] : [h('dt', {}, k), h('dd', {}, String(v))]; }
function barList(obj) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]), 1);
  return h('div', { class: 'bars' }, ...entries.map(([k, v]) => h('div', { class: 'bar' },
    h('span', {}, k), h('u', {}, h('i', { style: `width:${Math.round(v / max * 100)}%` })), h('b', { style: 'text-align:right' }, v))));
}
function fmtD8(d) { return /^\d{8}$/.test(d || '') ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d; }
function baseName(n) { return (n || 'file').replace(/\.[^.]+$/, '').replace(/[^\w.-]+/g, '-'); }

function reportText({ file, result }) {
  const lines = [
    `EDI 834 validation report: ${file}`,
    `Profile: ${result.profile}`,
    `Members: ${result.members} · Errors: ${result.counts.error} · Warnings: ${result.counts.warning} · Info: ${result.counts.info}`,
    '',
  ];
  for (const f of result.findings) {
    lines.push(`[${f.severity.toUpperCase()}] ${f.rule}${f.segment ? ` (segment ${f.segment.position} ${f.segment.id})` : ''}`);
    lines.push(`  ${f.message}`);
    if (f.fix) lines.push(`  Fix: ${f.fix}`);
    if (f.where_to_fix) lines.push(`  Workday: ${f.where_to_fix.where}`);
  }
  if (!result.findings.length) lines.push('No problems found.');
  return lines.join('\n');
}
function reportCsv({ result }) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['severity', 'rule', 'segment_position', 'segment_id', 'message', 'fix', 'workday_where', 'workday_how']];
  for (const f of result.findings) rows.push([f.severity, f.rule, f.segment?.position, f.segment?.id, f.message, f.fix, f.where_to_fix?.where, f.where_to_fix?.how]);
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
async function copyText(btn, text) {
  const old = btn.textContent;
  try { await navigator.clipboard.writeText(text); btn.textContent = 'Copied'; }
  catch { btn.textContent = 'Copy failed'; }
  setTimeout(() => { btn.textContent = old; }, 1600);
}
// Hosted single-file builds set window.EDI834_NO_DOWNLOAD, where downloads are blocked.
function canDownload() { return !window.EDI834_NO_DOWNLOAD; }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
