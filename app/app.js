import {
  html, render, useState, useEffect, useMemo, useRef, useRoute, Toasts, toast, errToast, Modal, Avatar, Person,
  applyBrand, toggleTheme, Icon, Stat, Empty, Field, BarChart, Donut, fmtDate
} from './kit.js';
import { addDays, monthBounds, weekday } from './time.js';
import * as S from './store.js';

const { STATUSES, ORDER } = S;
let BRAND = { appName: 'Musterdesk', logo: 'logo.svg', tagline: 'The daily muster roll, without the paperwork.' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ym = (d) => d.slice(0, 7);
const shiftMonth = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const monthLabel = (m) => new Date(m + '-15T12:00:00Z').toLocaleDateString([], { month: 'long', year: 'numeric', timeZone: 'UTC' });
const logoSrc = () => S.getState()?.settings.logo || BRAND.logo;

function useStore() {
  const [st, set] = useState(S.getState());
  useEffect(() => S.subscribe(set), []);
  return st;
}
function download(name, text, type = 'text/plain') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
const toCsv = (rows) => '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
const StatusChip = ({ s, small }) => s ? html`<span class=${'code-chip c-' + s + (small ? ' sm' : '')} title=${STATUSES[s].label}>${s}</span>` : html`<span class="code-chip none">·</span>`;

/* =================== Root =================== */
function App() {
  const st = useStore();
  const route = useRoute();
  if (!st) return html`<${Onboarding} />`;
  const page = route.parts[0] || 'register';
  return html`<${Shell} page=${page} route=${route} st=${st} />`;
}

function Onboarding() {
  const [company, setCompany] = useState('');
  return html`<div class="auth">
    <div class="auth-art">
      <div class="row"><img src=${BRAND.logo} style=${{ width: 40, height: 40, borderRadius: 10 }} alt="" /><b style=${{ fontSize: 18 }}>${BRAND.appName}</b></div>
      <div><h2>${BRAND.tagline}</h2>
        <ul><li>${Icon('check')} Mark a whole crew present in one tap</li><li>${Icon('grid')} Classic monthly muster roll, ready to print</li>
          <li>${Icon('shield')} Works offline. Data stays on this computer</li><li>${Icon('download')} Export to CSV and back up to a single file</li></ul></div>
      <div class="small" style=${{ opacity: .7 }}>No account, no internet connection needed.</div></div>
    <div class="auth-form"><div class="col gap-lg" style=${{ width: 'min(380px,100%)' }}>
      <img src=${BRAND.logo} style=${{ width: 52, height: 52 }} alt="" />
      <div><h1>Set up ${BRAND.appName}</h1><p class="muted">Start with your company name. You can add teams and workers next.</p></div>
      <${Field} label="Company name"><input class="input" value=${company} placeholder=${BRAND.company || 'e.g. Northwind Builders'} onInput=${(e) => setCompany(e.target.value)} /><//>
      <button class="btn primary lg" onClick=${() => { S.initEmpty({ company: company || BRAND.company || 'My Company' }); location.hash = '#/workers'; }}>Start fresh</button>
      <div class="demo-box"><b>Just looking?</b><span class="muted">Load 48 sample workers in 5 teams with two months of history.</span>
        <button class="btn" onClick=${() => { S.seedDemo(BRAND.company || company || undefined); location.hash = '#/register'; }}>${Icon('zap')} Explore with sample data</button></div>
      <label class="btn ghost">${Icon('upload')} Restore a backup file<input type="file" accept=".json,application/json" hidden onChange=${async (e) => { try { S.importJson(await e.target.files[0].text()); toast('Backup restored'); } catch (err) { errToast(err); } }} /></label>
    </div></div></div>`;
}

const NAV = [['register', 'Daily register', 'check'], ['muster', 'Muster roll', 'grid'], ['reports', 'Reports', 'chart'], ['workers', 'Workers', 'users'], ['teams', 'Teams & sites', 'building'], ['settings', 'Settings', 'settings']];
function Shell({ page, route, st }) {
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [route.path]);
  const Page = { register: Register, muster: Muster, reports: Reports, workers: Workers, teams: Teams, settings: Settings }[page] || Register;
  const pending = useMemo(() => { const t = S.today(); if (S.isOffDay(t)) return 0; return S.workersOf().filter((w) => !st.marks[t]?.[w.id]?.s).length; }, [st]);
  return html`<div class="shell">
    <aside class=${'sidebar' + (open ? ' open' : '')}>
      <div class="brand"><img src=${logoSrc()} alt="" /><div><div class="name">${st.settings.company}</div><div class="sub">${BRAND.appName}</div></div></div>
      <nav class="nav">${NAV.map(([k, l, i]) => html`<a href=${'#/' + k} class=${page === k ? 'active' : ''}>${Icon(i)} ${l}${k === 'register' && pending ? html`<span class="count">${pending}</span>` : ''}</a>`)}</nav>
      <span class="spacer"></span>
      ${st.demo && html`<div class="demo-box" style=${{ margin: '0 4px 10px' }}><b>Sample data</b><span class="faint small">When you're ready, erase it in Settings → Backup &amp; data and start fresh.</span></div>`}
      <div class="row" style=${{ padding: '4px 6px' }}><span class="badge ok"><i class="dot"></i>Saved on this device</span></div>
      <div class="row"><button class="btn ghost sm" onClick=${toggleTheme}>${Icon('moon')} Theme</button></div>
    </aside>
    ${open && html`<div class="scrim" onClick=${() => setOpen(false)}></div>`}
    <main class="main"><div class="topbar"><button class="btn ghost icon menu-btn" onClick=${() => setOpen(true)}>${Icon('menu')}</button><h1>${(NAV.find((n) => n[0] === page) || NAV[0])[1]}</h1><span class="spacer"></span>
      <span class="faint small nowrap">${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
      <div class="content"><${Page} st=${st} route=${route} /></div></main></div>`;
}

/* =================== Daily register =================== */
function Register({ st, route }) {
  const [date, setDate] = useState(route.query.date || S.today());
  const [team, setTeam] = useState(route.query.team || '');
  const [q, setQ] = useState('');
  const [cursor, setCursor] = useState(0);
  const [supName, setSupName] = useState(st.settings.supervisor || '');
  const all = S.workersOf(team);
  const list = all.filter((w) => !q || (w.name + w.code + w.trade).toLowerCase().includes(q.toLowerCase()));
  const ids = list.map((w) => w.id);
  const counts = S.dayCounts(date, all.map((w) => w.id));
  const lock = S.lockOf(date, team);
  const locked = !!lock;
  const off = S.isOffDay(date);
  const future = date > S.today();
  const tableRef = useRef();

  useEffect(() => {
    const onKey = (e) => {
      if (/input|select|textarea/i.test(e.target.tagName) || locked || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (e.key === 'ArrowDown' || e.key === 'j') { setCursor((c) => Math.min(c + 1, list.length - 1)); e.preventDefault(); }
      else if (e.key === 'ArrowUp' || e.key === 'k') { setCursor((c) => Math.max(c - 1, 0)); e.preventDefault(); }
      else if (STATUSES[k] && list[cursor]) { S.setMark(date, list[cursor].id, { s: k }); setCursor((c) => Math.min(c + 1, list.length - 1)); e.preventDefault(); }
      else if (e.key === 'Backspace' && list[cursor]) { S.setMark(date, list[cursor].id, { s: '' }); }
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });
  useEffect(() => { tableRef.current?.querySelector(`tr[data-i="${cursor}"]`)?.scrollIntoView({ block: 'nearest' }); }, [cursor]);

  const prevWorkday = () => { let d = addDays(date, -1); for (let i = 0; i < 10 && S.isOffDay(d); i++) d = addDays(d, -1); return d; };
  const copyPrev = () => { const p = prevWorkday(); const n = S.copyDay(p, date, ids); toast(n ? `Copied ${n} marks from ${fmtDate(p)}` : `Nothing to copy from ${fmtDate(p)}`); };
  const submit = () => {
    if (!supName.trim()) return errToast('Enter the supervisor name to submit');
    if (counts.none && !confirm(`${counts.none} workers are still unmarked. Submit anyway?`)) return;
    S.updateSettings({ supervisor: supName.trim() }); S.setLock(date, team, supName.trim()); toast('Register submitted and locked');
  };
  const last7 = Array.from({ length: 7 }, (_, i) => addDays(date, i - 7));

  return html`<div class="col gap-lg">
    <div class="row wrap">
      <div class="row gap-sm"><button class="btn icon" onClick=${() => setDate(addDays(date, -1))} aria-label="Previous day">${Icon('chevronLeft')}</button>
        <input type="date" class="input" style=${{ width: 160 }} value=${date} onChange=${(e) => e.target.value && setDate(e.target.value)} />
        <button class="btn icon" onClick=${() => setDate(addDays(date, 1))} aria-label="Next day">${Icon('chevronRight')}</button>
        ${date !== S.today() && html`<button class="btn sm ghost" onClick=${() => setDate(S.today())}>Today</button>`}</div>
      <select class="input" style=${{ width: 230 }} value=${team} onChange=${(e) => { setTeam(e.target.value); setCursor(0); }}><option value="">All teams (${S.workersOf().length})</option>${st.teams.map((t) => html`<option value=${t.id}>${t.name} (${S.workersOf(t.id).length})</option>`)}</select>
      <div class="search" style=${{ width: 220 }}>${Icon('search')}<input class="input" placeholder="Filter workers" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
    </div>

    <div class="reg-head card">
      <div><div class="faint small">${DOW[weekday(date)]}</div><h2>${fmtDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}</h2>
        ${off && html`<span class="badge">${st.holidays[date] || 'Weekly off'}</span>`} ${future && html`<span class="badge warn">Future date</span>`}
        ${locked && html`<span class="badge ok">${Icon('shield', { width: 12, height: 12 })} Submitted by ${lock.by}</span>`}</div>
      <div class="reg-counts">${ORDER.map((k) => html`<div class=${'cnt c-' + k}><b>${counts[k]}</b><span>${STATUSES[k].label}</span></div>`)}<div class="cnt none"><b>${counts.none}</b><span>Unmarked</span></div></div>
    </div>

    <div class="row wrap no-print">
      <button class="btn primary" disabled=${locked} onClick=${() => { S.setMany(date, ids, 'P', { onlyEmpty: true }); toast('Unmarked workers set to Present'); }}>${Icon('check')} Mark rest present</button>
      <button class="btn" disabled=${locked} onClick=${copyPrev}>${Icon('copy')} Copy previous day</button>
      <div class="dropdown"><select class="input" disabled=${locked} value="" onChange=${(e) => { if (e.target.value) { S.setMany(date, ids, e.target.value); toast(`All ${list.length} set to ${STATUSES[e.target.value].label}`); } e.target.value = ''; }}>
        <option value="">Set all to…</option>${ORDER.map((k) => html`<option value=${k}>${STATUSES[k].label}</option>`)}</select></div>
      <button class="btn ghost danger" disabled=${locked} onClick=${() => confirm('Clear all marks shown for this day?') && S.clearDay(date, ids)}>${Icon('x')} Clear</button>
      <span class="spacer"></span>
      <span class="faint small">Keys: <span class="kbd">↑</span><span class="kbd">↓</span> move · <span class="kbd">P</span><span class="kbd">A</span><span class="kbd">H</span><span class="kbd">L</span><span class="kbd">S</span><span class="kbd">O</span> mark</span>
    </div>

    <div class="card table-wrap" ref=${tableRef}>
      ${list.length ? html`<table class="table reg-table"><thead><tr><th style=${{ width: 40 }}>#</th><th>Worker</th><th>Status</th><th style=${{ width: 90 }}>OT hrs</th><th>Note</th><th>Last 7 days</th></tr></thead><tbody>
      ${list.map((w, i) => { const m = st.marks[date]?.[w.id] || {}; return html`<tr data-i=${i} class=${i === cursor ? 'cursor' : ''} onClick=${() => setCursor(i)}>
        <td class="faint">${i + 1}</td>
        <td><${Person} name=${w.name} sub=${`${w.code || ''}${w.trade ? ' · ' + w.trade : ''}`} /></td>
        <td><div class="status-btns">${ORDER.map((k) => html`<button disabled=${locked} class=${'sb c-' + k + (m.s === k ? ' on' : '')} title=${STATUSES[k].label} onClick=${(e) => { e.stopPropagation(); S.setMark(date, w.id, { s: m.s === k ? '' : k }); }}>${k}</button>`)}</div></td>
        <td><input class="input sm" type="number" min="0" max="16" step="0.5" disabled=${locked} value=${m.ot || ''} placeholder="0" onChange=${(e) => S.setMark(date, w.id, { ot: Number(e.target.value) || 0 })} /></td>
        <td><input class="input sm" disabled=${locked} value=${m.n || ''} placeholder="—" onChange=${(e) => S.setMark(date, w.id, { n: e.target.value })} /></td>
        <td><div class="mini-days">${last7.map((d) => html`<${StatusChip} small s=${st.marks[d]?.[w.id]?.s} />`)}</div></td></tr>`; })}
      </tbody></table>` : html`<${Empty} icon="users" title="No workers here yet"><a href="#/workers">Add workers</a> or pick another team.<//>`}
    </div>

    <div class="card card-pad row wrap no-print">
      ${locked ? html`<span class="muted">Locked on ${new Date(lock.at).toLocaleString()} by <b>${lock.by}</b>.</span><span class="spacer"></span><button class="btn" onClick=${() => confirm('Unlock this register for editing?') && S.setLock(date, team, null)}>${Icon('edit')} Unlock to edit</button>`
      : html`<${Field} label="Supervisor"><input class="input" style=${{ width: 220 }} value=${supName} onInput=${(e) => setSupName(e.target.value)} placeholder="Your name" /><//><span class="spacer"></span>
        <button class="btn primary lg" onClick=${submit}>${Icon('shield')} Submit & lock day</button>`}
    </div>
  </div>`;
}

/* =================== Muster roll (month grid) =================== */
function Muster({ st }) {
  const [month, setMonth] = useState(ym(S.today()));
  const [team, setTeam] = useState('');
  const sum = S.monthSummary(month, team);
  const t = S.today();
  const cycle = (d, w) => { const cur = st.marks[d]?.[w]?.s || ''; const next = cur ? ORDER[(ORDER.indexOf(cur) + 1)] || '' : 'P'; S.setMark(d, w, { s: next }); };
  const exportCsv = () => {
    const head = ['Worker ID', 'Name', 'Trade', 'Team', ...sum.days.map((d) => d.slice(8)), 'Present', 'Half', 'Absent', 'Leave', 'Sick', 'Off', 'OT hours', 'Paid days'];
    const teamName = (id) => st.teams.find((x) => x.id === id)?.name || '';
    const rows = sum.rows.map((r) => [r.worker.code, r.worker.name, r.worker.trade, teamName(r.worker.teamId), ...sum.days.map((d) => st.marks[d]?.[r.worker.id]?.s || ''), r.P, r.H, r.A, r.L, r.S, r.O, r.ot, r.paid]);
    download(`muster-roll_${month}${team ? '_' + teamName(team).replace(/\W+/g, '-') : ''}.csv`, toCsv([head, ...rows]), 'text/csv');
  };
  const teamObj = st.teams.find((x) => x.id === team);
  return html`<div class="col gap-lg">
    <div class="row wrap no-print">
      <div class="row gap-sm"><button class="btn icon" onClick=${() => setMonth(shiftMonth(month, -1))}>${Icon('chevronLeft')}</button><b style=${{ minWidth: 150, textAlign: 'center' }}>${monthLabel(month)}</b><button class="btn icon" onClick=${() => setMonth(shiftMonth(month, 1))}>${Icon('chevronRight')}</button></div>
      <select class="input" style=${{ width: 230 }} value=${team} onChange=${(e) => setTeam(e.target.value)}><option value="">All teams</option>${st.teams.map((x) => html`<option value=${x.id}>${x.name}</option>`)}</select>
      <span class="spacer"></span><button class="btn" onClick=${() => print()}>${Icon('print')} Print</button><button class="btn primary" onClick=${exportCsv}>${Icon('download')} Export CSV</button></div>
    <div class="print-only"><h2>${st.settings.company} — Muster roll, ${monthLabel(month)}${teamObj ? ' — ' + teamObj.name : ''}</h2></div>
    <div class="legend row wrap small">${ORDER.map((k) => html`<span class="row gap-sm"><${StatusChip} s=${k} /> ${STATUSES[k].label}</span>`)}<span class="faint">Click a cell to change it.</span></div>
    <div class="card muster-wrap"><table class="muster"><thead><tr><th class="sticky">Worker</th>
      ${sum.days.map((d) => html`<th class=${S.isOffDay(d) ? 'off' : ''} title=${st.holidays[d] || ''}><div>${DOW[weekday(d)][0]}</div><div>${+d.slice(8)}</div></th>`)}
      <th class="tot">P</th><th class="tot">H</th><th class="tot">A</th><th class="tot">L</th><th class="tot">S</th><th class="tot">OT</th><th class="tot">Paid</th></tr></thead>
      <tbody>${sum.rows.map((r) => html`<tr><td class="sticky"><b>${r.worker.name}</b><div class="faint small">${r.worker.code} · ${r.worker.trade}</div></td>
        ${sum.days.map((d) => { const s = st.marks[d]?.[r.worker.id]?.s; return html`<td class=${'cell' + (S.isOffDay(d) ? ' off' : '') + (d > t ? ' fut' : '') + (s ? ' c-' + s : '')} onClick=${() => d <= t && cycle(d, r.worker.id)}>${s || ''}</td>`; })}
        <td class="tot">${r.P}</td><td class="tot">${r.H}</td><td class="tot">${r.A}</td><td class="tot">${r.L}</td><td class="tot">${r.S}</td><td class="tot">${r.ot || ''}</td><td class="tot"><b>${r.paid}</b></td></tr>`)}</tbody></table>
      ${!sum.rows.length && html`<${Empty} icon="grid" title="No workers for this selection" />`}</div>
    <div class="print-only row" style=${{ marginTop: 40, gap: 80 }}><div>Prepared by: ____________________</div><div>Approved by: ____________________</div></div>
  </div>`;
}

/* =================== Reports =================== */
function Reports({ st }) {
  const [month, setMonth] = useState(ym(S.today()));
  const sum = S.monthSummary(month);
  const tot = sum.rows.reduce((a, r) => ({ paid: a.paid + r.paid, work: a.work + r.workdays, A: a.A + r.A, L: a.L + r.L + r.S, ot: a.ot + r.ot, un: a.un + r.unmarked }), { paid: 0, work: 0, A: 0, L: 0, ot: 0, un: 0 });
  const byTeam = st.teams.map((tm) => { const rs = sum.rows.filter((r) => r.worker.teamId === tm.id); const p = rs.reduce((a, r) => a + r.paid, 0), w = rs.reduce((a, r) => a + r.workdays, 0); return { label: tm.name, value: w ? Math.round((p / w) * 100) : 0 }; });
  const t = S.today();
  const daily = sum.days.filter((d) => d <= t && !S.isOffDay(d)).map((d) => { const c = S.dayCounts(d, S.workersOf().map((w) => w.id)); return { label: String(+d.slice(8)), values: [{ name: 'Present', v: c.P + c.H, color: 'var(--accent)' }, { name: 'Absent', v: c.A, color: '#ef4444' }, { name: 'Leave/Sick', v: c.L + c.S, color: '#a78bfa' }] }; });
  const absentees = [...sum.rows].sort((a, b) => b.A - a.A).filter((r) => r.A > 0).slice(0, 8);
  const status = ORDER.slice(0, 5).map((k) => ({ label: STATUSES[k].label, value: sum.rows.reduce((a, r) => a + r[k], 0), color: STATUSES[k].color }));
  return html`<div class="col gap-lg">
    <div class="row"><div class="row gap-sm"><button class="btn icon" onClick=${() => setMonth(shiftMonth(month, -1))}>${Icon('chevronLeft')}</button><b style=${{ minWidth: 150, textAlign: 'center' }}>${monthLabel(month)}</b><button class="btn icon" onClick=${() => setMonth(shiftMonth(month, 1))}>${Icon('chevronRight')}</button></div><span class="spacer"></span><button class="btn" onClick=${() => print()}>${Icon('print')} Print</button></div>
    <div class="grid grid-4">
      <${Stat} label="Attendance rate" value=${tot.work ? Math.round((tot.paid / tot.work) * 100) + '%' : '—'} hint=${`${tot.paid} paid days of ${tot.work}`} color="var(--accent)" />
      <${Stat} label="Absences" value=${tot.A} color="#ef4444" /><${Stat} label="Leave & sick days" value=${tot.L} color="#a78bfa" />
      <${Stat} label="Overtime hours" value=${tot.ot} hint=${tot.un ? `${tot.un} worker-days unmarked` : 'All days marked'} />
    </div>
    <div class="grid" style=${{ gridTemplateColumns: 'minmax(0,1.6fr) minmax(0,1fr)' }}>
      <div class="card"><div class="card-head"><h3>Daily headcount</h3></div><div class="card-pad"><${BarChart} stacked data=${daily} height=${190} /></div></div>
      <div class="card"><div class="card-head"><h3>Status mix</h3></div><div class="card-pad"><${Donut} data=${status} center=${tot.work ? Math.round((tot.paid / tot.work) * 100) + '%' : ''} /></div></div>
    </div>
    <div class="grid grid-2">
      <div class="card"><div class="card-head"><h3>Attendance by team</h3></div><div class="card-pad col">${byTeam.map((b) => html`<div class="row"><span style=${{ width: 170, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} class="small" title=${b.label}>${b.label}</span><div class="bar" style=${{ flex: 1 }}><i style=${{ width: b.value + '%' }}></i></div><b class="small" style=${{ width: 40, textAlign: 'right' }}>${b.value}%</b></div>`)}</div></div>
      <div class="card"><div class="card-head"><h3>Most absences</h3></div>${absentees.length ? absentees.map((r) => html`<div class="live-row"><${Person} name=${r.worker.name} sub=${r.worker.trade} /><span class="spacer"></span><span class="badge bad">${r.A} absent</span>${r.S ? html`<span class="badge warn">${r.S} sick</span>` : ''}</div>`) : html`<${Empty} icon="check" title="No absences this month" />`}</div>
    </div></div>`;
}

/* =================== Workers =================== */
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) { const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += ch; }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const r = rows.filter((x) => x.some((c) => c.trim())); if (!r.length) return [];
  const head = r[0].map((h) => h.trim().toLowerCase()); return r.slice(1).map((x) => Object.fromEntries(head.map((h, i) => [h, (x[i] || '').trim()])));
}
function Workers({ st }) {
  const [q, setQ] = useState(''); const [team, setTeam] = useState(''); const [edit, setEdit] = useState(null); const [imp, setImp] = useState(false);
  const list = S.workersOf(team, { includeInactive: true }).filter((w) => !q || (w.name + w.code + w.trade).toLowerCase().includes(q.toLowerCase()));
  const tname = (id) => st.teams.find((t) => t.id === id)?.name || html`<span class="faint">Unassigned</span>`;
  return html`<div class="col gap-lg">
    <div class="row wrap"><div class="search" style=${{ width: 260 }}>${Icon('search')}<input class="input" placeholder="Search workers" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
      <select class="input" style=${{ width: 220 }} value=${team} onChange=${(e) => setTeam(e.target.value)}><option value="">All teams</option>${st.teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select>
      <span class="spacer"></span><button class="btn" onClick=${() => setImp(true)}>${Icon('upload')} Import CSV</button><button class="btn primary" onClick=${() => setEdit({ teamId: team })}>${Icon('plus')} Add worker</button></div>
    <div class="card table-wrap"><table class="table"><thead><tr><th>Worker</th><th>ID</th><th>Trade</th><th>Team</th><th>Phone</th><th></th></tr></thead><tbody>
      ${list.map((w) => html`<tr style=${{ opacity: w.active ? 1 : 0.5 }}><td><${Person} name=${w.name} sub=${w.active ? '' : 'Inactive'} /></td><td class="mono small">${w.code}</td><td>${w.trade}</td><td>${tname(w.teamId)}</td><td class="small muted">${w.phone}</td>
        <td class="right"><button class="btn sm" onClick=${() => setEdit(w)}>${Icon('edit')} Edit</button></td></tr>`)}</tbody></table>
      ${!list.length && html`<${Empty} icon="users" title="No workers yet">Add them one by one or import a CSV.<//>`}</div>
    ${edit && html`<${WorkerForm} w=${edit} teams=${st.teams} onClose=${() => setEdit(null)} />`}
    ${imp && html`<${ImportWorkers} onClose=${() => setImp(false)} />`}</div>`;
}
function WorkerForm({ w, teams, onClose }) {
  const [f, set] = useState({ name: '', code: '', trade: '', phone: '', teamId: '', active: true, ...w });
  const inp = (k, p = {}) => html`<input class="input" value=${f[k] || ''} onInput=${(e) => set({ ...f, [k]: e.target.value })} ...${p} />`;
  const save = () => { try { S.saveWorker(f); toast(w.id ? 'Saved' : 'Worker added'); onClose(); } catch (e) { errToast(e); } };
  return html`<${Modal} title=${w.id ? 'Edit worker' : 'Add worker'} onClose=${onClose} footer=${html`${w.id && html`<button class="btn danger" onClick=${() => { if (confirm(`Delete ${w.name} and their attendance history?`)) { S.deleteWorker(w.id); onClose(); } }}>${Icon('trash')} Delete</button>`}<span class="spacer"></span><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${save}>Save</button>`}>
    <div class="grid grid-2"><${Field} label="Full name">${inp('name')}<//><${Field} label="Worker ID">${inp('code', { placeholder: 'W123' })}<//>
      <${Field} label="Trade / role">${inp('trade', { placeholder: 'e.g. Carpenter' })}<//><${Field} label="Phone">${inp('phone')}<//>
      <${Field} label="Team"><select class="input" value=${f.teamId} onChange=${(e) => set({ ...f, teamId: e.target.value })}><option value="">Unassigned</option>${teams.map((t) => html`<option value=${t.id}>${t.name}</option>`)}</select><//>
      <${Field} label="Joined"><input type="date" class="input" value=${f.joined || ''} onInput=${(e) => set({ ...f, joined: e.target.value })} /><//></div>
    ${w.id && html`<label class="check"><input type="checkbox" checked=${f.active} onChange=${(e) => set({ ...f, active: e.target.checked })} /> Active (inactive workers are hidden from the register)</label>`}<//>`;
}
function ImportWorkers({ onClose }) {
  const [text, setText] = useState('code,name,trade,team,phone\nW301,Example Worker,Painter,Site A,');
  const rows = parseCsv(text);
  return html`<${Modal} wide title="Import workers" onClose=${onClose} footer=${html`<button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${() => { const n = S.importWorkers(rows); toast(`Imported ${n} workers`); onClose(); }}>Import ${rows.length} rows</button>`}>
    <p class="muted small">Header row with <span class="kbd">name</span> and optional <span class="kbd">code</span> <span class="kbd">trade</span> <span class="kbd">team</span> <span class="kbd">phone</span>. New team names are created automatically; existing worker IDs are skipped.</p>
    <label class="btn sm" style=${{ alignSelf: 'flex-start' }}>${Icon('upload')} Choose file<input type="file" accept=".csv" hidden onChange=${async (e) => e.target.files[0] && setText(await e.target.files[0].text())} /></label>
    <textarea class="input mono" style=${{ minHeight: 180, fontSize: 12.5 }} value=${text} onInput=${(e) => setText(e.target.value)}></textarea><//>`;
}

/* =================== Teams =================== */
function Teams({ st }) {
  const [edit, setEdit] = useState(null);
  const t = S.today();
  return html`<div class="col gap-lg"><div class="row"><p class="muted">Group workers by crew, site or shift. Each team gets its own register and muster roll.</p><span class="spacer"></span><button class="btn primary" onClick=${() => setEdit({})}>${Icon('plus')} Add team</button></div>
    <div class="grid grid-3">${st.teams.map((tm) => { const ws = S.workersOf(tm.id); const c = S.dayCounts(t, ws.map((w) => w.id)); const lock = S.lockOf(t, tm.id); return html`<div class="card card-pad col">
      <div class="row"><div class="team-icon">${Icon('building')}</div><div style=${{ minWidth: 0 }}><h3>${tm.name}</h3><div class="faint small">${tm.site || 'No site set'}</div></div><span class="spacer"></span><button class="btn sm ghost icon" onClick=${() => setEdit(tm)}>${Icon('edit')}</button></div>
      <div class="row small"><span class="muted">Supervisor</span><span class="spacer"></span><b>${tm.supervisor || '—'}</b></div>
      <div class="row small"><span class="muted">Workers</span><span class="spacer"></span><b>${ws.length}</b></div>
      <div class="row small"><span class="muted">Today</span><span class="spacer"></span>${S.isOffDay(t) ? html`<span class="badge">Off day</span>` : lock ? html`<span class="badge ok">Submitted · ${c.P + c.H}/${ws.length} present</span>` : c.none === ws.length ? html`<span class="badge warn">Not marked</span>` : html`<span class="badge info">${ws.length - c.none}/${ws.length} marked</span>`}</div>
      <a class="btn" href=${`#/register?team=${tm.id}`}>Open register</a></div>`; })}</div>
    ${!st.teams.length && html`<div class="card"><${Empty} icon="building" title="No teams yet" /></div>`}
    ${edit && html`<${TeamForm} t=${edit} onClose=${() => setEdit(null)} />`}</div>`;
}
function TeamForm({ t, onClose }) {
  const [f, set] = useState({ name: '', site: '', supervisor: '', ...t });
  const inp = (k) => html`<input class="input" value=${f[k]} onInput=${(e) => set({ ...f, [k]: e.target.value })} />`;
  return html`<${Modal} title=${t.id ? 'Edit team' : 'Add team'} onClose=${onClose} footer=${html`${t.id && html`<button class="btn danger" onClick=${() => { if (confirm('Delete this team? Workers stay, unassigned.')) { S.deleteTeam(t.id); onClose(); } }}>${Icon('trash')} Delete</button>`}<span class="spacer"></span><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${() => { if (!f.name.trim()) return errToast('Name is required'); S.saveTeam(f); onClose(); }}>Save</button>`}>
    <${Field} label="Team name">${inp('name')}<//><${Field} label="Site / location">${inp('site')}<//><${Field} label="Supervisor">${inp('supervisor')}<//><//>`;
}

/* =================== Settings =================== */
const ACCENTS = ['#0d9488', '#2563eb', '#16a34a', '#7c3aed', '#ea580c', '#db2777', '#111827', '#bda873'];
function Settings({ st }) {
  const s = st.settings;
  const [hol, setHol] = useState({ date: S.today(), name: '' });
  const bytes = S.storageBytes();
  const readFile = (file) => new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  return html`<div class="col gap-lg" style=${{ maxWidth: 860 }}>
    <div class="card card-pad col gap-lg"><h3>Company</h3>
      <div class="grid grid-2"><${Field} label="Company name"><input class="input" value=${s.company} onChange=${(e) => S.updateSettings({ company: e.target.value })} /><//>
        <${Field} label="Default supervisor"><input class="input" value=${s.supervisor} onChange=${(e) => S.updateSettings({ supervisor: e.target.value })} /><//></div>
      <${Field} label="Weekly off days" help="Off days are greyed out and don't count as working days"><div class="row wrap">${DOW.map((d, i) => html`<button class=${'btn sm' + (s.weekOff.includes(i) ? ' primary' : '')} onClick=${() => S.updateSettings({ weekOff: s.weekOff.includes(i) ? s.weekOff.filter((x) => x !== i) : [...s.weekOff, i] })}>${d}</button>`)}</div><//></div>
    <div class="card card-pad col gap-lg"><h3>Branding</h3>
      <div class="row"><div class="logo-box"><img src=${logoSrc()} alt="" /></div><label class="btn">${Icon('upload')} Upload logo<input type="file" accept="image/*" hidden onChange=${async (e) => { const f = e.target.files[0]; if (!f) return; if (f.size > 300000) return errToast('Logo must be under 300 KB'); S.updateSettings({ logo: await readFile(f) }); }} /></label>${s.logo && html`<button class="btn ghost" onClick=${() => S.updateSettings({ logo: '' })}>Use default</button>`}</div>
      <div class="row wrap">${ACCENTS.map((c) => html`<span class=${'swatch' + (s.accent === c ? ' on' : '')} style=${{ background: c }} onClick=${() => { S.updateSettings({ accent: c }); applyBrand({ accent: c }); }}></span>`)}</div></div>
    <div class="card card-pad col gap-lg"><h3>Holidays</h3>
      <div class="row wrap"><input type="date" class="input" style=${{ width: 160 }} value=${hol.date} onInput=${(e) => setHol({ ...hol, date: e.target.value })} /><input class="input" style=${{ width: 240 }} placeholder="Holiday name" value=${hol.name} onInput=${(e) => setHol({ ...hol, name: e.target.value })} /><button class="btn" onClick=${() => { if (hol.name) { S.setHoliday(hol.date, hol.name); setHol({ ...hol, name: '' }); } }}>${Icon('plus')} Add</button></div>
      <div class="row wrap">${Object.entries(st.holidays).sort().map(([d, n]) => html`<span class="badge">${fmtDate(d)} · ${n} <a href="#" onClick=${(e) => { e.preventDefault(); S.setHoliday(d, null); }}>×</a></span>`)}</div></div>
    <div class="card card-pad col gap-lg"><h3>Backup & data</h3>
      <p class="muted small">Everything is stored on this device (${(bytes / 1024).toFixed(0)} KB used). Download a backup regularly, or before moving to another computer.</p>
      <div class="row wrap"><button class="btn primary" onClick=${() => download(`musterdesk-backup_${S.today()}.json`, S.exportJson(), 'application/json')}>${Icon('download')} Download backup</button>
        <label class="btn">${Icon('upload')} Restore backup<input type="file" accept=".json" hidden onChange=${async (e) => { if (!e.target.files[0] || !confirm('Replace all current data with this backup?')) return; try { S.importJson(await e.target.files[0].text()); toast('Backup restored'); } catch (err) { errToast(err); } }} /></label>
        <span class="spacer"></span><button class="btn danger" onClick=${() => { if (confirm('Delete ALL data on this device? Download a backup first. This cannot be undone.')) S.wipe(); }}>${Icon('trash')} Erase everything</button></div></div>
  </div>`;
}

/* =================== Boot =================== */
(async () => {
  try { const b = await (await fetch('brand/brand.json', { cache: 'no-store' })).json(); BRAND = { ...BRAND, ...b, logo: b.logo ? 'brand/' + b.logo : BRAND.logo }; } catch { /* default brand */ }
  document.title = BRAND.appName;
  document.querySelector('link[rel=icon]').href = BRAND.logo;
  const st = S.getState();
  applyBrand({ accent: st?.settings.accent || BRAND.accent, accentInk: BRAND.accentInk, theme: BRAND.theme });
  if (!st && new URLSearchParams(location.search).has('demo')) S.seedDemo(BRAND.company);
  render(html`<${App} /><${Toasts} />`, document.getElementById('app'));
})();
