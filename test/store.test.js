import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../app/store.js';

test('bulk marking only fills empty rows and counts correctly', () => {
  S.initEmpty({ company: 'Test Co', weekOff: [0] });
  S.saveTeam({ name: 'Crew A' });
  const team = S.getState().teams[0].id;
  for (const n of ['Ali', 'Bea', 'Cal']) S.saveWorker({ name: n, code: n.toUpperCase(), teamId: team });
  const ids = S.workersOf(team).map((w) => w.id);
  S.setMark('2026-03-02', ids[0], { s: 'A' });
  S.setMany('2026-03-02', ids, 'P', { onlyEmpty: true });
  assert.deepEqual(S.dayCounts('2026-03-02', ids), { P: 2, H: 0, A: 1, L: 0, S: 0, O: 0, none: 0 });
});

test('copy previous day and duplicate IDs', () => {
  const ids = S.workersOf().map((w) => w.id);
  assert.equal(S.copyDay('2026-03-02', '2026-03-03', ids), 3);
  assert.throws(() => S.saveWorker({ name: 'Dup', code: 'ali' }), /already used/);
});

test('monthly summary counts half days as half a paid day', () => {
  const ids = S.workersOf().map((w) => w.id);
  S.setMark('2026-03-04', ids[1], { s: 'H', ot: 2 });
  const row = S.monthSummary('2026-03').rows.find((r) => r.worker.id === ids[1]);
  assert.equal(row.H, 1); assert.equal(row.ot, 2);
  assert.equal(row.paid, row.P + 0.5);
});

test('backup round-trips', () => {
  const json = S.exportJson();
  S.wipe(); assert.ok(S.isEmpty());
  S.importJson(json);
  assert.equal(S.getState().workers.length, 3);
  assert.throws(() => S.importJson('{"foo":1}'), /not a Musterdesk backup/);
});
