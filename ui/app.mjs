// Copyright (c) 2026 Humza Arshad. MIT License (see LICENSE).
//
// Browser UI for edi-834-mcp. Uses the same pure functions as the MCP server,
// so results match the validate_834, compare_834, summarize_834 and
// explain_834_code tools. Files are read with FileReader and never leave the
// browser; this script makes no network calls.

import { validate834 } from '../src/validator.mjs';
import { summarize834, compare834 } from '../src/summary.mjs';
import { PLATFORMS, platformProfile, withFixLocations } from '../src/platforms.mjs';
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

// ─── Icons (inline SVG, no network) ─────────────────────────────────────────
const ICONS = {
  check: 'M5 12.5l4.5 4.5L19 7.5',
  alert: 'M12 8v5M12 16.5v.01M10.3 3.9L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
  x: 'M7 7l10 10M17 7L7 17',
  copy: 'M9 9h10v10H9zM5 15V5h10',
  download: 'M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14',
  chevron: 'M9 6l6 6-6 6',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5',
};
function icon(name, cls) {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (cls) svg.setAttribute('class', cls);
  const path = document.createElementNS(NS, 'path'); path.setAttribute('d', ICONS[name]); svg.append(path);
  return svg;
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

// ─── Source system menu ──────────────────────────────────────────────────────
for (const [id, p] of Object.entries(PLATFORMS)) $('platform').append(h('option', { value: id }, p.label));

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
  drop.replaceChildren(icon('file'), h('span', {}, h('span', { class: 'drop-title' }, name), h('span', { class: 'drop-sub' }, `${kb} KB. Select to replace.`)));
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
  box.replaceChildren(message ? h('span', {}, message, suggestion ? h('small', {}, suggestion) : null) : '');
}

// ─── Validate ────────────────────────────────────────────────────────────────
let lastReport = null;
const ui = { tab: 'records', sev: 'all', query: '', rec: 'all', open: -1 };

function runValidate() {
  showError('validate', null);
  const pasted = $('paste-main').value.trim();
  const source = pasted ? { name: 'Pasted text', text: pasted } : files.main;
  if (!source) { showError('validate', 'Add a file first.', 'Drop an 834 file, paste its contents, or try a sample file.'); return; }
  const platform = $('platform').value;
  try {
    const result = validate834(source.text, { profile: platformProfile(platform, profile), showPii: $('show-pii').checked });
    result.findings = withFixLocations(result.findings, platform);
    const summary = summarize834(source.text);
    lastReport = { file: source.name, platform, result, summary };
    Object.assign(ui, { tab: result.counts.error || result.counts.warning ? 'records' : 'records', sev: 'all', query: '', rec: 'all', open: -1 });
    renderValidate();
    $('validate-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showError('validate', `This file could not be read as an 834. ${err.message}`, err.suggestion);
  }
}
$('run-validate').addEventListener('click', runValidate);

const SEV = { error: 'Error', warning: 'Warning', info: 'Info' };
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function renderValidate() {
  const { file, platform, result, summary } = lastReport;
  const { counts } = result;
  const tx = combineTransactions(summary.transactions);
  const ic = summary.interchange || {};
  const payer = tx.payer || 'the carrier';
  const v = counts.error
    ? ['v-error', 'x', 'Not ready to send', `${plural(counts.error, 'error')} must be fixed before this file goes to ${payer}.`]
    : counts.warning
      ? ['v-warning', 'alert', 'Review before sending', `No errors. ${plural(counts.warning, 'warning')} should be checked first.`]
      : ['v-ok', 'check', 'Ready to send', 'Every record passes every check.'];
  const pct = result.members ? Math.round(result.records_correct / result.members * 100) : 0;

  const summaryPanel = h('div', { class: 'panel' },
    h('div', { class: `verdict ${v[0]}` },
      h('div', { class: 'verdict-icon' }, icon(v[1])),
      h('div', {}, h('h2', {}, v[2]), h('p', {}, v[3])),
      h('div', { class: 'verdict-actions' },
        h('button', { class: 'btn', onclick: (ev) => copyText(ev.currentTarget, reportText(lastReport)) }, icon('copy'), 'Copy report'),
        canDownload() ? h('button', { class: 'btn', onclick: () => download(`${baseName(file)}-findings.csv`, reportCsv(lastReport), 'text/csv') }, icon('download'), 'Download CSV') : null)),
    h('div', { class: 'file-line' },
      fileFact('File', file), fileFact('Type', shortAction(tx.action)), fileFact('Date', fmtD8(tx.file_date)),
      fileFact('Payer', tx.payer), fileFact('Usage', ic.usage), fileFact('Source', PLATFORMS[platform].label), fileFact('Rules', result.profile)),
    h('div', { class: 'stats' },
      stat('Members', result.members.toLocaleString()),
      stat('Correct records', result.records_correct.toLocaleString(), `${pct}%`, result.records_correct === result.members ? 'var(--ok)' : null),
      stat('Errors', counts.error, null, counts.error ? 'var(--err)' : null),
      stat('Warnings', counts.warning, null, counts.warning ? 'var(--warn)' : null),
      stat('Info', counts.info)),
    fileMap(result),
  );

  const tabs = [
    ['records', 'Records', result.records.length],
    ['findings', 'Findings', result.findings.length],
    ['details', 'File details', null],
    ['coverage', 'Coverage', null],
  ];
  const content = h('div');
  const tabbar = h('div', { class: 'tabbar', role: 'tablist' }, ...tabs.map(([id, label, n]) => h('button', {
    role: 'tab', 'aria-selected': String(ui.tab === id), onclick: () => { ui.tab = id; renderValidate(); },
  }, label, n !== null ? h('span', { class: 'count' }, n) : null)));
  const tabsPanel = h('div', { class: 'panel results', id: 'results-tabs' }, tabbar, content);

  if (ui.tab === 'records') content.append(...recordsTab(result));
  if (ui.tab === 'findings') content.append(...findingsTab(result, platform));
  if (ui.tab === 'details') content.append(detailsTab(tx, ic, summary, result));
  if (ui.tab === 'coverage') content.append(coverageTab(tx));

  $('validate-results').replaceChildren(summaryPanel, tabsPanel);
}

function fileFact(k, v) { return v ? h('span', {}, `${k}: `, h('b', {}, String(v))) : null; }
function stat(label, value, extra, color) {
  return h('div', { class: 'stat' }, h('span', {}, label), h('b', { style: color ? `color:${color}` : null }, value, extra ? h('small', {}, ` ${extra}`) : null));
}
function shortAction(a) { return a ? a.replace(/\s+—.*$/, '') : a; }

// The file map: every segment along one track, member loops shaded, findings marked.
function fileMap(result) {
  const total = Math.max(result.segment_count, 1);
  const pos = (n) => `${((n - 1) / total) * 100}%`;
  const track = h('div', { class: 'track', role: 'group', 'aria-label': 'Findings by position in the file' });
  const firstMember = result.records[0]?.position ?? total;
  track.append(h('div', { class: 'zone env', style: `left:0;width:${pos(firstMember)}`, title: 'Envelope and header' }));
  result.records.forEach((r, i) => {
    const next = result.records[i + 1]?.position ?? total;
    track.append(h('div', { class: 'zone member', style: `left:${pos(r.position)};width:${((next - r.position) / total) * 100}%`, title: r.member }));
  });
  result.findings.forEach((f, i) => {
    if (!f.segment) return;
    track.append(h('button', {
      class: `mark m-${f.severity}`, style: `left:${pos(f.segment.position)}`,
      title: `${SEV[f.severity]} ${f.rule}, segment ${f.segment.position}`, 'aria-label': `${SEV[f.severity]}: ${f.message}`,
      onclick: () => { Object.assign(ui, { tab: 'findings', sev: 'all', query: '', open: i }); renderValidate(); document.getElementById(`finding-${i}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    }));
  });
  return h('div', { class: 'map' },
    h('div', { class: 'map-head' },
      h('h3', {}, 'File map'),
      h('div', { class: 'legend' },
        h('span', {}, h('i', { style: 'background:var(--err)' }), 'Error'),
        h('span', {}, h('i', { style: 'background:var(--warn)' }), 'Warning'),
        h('span', {}, h('i', { style: 'background:var(--info)' }), 'Info'),
        h('span', {}, h('i', { style: 'background:color-mix(in srgb, var(--accent) 25%, transparent)' }), 'Member'))),
    track,
    h('div', { class: 'axis' }, h('span', {}, 'Segment 1'), h('span', {}, result.findings.some(f => f.segment) ? 'Select a mark to see the finding' : 'No findings to mark'), h('span', {}, `Segment ${total.toLocaleString()}`)));
}

function segControl(options, value, onPick) {
  return h('div', { class: 'seg', role: 'group' }, ...options.map(([id, label]) => h('button', { 'aria-pressed': String(value === id), onclick: () => onPick(id) }, label)));
}

function recordsTab(result) {
  const ok = result.records_correct, bad = result.records.length - ok;
  const rows = result.records.filter(r => ui.rec === 'all' || (ui.rec === 'correct') === (r.status === 'correct'));
  const toolbar = h('div', { class: 'toolbar' },
    segControl([['all', `All ${result.records.length}`], ['correct', `Correct ${ok}`], ['issues', `With issues ${bad}`]], ui.rec, (id) => { ui.rec = id; renderValidate(); }));
  if (!result.records.length) return [h('div', { class: 'empty' }, 'This file has no member records.')];
  if (!rows.length) return [toolbar, h('div', { class: 'empty' }, ui.rec === 'correct' ? 'No record passes every check yet. Open Findings to see what to fix.' : 'Every record passes every check.')];
  const STATUS = { correct: ['p-ok', 'Correct'], warning: ['p-warning', 'Review'], error: ['p-error', 'Fix'] };
  const table = h('table', { class: 'table' },
    h('thead', {}, h('tr', {}, h('th', {}, 'Status'), h('th', {}, 'Member'), h('th', {}, 'Coverage'), h('th', { class: 'hide-sm' }, 'Issues'))),
    h('tbody', {}, ...rows.map(r => {
      const [cls, word] = STATUS[r.status];
      const key = r.member.slice(0, r.member.indexOf('(') + 1);
      const go = r.status === 'correct' ? null : () => { Object.assign(ui, { tab: 'findings', sev: 'all', query: key.toLowerCase(), open: -1 }); renderValidate(); };
      return h('tr', { class: go ? 'clickable' : null, onclick: go, tabindex: go ? '0' : null, onkeydown: go ? (ev) => { if (ev.key === 'Enter') go(); } : null },
        h('td', {}, h('span', { class: `pill ${cls}` }, word)),
        h('td', {}, r.member, h('span', { class: 'sub' }, [r.subscriber ? 'Subscriber' : 'Dependent', r.maintenance, r.benefit_status].filter(Boolean).join(', '))),
        h('td', {}, r.coverages.length ? r.coverages.map(c => h('div', {}, [c.line, c.plan, c.level].filter(Boolean).join(' / '),
          h('span', { class: 'sub' }, c.begin ? `From ${c.begin}${c.end ? ` to ${c.end}` : ''}` : 'No begin date'))) : h('span', { class: 'sub' }, 'No coverage')),
        h('td', { class: 'hide-sm' }, r.status === 'correct'
          ? h('span', { class: 'sub', style: 'margin:0' }, 'Passes every check')
          : [h('span', {}, [r.counts.error && plural(r.counts.error, 'error'), r.counts.warning && plural(r.counts.warning, 'warning')].filter(Boolean).join(', ')),
             h('span', { class: 'sub' }, r.rules.join(', '))]),
      );
    })));
  return [toolbar, h('div', { class: 'table-wrap' }, table)];
}

function findingsTab(result, platform) {
  const { counts } = result;
  const search = h('input', { type: 'text', placeholder: 'Search rule, member or message', value: ui.query, 'aria-label': 'Search findings',
    oninput: (ev) => { ui.query = ev.target.value.toLowerCase(); ui.open = -1; draw(); } });
  const toolbar = h('div', { class: 'toolbar' },
    segControl([['all', `All ${result.findings.length}`], ['error', `Errors ${counts.error}`], ['warning', `Warnings ${counts.warning}`], ['info', `Info ${counts.info}`]], ui.sev,
      (id) => { ui.sev = id; ui.open = -1; renderValidate(); }),
    search);
  const holder = h('div');
  const system = PLATFORMS[platform].system;
  const draw = () => {
    if (!result.findings.length) { holder.replaceChildren(h('div', { class: 'empty' }, 'No findings. This file passes every rule in the selected profile.')); return; }
    const rows = result.findings.map((f, i) => [f, i]).filter(([f]) => (ui.sev === 'all' || f.severity === ui.sev) &&
      (!ui.query || `${f.rule} ${f.segment?.id || ''} ${f.message} ${f.fix}`.toLowerCase().includes(ui.query)));
    if (!rows.length) { holder.replaceChildren(h('div', { class: 'empty' }, 'No findings match this filter.')); return; }
    const tbody = h('tbody');
    for (const [f, i] of rows) {
      const open = ui.open === i;
      const toggle = () => { ui.open = open ? -1 : i; draw(); };
      tbody.append(h('tr', { class: `clickable${open ? ' open' : ''}`, id: `finding-${i}`, tabindex: '0', 'aria-expanded': String(open), onclick: toggle, onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); } } },
        h('td', { style: 'width:28px;padding-right:0' }, icon('chevron', 'chev')),
        h('td', { style: 'width:1%' }, h('span', { class: `pill p-${f.severity}` }, SEV[f.severity])),
        h('td', {}, f.message, h('span', { class: 'sub' }, h('span', { class: 'code' }, f.rule))),
        h('td', { class: 'hide-sm', style: 'white-space:nowrap' }, f.segment ? [h('span', { class: 'code' }, f.segment.id), h('span', { class: 'sub' }, `Segment ${f.segment.position}`)] : '')));
      if (open) {
        tbody.append(h('tr', { class: 'detail open' }, h('td', {}), h('td', { colspan: '3' },
          h('div', { class: 'fixbox' },
            h('div', {}, h('h4', {}, 'How to fix'), h('p', {}, f.fix || 'See the message above.')),
            f.where_to_fix ? h('div', { class: 'where' }, h('h4', {}, `Where to fix it in ${system}`), h('p', {}, f.where_to_fix.where), h('p', { class: 'sub' }, f.where_to_fix.how)) : null))));
      }
    }
    holder.replaceChildren(h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}), h('th', {}, 'Severity'), h('th', {}, 'Issue'), h('th', { class: 'hide-sm' }, 'Segment'))), tbody)));
  };
  draw();
  return [toolbar, holder];
}

function detailsTab(tx, ic, summary, result) {
  return h('dl', { class: 'kv' },
    kv('File type', tx.action), kv('File date', fmtD8(tx.file_date)), kv('Sponsor', tx.sponsor), kv('Payer', tx.payer),
    kv('Sender', ic.sender?.trim()), kv('Receiver', ic.receiver?.trim()), kv('Usage', ic.usage),
    kv('Transactions (ST/SE)', summary.transactions.length), kv('Segments', result.segment_count.toLocaleString()),
    kv('Subscribers', tx.subscribers), kv('Dependents', tx.dependents), kv('Terminations', tx.terminations),
    kv('Rules applied', result.profile));
}

function coverageTab(tx) {
  const lines = Object.entries(tx.coverage_lines || {});
  if (!lines.length) return h('div', { class: 'empty' }, 'This file has no coverage loops.');
  const levels = tx.coverage_levels || {};
  return h('div', { class: 'bars' },
    h('h4', {}, 'Coverages by insurance line'),
    barList(Object.fromEntries(lines.map(([k, v]) => [k, Object.values(v).reduce((a, b) => a + b, 0)]))),
    Object.keys(levels).length ? [h('h4', {}, 'Coverages by tier'), barList(levels)] : null);
}

// A file can hold several ST/SE transactions (one per member in some state
// Medicaid files): show the header of the first and add up the counts.
function combineTransactions(txs) {
  if (txs.length <= 1) return txs[0] || {};
  const out = { ...txs[0], subscribers: 0, dependents: 0, terminations: 0, coverage_lines: {}, coverage_levels: {} };
  for (const t of txs) {
    out.subscribers += t.subscribers || 0; out.dependents += t.dependents || 0; out.terminations += t.terminations || 0;
    for (const [line, byType] of Object.entries(t.coverage_lines || {})) {
      out.coverage_lines[line] ??= {};
      for (const [k, v] of Object.entries(byType)) out.coverage_lines[line][k] = (out.coverage_lines[line][k] || 0) + v;
    }
    for (const [k, v] of Object.entries(t.coverage_levels || {})) out.coverage_levels[k] = (out.coverage_levels[k] || 0) + v;
  }
  return out;
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
  if (!files.old || !files.new) { showError('compare', 'Add both files first.', 'Select the previous file and the new file, or load the sample files.'); return; }
  try {
    renderCompare(compare834(files.old.text, files.new.text, { showPii: $('show-pii-cmp').checked }));
    $('compare-results').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (err) {
    showError('compare', `One of the files could not be read as an 834. ${err.message}`, err.suggestion);
  }
}
$('run-compare').addEventListener('click', runCompare);

function renderCompare(r) {
  const sev = { error: 0, warning: 0, info: 0 };
  r.changes.forEach(c => sev[c.severity]++);
  const v = sev.error
    ? ['v-error', 'x', 'Possible coverage loss', `${plural(sev.error, 'change')} could end someone's coverage. Check them before sending.`]
    : sev.warning ? ['v-warning', 'alert', 'Review the changes', `${plural(sev.warning, 'change')} should be confirmed before sending.`]
      : ['v-ok', 'check', 'No risky changes', r.changes.length ? 'The changes in this file look expected.' : 'Both files describe the same members and coverage.'];
  const panel = h('div', { class: 'panel' },
    h('div', { class: `verdict ${v[0]}` }, h('div', { class: 'verdict-icon' }, icon(v[1])), h('div', {}, h('h2', {}, v[2]), h('p', {}, v[3]))),
    h('div', { class: 'file-line' }, fileFact('Previous', files.old.name), fileFact('New', files.new.name), h('span', {}, r.note)),
    h('div', { class: 'stats', style: 'grid-template-columns:repeat(4,minmax(0,1fr))' },
      stat('Previous members', r.old_file.members), stat('New members', r.new_file.members),
      stat('Could end coverage', sev.error, null, sev.error ? 'var(--err)' : null), stat('To review', sev.warning, null, sev.warning ? 'var(--warn)' : null)));
  const list = h('div', { class: 'panel results' },
    h('div', { class: 'tabbar' }, h('button', { 'aria-selected': 'true' }, 'Changes', h('span', { class: 'count' }, r.changes.length))),
    r.changes.length
      ? h('table', { class: 'table' },
          h('thead', {}, h('tr', {}, h('th', {}, 'Change'), h('th', {}, 'Member'), h('th', {}, 'Detail'))),
          h('tbody', {}, ...r.changes.map(c => h('tr', {},
            h('td', { style: 'width:1%' }, h('span', { class: `pill p-${c.severity}` }, CHANGE_LABEL[c.type] || c.type)),
            h('td', {}, c.member), h('td', {}, c.detail)))))
      : h('div', { class: 'empty' }, 'No differences between the two files.'));
  $('compare-results').replaceChildren(panel, list);
}

// ─── Code lookup ─────────────────────────────────────────────────────────────
const tableSel = $('code-table');
for (const [key, t] of Object.entries(CODE_TABLES)) {
  const name = key.replace(/_/g, ' ');
  tableSel.append(h('option', { value: key }, `${name[0].toUpperCase()}${name.slice(1)} (${t.element})`));
}
tableSel.value = 'maintenance_type';
function runExplain() {
  const r = explainCode(tableSel.value, $('code-value').value.trim());
  const panel = h('div', { class: 'panel' });
  if (r.codes) {
    panel.append(h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Code'), h('th', {}, 'Meaning'))),
      h('tbody', {}, ...Object.entries(r.codes).map(([k, v]) => h('tr', {}, h('td', { style: 'width:1%' }, h('span', { class: 'code' }, k)), h('td', {}, v))))));
  } else if (r.found) {
    panel.append(h('div', { class: 'explain-out' }, h('span', { class: 'code' }, `${r.element} = ${r.code}`), h('div', { class: 'meaning' }, r.meaning)));
  } else {
    panel.append(h('div', { class: 'explain-out' }, h('div', { class: 'alert' }, r.message)));
  }
  $('explain-results').replaceChildren(panel);
}
$('run-explain').addEventListener('click', runExplain);
$('code-value').addEventListener('keydown', (ev) => { if (ev.key === 'Enter') runExplain(); });

// ─── Helpers ─────────────────────────────────────────────────────────────────
function kv(k, v) { return v === null || v === undefined || v === '' ? [] : [h('dt', {}, k), h('dd', {}, String(v))]; }
function barList(obj) {
  const entries = Object.entries(obj).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map(e => e[1]), 1);
  return h('div', { class: 'barlist' }, ...entries.map(([k, v]) => h('div', { class: 'bar' },
    h('span', {}, k), h('u', {}, h('i', { style: `width:${Math.round(v / max * 100)}%` })), h('b', {}, v))));
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
    if (f.where_to_fix) lines.push(`  Where to fix: ${f.where_to_fix.where}`);
  }
  if (!result.findings.length) lines.push('No problems found.');
  lines.push('', `Member records: ${result.records_correct} of ${result.members} correct`);
  for (const r of result.records) {
    lines.push(`  ${r.status === 'correct' ? 'OK   ' : r.status === 'error' ? 'ERROR' : 'WARN '} ${r.member}${r.rules.length ? ` – ${r.rules.join(', ')}` : ''}`);
  }
  return lines.join('\n');
}
function reportCsv({ result }) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['severity', 'rule', 'segment_position', 'segment_id', 'message', 'fix', 'where_to_fix', 'how_to_fix']];
  for (const f of result.findings) rows.push([f.severity, f.rule, f.segment?.position, f.segment?.id, f.message, f.fix, f.where_to_fix?.where, f.where_to_fix?.how]);
  return rows.map(r => r.map(q).join(',')).join('\r\n');
}
async function copyText(btn, text) {
  const old = [...btn.childNodes];
  try { await navigator.clipboard.writeText(text); btn.replaceChildren(icon('check'), 'Copied'); }
  catch { btn.replaceChildren('Copy failed'); }
  setTimeout(() => btn.replaceChildren(...old), 1600);
}
// Hosted single-file builds set window.EDI834_NO_DOWNLOAD, where downloads are blocked.
function canDownload() { return !window.EDI834_NO_DOWNLOAD; }
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
