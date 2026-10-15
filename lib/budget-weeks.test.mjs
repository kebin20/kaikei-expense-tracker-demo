import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { budgetWeekNumber, budgetWeekRange } from './budget-weeks.ts';
import { weeklyCategoryNumber } from './category-identity.ts';

test('October labels match the requested four calendar buckets exactly', () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((week) => budgetWeekRange('2026-10', week).label),
    [
      'October 1st – 7th',
      'October 8th – 15th',
      'October 16th – 23rd',
      'October 24th – 31st',
    ],
  );
});

test('day selection matches every boundary, including the 15th and 23rd', () => {
  for (const [day, week] of [
    [1, 1],
    [7, 1],
    [8, 2],
    [14, 2],
    [15, 2],
    [16, 3],
    [21, 3],
    [22, 3],
    [23, 3],
    [24, 4],
    [28, 4],
    [29, 4],
    [30, 4],
    [31, 4],
  ])
    assert.equal(budgetWeekNumber(day), week, `day ${day}`);
});

test('every real day is covered exactly once for 28, 29, 30 and 31-day months', () => {
  for (const [period, last] of [
    ['2026-02', 28],
    ['2028-02', 29],
    ['2026-04', 30],
    ['2026-10', 31],
    ['2000-02', 29],
    ['2100-02', 28],
    ['2026-12', 31],
    ['2027-01', 31],
  ]) {
    let next = 1;
    for (const week of [1, 2, 3, 4]) {
      const range = budgetWeekRange(period, week);
      assert.equal(range.startDay, next);
      for (let day = range.startDay; day <= range.endDay; day++)
        assert.equal(budgetWeekNumber(day), week);
      next = range.endDay + 1;
    }
    assert.equal(next, last + 1);
  }
  assert.equal(budgetWeekRange('2026-02', 4).label, 'February 24th – 28th');
  assert.equal(budgetWeekRange('2028-02', 4).label, 'February 24th – 29th');
  assert.equal(budgetWeekRange('2026-04', 4).label, 'April 24th – 30th');
});

test('renamed and emoji weeks retain their category identity; formatting is display-only', () => {
  for (const name of [
    'Week 2',
    'Week 2 · Groceries',
    '🛒 Week 2 · Groceries',
  ]) {
    assert.equal(
      budgetWeekRange('2026-10', weeklyCategoryNumber(name)).label,
      'October 8th – 15th',
    );
    assert.equal(weeklyCategoryNumber(name), 2);
  }
  for (const period of ['', '2026-00', '2026-13', '26-10', '2026-2'])
    assert.throws(() => budgetWeekRange(period, 1), RangeError);
  for (const week of [0, 5, 1.2, NaN])
    assert.throws(() => budgetWeekRange('2026-10', week), RangeError);
  for (const day of [0, 32, -1, NaN, Infinity, 1.5])
    assert.throws(() => budgetWeekNumber(day), RangeError);
});

test('cards describe their date range accessibly and the guide/default selection share the same calendar rule', async () => {
  const app = await readFile(
    new URL('../app/kaikei-app.tsx', import.meta.url),
    'utf8',
  );
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.ok(app.includes('aria-describedby={`${item.id}-week-range`}'));
  assert.match(app, /className="pulse-week-range"[\s\S]{0,160}\{range.label\}/);
  assert.ok(app.includes('const week = budgetWeekNumber(anchor.date())'));
  assert.ok(app.includes('start.date(range.endDay)'));
  assert.ok(app.includes('String(budgetWeekNumber(today.date()))'));
  assert.ok(
    app.indexOf('if (categoryWeek) return categoryWeek') <
      app.indexOf(
        'return budgetWeekNumber(dayjs(item.transactionDate).date())',
      ),
  );
  assert.match(css, /\.pulse-week-range\s*\{[^}]*white-space: normal/);
});
