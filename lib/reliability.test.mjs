import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  preserveWeeklyIdentity,
  weeklyCategoryNumber,
} from './category-identity.ts';
import { updateLedgerSummaries } from './ledger-summaries.ts';
import { mergeMonthSnapshot } from './month-snapshot.ts';
import { validPendingWrite, pendingWriteConfirmed } from './save-recovery.ts';
import { validateTransactionDelete } from './transaction-delete.ts';

test('renamed/emoji weeks preserve their spending role without moving to another week', () => {
  for (const name of ['Groceries', '🛒 Groceries']) {
    const renamed = preserveWeeklyIdentity('Week 2', name);
    assert.equal(weeklyCategoryNumber(renamed), 2);
    assert.match(renamed, /Week 2 · Groceries/);
    assert.equal(preserveWeeklyIdentity(renamed, renamed), renamed);
  }
  assert.throws(() => preserveWeeklyIdentity('Week 1', 'Week 3'), /week/i);
  assert.equal(preserveWeeklyIdentity('Rent', 'Housing'), 'Housing');
});

const tx = { id: 'a', period: '2026-10', type: 'expense', amount: 500 };
const compact = {
  compact: true,
  initialBalance: 1000,
  transactions: [tx],
  budgets: [],
  periodSummaries: [
    { period: '2026-09', income: 200, expense: 100, balance: 1100 },
    { period: '2026-10', income: 800, expense: 500, balance: 1400 },
    { period: '2026-11', income: 0, expense: 0, balance: 1400 },
  ],
};
test('compact edits, queued confirmation, deletion/undo and cross-month moves keep totals correct', () => {
  const edited = updateLedgerSummaries(compact, {
    ...compact,
    transactions: [{ ...tx, amount: 700 }],
  });
  assert.equal(edited.periodSummaries[1].balance, 1200);
  assert.equal(edited.periodSummaries[2].balance, 1200);
  assert.equal(edited.periodSummaries[0].balance, 1100);
  const deleted = updateLedgerSummaries(edited, {
    ...edited,
    transactions: [],
  });
  const undo = updateLedgerSummaries(deleted, {
    ...deleted,
    transactions: edited.transactions,
  });
  assert.deepEqual(undo.periodSummaries, edited.periodSummaries);
  const confirmed = updateLedgerSummaries(compact, {
    ...compact,
    transactions: [{ ...tx, id: 'saved-a' }],
  });
  assert.deepEqual(confirmed.periodSummaries, compact.periodSummaries);
  const moved = updateLedgerSummaries(compact, {
    ...compact,
    transactions: [{ ...tx, period: '2026-09' }],
  });
  assert.equal(moved.periodSummaries[0].expense, 600);
  assert.equal(moved.periodSummaries[1].expense, 0);
  assert.equal(moved.periodSummaries[2].balance, 1400);
  assert.equal(compact.periodSummaries[0].expense, 100);
});
test('authoritative month replacement recomputes that month, not partial loaded historical rows', () => {
  const month = {
    transactions: [{ ...tx, period: '2026-09', amount: 150 }],
    budgets: [],
  };
  const reconciled = mergeMonthSnapshot(compact, month, '2026-09');
  assert.equal(reconciled.periodSummaries[0].expense, 150);
  assert.equal(reconciled.periodSummaries[0].income, 0);
  assert.equal(reconciled.periodSummaries[2].balance, 1150);
  assert.deepEqual(updateLedgerSummaries(compact, reconciled), reconciled);
});
test('recovery rejects corrupt JSON and never guesses a transaction deletion from row absence', () => {
  const draft = {
    url: '/api/ledger/gstx%7C2026-09%7Cexpense%7C5',
    method: 'DELETE',
    period: '2026-09',
  };
  assert.equal(validPendingWrite({ ...draft, body: '{' }), false);
  assert.equal(validPendingWrite({ ...draft, body: 'null' }), false);
  assert.equal(
    pendingWriteConfirmed(draft, { transactions: [], budgets: [] }),
    false,
  );
  assert.throws(
    () =>
      validateTransactionDelete('gstx|2026-09|expense|5', {
        period: '2026-10',
        clientMutationId: 'delete-1',
        originalFingerprint: 'original',
      }),
    /month/,
  );
});
