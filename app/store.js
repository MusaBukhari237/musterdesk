// Local-first data store. Everything lives on this device (localStorage), with JSON backup/restore.
import { addDays, weekday, monthBounds, dateRange } from './time.js';

const KEY = 'musterdesk:v1';
export const STATUSES = {
  P: { label: 'Present', short: 'P', weight: 1, cls: 'ok', color: '#16a34a' },
  H: { label: 'Half day', short: 'H', weight: 0.5, cls: 'info', color: '#2563eb' },
  A: { label: 'Absent', short: 'A', weight: 0, cls: 'bad', color: '#dc2626' },
  L: { label: 'Leave', short: 'L', weight: 0, cls: 'violet', color: '#7c3aed' },
  S: { label: 'Sick', short: 'S', weight: 0, cls: 'warn', color: '#d97706' },
  O: { label: 'Off', short: 'O', weight: 0, cls: '', color: '#94a3b8' }
};
export const ORDER = ['P', 'H', 'A', 'L', 'S', 'O'];
const uid = () => Math.random().toString(36).slice(2, 10);

function blank() {
  return {
    version: 1,
    settings: { company: 'My Company', accent: '', logo: '', weekOff: [0], supervisor: '', theme: '' },
    teams: [], workers: [], marks: {}, locks: {}, holidays: {}
  };
}

let state = load();
const listeners = new Set();
export const getState = () => state;
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function load() {
  try { const raw = localStorage.getItem(KEY); if (raw) return { ...blank(), ...JSON.parse(raw) }; } catch { /* storage blocked */ }
  return null;
}
let saveTimer;
function commit(next) {
  state = next;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { globalThis.alert?.('Could not save: storage is full or blocked. Export a backup now.'); } }, 120);
  listeners.forEach((f) => f(state));
}
export const isEmpty = () => !state;
export const storageBytes = () => { try { return (localStorage.getItem(KEY) || '').length; } catch { return 0; } };

/* ---------- settings ---------- */
export const updateSettings = (patch) => commit({ ...state, settings: { ...state.settings, ...patch } });
export const setHoliday = (date, name) => { const h = { ...state.holidays }; if (name) h[date] = name; else delete h[date]; commit({ ...state, holidays: h }); };

/* ---------- teams ---------- */
export function saveTeam(t) {
  const teams = t.id ? state.teams.map((x) => (x.id === t.id ? { ...x, ...t } : x)) : [...state.teams, { ...t, id: uid() }];
  commit({ ...state, teams });
}
export function deleteTeam(id) {
  commit({ ...state, teams: state.teams.filter((t) => t.id !== id), workers: state.workers.map((w) => (w.teamId === id ? { ...w, teamId: '' } : w)) });
}

/* ---------- workers ---------- */
export function saveWorker(w) {
  if (!w.name?.trim()) throw new Error('Name is required');
  if (w.code && state.workers.some((x) => x.code?.toLowerCase() === w.code.toLowerCase() && x.id !== w.id)) throw new Error('That worker ID is already used');
  const workers = w.id ? state.workers.map((x) => (x.id === w.id ? { ...x, ...w } : x)) : [...state.workers, { active: true, joined: today(), ...w, id: uid() }];
  commit({ ...state, workers });
}
export function deleteWorker(id) {
  const marks = {};
  for (const [d, m] of Object.entries(state.marks)) { const c = { ...m }; delete c[id]; marks[d] = c; }
  commit({ ...state, workers: state.workers.filter((w) => w.id !== id), marks });
}
export function importWorkers(rows) {
  const teamsByName = new Map(state.teams.map((t) => [t.name.toLowerCase(), t]));
  const teams = [...state.teams];
  const existing = new Set(state.workers.map((w) => (w.code || '').toLowerCase()));
  const add = [];
  for (const r of rows) {
    if (!r.name) continue;
    if (r.code && existing.has(r.code.toLowerCase())) continue;
    let teamId = '';
    if (r.team) {
      let t = teamsByName.get(r.team.toLowerCase());
      if (!t) { t = { id: uid(), name: r.team, site: '', supervisor: '' }; teams.push(t); teamsByName.set(r.team.toLowerCase(), t); }
      teamId = t.id;
    }
    add.push({ id: uid(), code: r.code || '', name: r.name, trade: r.trade || r.title || '', phone: r.phone || '', teamId, active: true, joined: today() });
    if (r.code) existing.add(r.code.toLowerCase());
  }
  commit({ ...state, teams, workers: [...state.workers, ...add] });
  return add.length;
}

/* ---------- marks ---------- */
export const mark = (date, workerId) => state.marks[date]?.[workerId];
export function setMark(date, workerId, patch) {
  const day = { ...(state.marks[date] || {}) };
  const cur = day[workerId] || {};
  const next = { ...cur, ...patch };
  if (!next.s && !next.ot && !next.n) delete day[workerId]; else day[workerId] = next;
  commit({ ...state, marks: { ...state.marks, [date]: day } });
}
export function setMany(date, workerIds, status, { onlyEmpty = false } = {}) {
  const day = { ...(state.marks[date] || {}) };
  for (const id of workerIds) { if (onlyEmpty && day[id]?.s) continue; day[id] = { ...(day[id] || {}), s: status }; }
  commit({ ...state, marks: { ...state.marks, [date]: day } });
}
export function copyDay(from, to, workerIds) {
  const src = state.marks[from] || {};
  const day = { ...(state.marks[to] || {}) };
  let n = 0;
  for (const id of workerIds) if (src[id]?.s) { day[id] = { s: src[id].s }; n++; }
  commit({ ...state, marks: { ...state.marks, [to]: day } });
  return n;
}
export function clearDay(date, workerIds) {
  const day = { ...(state.marks[date] || {}) };
  for (const id of workerIds) delete day[id];
  commit({ ...state, marks: { ...state.marks, [date]: day } });
}
export const lockOf = (date, teamId) => state.locks[date]?.[teamId || 'all'];
export function setLock(date, teamId, by) {
  const d = { ...(state.locks[date] || {}) };
  if (by) d[teamId || 'all'] = { by, at: Date.now() }; else delete d[teamId || 'all'];
  commit({ ...state, locks: { ...state.locks, [date]: d } });
}

/* ---------- derived ---------- */
export const isOffDay = (date) => state.settings.weekOff.includes(weekday(date)) || !!state.holidays[date];
export function today() { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
export const workersOf = (teamId, { includeInactive = false } = {}) =>
  state.workers.filter((w) => (includeInactive || w.active) && (!teamId || w.teamId === teamId)).sort((a, b) => a.name.localeCompare(b.name));

export function monthSummary(ym, teamId) {
  const { from, to } = monthBounds(ym);
  const days = dateRange(from, to);
  const ws = workersOf(teamId, { includeInactive: true });
  const t = today();
  const rows = ws.map((w) => {
    const c = { P: 0, H: 0, A: 0, L: 0, S: 0, O: 0, ot: 0, unmarked: 0, workdays: 0 };
    for (const d of days) {
      if (d > t) continue;
      const m = state.marks[d]?.[w.id];
      const off = isOffDay(d);
      if (!off) c.workdays++;
      if (m?.s) c[m.s]++; else if (!off && d >= (w.joined || '0')) c.unmarked++;
      c.ot += Number(m?.ot) || 0;
    }
    const paid = c.P + c.H * 0.5;
    return { worker: w, ...c, paid, rate: c.workdays ? paid / c.workdays : null };
  }).filter((r) => r.worker.active || r.P + r.H + r.A + r.L + r.S > 0);
  return { from, to, days, rows };
}

export function dayCounts(date, ids) {
  const c = { P: 0, H: 0, A: 0, L: 0, S: 0, O: 0, none: 0 };
  for (const id of ids) { const s = state.marks[date]?.[id]?.s; if (s) c[s]++; else c.none++; }
  return c;
}

/* ---------- backup ---------- */
export const exportJson = () => JSON.stringify({ app: 'musterdesk', exported: new Date().toISOString(), ...state }, null, 1);
export function importJson(text) {
  const d = JSON.parse(text);
  if (!d || !Array.isArray(d.workers) || typeof d.marks !== 'object') throw new Error('This file is not a Musterdesk backup');
  const { app, exported, ...rest } = d;
  commit({ ...blank(), ...rest });
}
export function initEmpty(settings) { commit({ ...blank(), settings: { ...blank().settings, ...settings } }); }
export function wipe() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } state = null; listeners.forEach((f) => f(state)); }

/* ---------- demo ---------- */
const NAMES = ['Ahmed Raza', 'Suresh Kumar', 'Jomar Dela Cruz', 'Imran Khan', 'Rajesh Pillai', 'Abdul Basit', 'Mohammed Saleem', 'Ramesh Yadav', 'Noel Garcia', 'Faisal Mehmood', 'Anil Thapa', 'Sajid Ali', 'Prakash Rai', 'Ronaldo Reyes', 'Tariq Aziz', 'Vijay Nair', 'Kamal Hossain', 'Shahid Iqbal', 'Bikash Gurung', 'Arnel Santos', 'Waqas Javed', 'Manoj Sharma', 'Rafiq Uddin', 'Edwin Mendoza', 'Zubair Ahmed', 'Deepak Singh', 'Nasir Hussain', 'Ganesh Tamang', 'Mark Villanueva', 'Usman Ghani', 'Rahul Verma', 'Jamal Uddin', 'Hari Bahadur', 'Christian Ramos', 'Asif Mahmood', 'Sanjay Patel', 'Mizanur Rahman', 'Krishna Shrestha', 'Jerome Bautista', 'Adeel Anwar', 'Ravi Teja', 'Habib Rahman', 'Dil Kumar', 'Allan Torres', 'Kashif Nawaz', 'Mohan Lal', 'Shafiq Islam', 'Ram Prasad'];
const TEAMS = [
  ['Joinery Workshop', 'Main workshop', 'Carpenter', 'Joiner', 'Polisher', 'Helper'],
  ['Site A · Marina Villa', 'Marina', 'Mason', 'Tiler', 'Painter', 'Helper', 'Electrician'],
  ['Site B · Downtown Office', 'Downtown', 'Gypsum Fixer', 'Painter', 'Electrician', 'Plumber', 'Helper'],
  ['Warehouse & Logistics', 'Warehouse', 'Storekeeper', 'Driver', 'Loader'],
  ['Maintenance Crew', 'Mobile', 'AC Technician', 'Plumber', 'Electrician', 'Handyman']
];
export function seedDemo(company = 'Northwind Builders') {
  let s = 7;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const teams = TEAMS.map(([name, site]) => ({ id: uid(), name, site, supervisor: ['Khalid Mansoor', 'Peter Fernandes', 'Ali Haider', 'Sunil Joshi', 'Omar Farooq'][TEAMS.findIndex((t) => t[0] === name)] }));
  const workers = NAMES.map((name, i) => {
    const ti = i % TEAMS.length; const trades = TEAMS[ti].slice(2);
    return { id: uid(), code: 'W' + String(201 + i), name, trade: trades[Math.floor(rnd() * trades.length)], phone: '', teamId: teams[ti].id, active: true, joined: addDays(today(), -120) };
  });
  const marks = {}; const locks = {};
  const t = today();
  const weekOff = [0];
  const holidays = { [addDays(t, -19)]: 'Public holiday' };
  for (let b = 62; b >= 1; b--) {
    const d = addDays(t, -b);
    if (weekOff.includes(weekday(d)) || holidays[d]) continue;
    const day = {};
    workers.forEach((w, i) => {
      const r = rnd(); const flaky = i % 9 === 4;
      let st = 'P';
      if (r > (flaky ? 0.84 : 0.95)) st = rnd() < 0.55 ? 'A' : rnd() < 0.5 ? 'S' : 'H';
      if (i % 13 === 6 && b > 20 && b < 27) st = 'L';
      day[w.id] = { s: st, ...(st === 'P' && rnd() < 0.22 ? { ot: [1, 2, 2, 3, 4][Math.floor(rnd() * 5)] } : {}) };
    });
    marks[d] = day;
    locks[d] = Object.fromEntries(teams.map((tm) => [tm.id, { by: tm.supervisor, at: Date.now() }]));
  }
  // Today: two teams already marked, the rest pending
  if (!weekOff.includes(weekday(t))) {
    const day = {};
    workers.filter((w) => w.teamId === teams[0].id || w.teamId === teams[3].id).forEach((w) => { day[w.id] = { s: rnd() < 0.92 ? 'P' : 'A' }; });
    marks[t] = day;
  }
  commit({ ...blank(), settings: { ...blank().settings, company, weekOff, supervisor: 'Khalid Mansoor' }, teams, workers, marks, locks, holidays, demo: true });
}
