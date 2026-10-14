import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { calendarPeriod, defaultLedgerPeriod } from './calendar-period.ts';
import { getTokyoClock } from '../app/tokyo-clock.ts';

const prepared = ['2026-08', '2026-09', '2026-10'];
assert.equal(calendarPeriod(prepared, '2026-09-30'), '2026-09');
assert.equal(calendarPeriod(prepared, '2026-10-01'), '2026-10');
assert.equal(calendarPeriod(prepared, '2026-11-01'), '2026-10');
assert.equal(calendarPeriod(['2026-12', '2027-01'], '2026-12-31'), '2026-12');
assert.equal(calendarPeriod(['2026-12', '2027-01'], '2027-01-01'), '2027-01');
assert.equal(calendarPeriod([], '2026-09-30'), '2026-09');
assert.equal(calendarPeriod(['2026-10'], '2026-09-30'), '2026-09');
const ledger = { budgets: prepared.map((period) => ({ period })), transactions: [] };
assert.equal(defaultLedgerPeriod(ledger, '2026-09-30'), '2026-09');
assert.equal(defaultLedgerPeriod({ ...ledger, budgets: [{ period: '2026-10' }],
  periodSummaries: prepared.map((period) => ({ period })) }, '2026-09-30'), '2026-09');
assert.equal(getTokyoClock(new Date('2026-09-30T14:59:59Z')).date, '2026-09-30');
assert.equal(getTokyoClock(new Date('2026-09-30T15:00:00Z')).date, '2026-10-01');

// The compact database query must use the same calendar rule as cached Sheets data.
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE transactions(period TEXT); CREATE TABLE budgets(period TEXT);');
const insert = db.prepare('INSERT INTO budgets VALUES (?)');
prepared.forEach((period) => insert.run(period));
const query = db.prepare(`SELECT COALESCE(MAX(period), ?1) AS period FROM (
  SELECT period FROM transactions UNION SELECT period FROM budgets
) WHERE period <= ?1`);
for (const date of ['2026-09-30', '2026-10-01', '2026-11-01']) {
  assert.equal(query.get(date.slice(0, 7)).period, calendarPeriod(prepared, date));
}
db.close();
console.log('Calendar-month defaults, compact query, and Tokyo rollover checks passed.');
