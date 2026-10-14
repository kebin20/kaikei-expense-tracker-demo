import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyBudgetSave, rollbackBudgetSave } from './budget-save.ts';

const original = {
  id: 'week-1',
  period: '2026-10',
  type: 'expense',
  category: 'Week 1',
  plannedAmount: 20000,
  updatedAt: 0,
};
const untouched = { ...original, id: 'next-month', period: '2026-11' };
const ledger = {
  budgets: [original, untouched],
  transactions: [
    { id: 'a', period: '2026-10', type: 'expense', category: 'Week 1' },
    { id: 'b', period: '2026-11', type: 'expense', category: 'Week 1' },
    { id: 'c', period: '2026-10', type: 'income', category: 'Week 1' },
  ],
};
test('immediate estimate/rename previews are scoped; confirmation replaces them without duplicates', () => {
  const preview = { ...original, category: 'First week', plannedAmount: 25000 };
  const next = applyBudgetSave(ledger, preview, original.category);
  assert.equal(next.budgets[0].plannedAmount, 25000);
  assert.equal(next.transactions[0].category, 'First week');
  assert.equal(next.transactions[1].category, 'Week 1');
  assert.equal(next.transactions[2].category, 'Week 1');
  const saved = applyBudgetSave(
    next,
    { ...preview, id: 'sheet-confirmed-id' },
    preview.category,
  );
  assert.equal(saved.budgets.length, 2);
  assert.equal(saved.budgets[0].id, 'sheet-confirmed-id');
  assert.equal(ledger.budgets[0].plannedAmount, 20000);
});
test('rejected edits restore only this category and retain unrelated changes', () => {
  const preview = { ...original, category: 'Renamed', recurring: false };
  const next = applyBudgetSave(ledger, preview, original.category);
  next.budgets.push({ ...original, id: 'another', category: 'Unrelated' });
  const restored = rollbackBudgetSave(next, preview, original);
  assert.deepEqual(restored.budgets[0], original);
  assert.equal(restored.budgets.length, 3);
  assert.equal(restored.transactions[0].category, original.category);
});
test('new categories replace temporary IDs on confirmation and are removed on rejection', () => {
  const preview = { ...original, id: 'pending-new', category: 'New' };
  const next = applyBudgetSave(ledger, preview);
  assert.equal(next.budgets.length, 3);
  assert.equal(
    applyBudgetSave(next, { ...preview, id: 'confirmed' }, preview.category)
      .budgets.length,
    3,
  );
  assert.deepEqual(rollbackBudgetSave(next, preview, null), ledger);
});
