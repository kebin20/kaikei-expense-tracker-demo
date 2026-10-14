import type { LedgerData, LedgerTransaction } from '../app/kaikei-app';
import { isCalendarDate, isCalendarPeriod } from './calendar-validation.ts';
import { mergeMonthSnapshot } from './month-snapshot.ts';
import { validPendingEdit } from './transaction-save.ts';
import { validPendingWrite } from './save-recovery.ts';
import type { RecoveryRecord } from './recovery-storage.ts';

export interface BackupFile {
  ledger: LedgerData;
  version?: string;
  exportedAt?: string;
  queuedTransactions?: unknown[];
  recoveryDrafts?: RecoveryRecord[];
  historySource?: 'network' | 'device-cache';
  historyAsOf?: string;
}
const text = (value: unknown) =>
  typeof value === 'string' && value.length > 0 && value.length < 65536;
function transactionValid(row: LedgerTransaction) {
  return (
    row &&
    text(row.id) &&
    isCalendarDate(row.transactionDate) &&
    row.period === row.transactionDate.slice(0, 7) &&
    ['income', 'expense'].includes(row.type) &&
    Number.isSafeInteger(row.amount) &&
    text(row.description) &&
    text(row.category) &&
    text(row.source) &&
    Number.isFinite(row.createdAt)
  );
}
export function validateBackup(value: unknown): BackupFile {
  if (!value || typeof value !== 'object')
    throw new Error('This is not a Kaikei backup.');
  const file = value as BackupFile,
    data = file.ledger;
  if (
    !data ||
    data.compact ||
    !Number.isSafeInteger(data.initialBalance) ||
    !Array.isArray(data.transactions) ||
    !Array.isArray(data.budgets)
  )
    throw new Error('A complete ledger is required for a recovery rehearsal.');
  const ids = new Set<string>();
  for (const row of data.transactions) {
    if (!transactionValid(row) || ids.has(row.id))
      throw new Error(
        'The backup contains an invalid or duplicate transaction.',
      );
    ids.add(row.id);
  }
  const budgets = new Set<string>();
  for (const row of data.budgets) {
    const key = `${row?.period}:${row?.type}:${row?.category}`;
    if (
      !row ||
      !text(row.id) ||
      !isCalendarPeriod(row.period) ||
      !['income', 'expense'].includes(row.type) ||
      !text(row.category) ||
      !Number.isSafeInteger(row.plannedAmount) ||
      row.plannedAmount < 0 ||
      !Number.isFinite(row.updatedAt) ||
      budgets.has(key) ||
      (row.creditCardGrossAmount != null &&
        (!Number.isSafeInteger(row.creditCardGrossAmount) ||
          row.creditCardGrossAmount < 0))
    )
      throw new Error('The backup contains an invalid or duplicate estimate.');
    budgets.add(key);
  }
  if (
    file.queuedTransactions !== undefined &&
    !Array.isArray(file.queuedTransactions)
  )
    throw new Error('The recovery queue is invalid.');
  const mutations = new Set<string>();
  for (const input of file.queuedTransactions || []) {
    const row = input as LedgerTransaction & { clientMutationId?: string };
    if (
      !row ||
      !isCalendarDate(row.transactionDate) ||
      !['income', 'expense'].includes(row.type) ||
      !Number.isSafeInteger(row.amount) ||
      row.amount <= 0 ||
      !text(row.description) ||
      !text(row.category) ||
      !/^[a-zA-Z0-9_-]{1,80}$/.test(row.clientMutationId || '') ||
      mutations.has(row.clientMutationId!)
    )
      throw new Error(
        'The recovery queue contains an invalid or duplicate operation.',
      );
    mutations.add(row.clientMutationId!);
  }
  if (file.recoveryDrafts !== undefined && !Array.isArray(file.recoveryDrafts))
    throw new Error('The recovery drafts are invalid.');
  for (const draft of file.recoveryDrafts || []) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft.value);
    } catch {
      throw new Error('A recovery draft is damaged.');
    }
    if (
      !text(draft.id) ||
      !Number.isFinite(draft.at) ||
      (draft.key === 'kaikei-pending-edit-draft-v1'
        ? !validPendingEdit(parsed)
        : draft.key !== 'kaikei-pending-write-v1' || !validPendingWrite(parsed))
    )
      throw new Error('A recovery operation is invalid.');
  }
  return file;
}

// A backup export may use cached history, but a fresher complete month in the
// current view must win. Never put queued/unconfirmed additions into saved rows.
export function mergeBackupLedger(
  full: LedgerData,
  current: LedgerData | null,
): LedgerData {
  if (full.compact) throw new Error('Complete history is unavailable.');
  full = {
    ...full,
    transactions: full.transactions.filter(
      (row) => !['pending', 'queued'].includes(row.source),
    ),
  };
  if (!current?.compact || !current.detailPeriod) return full;
  const period = current.detailPeriod;
  const time = (data: LedgerData) =>
    Date.parse(data.periodSyncedAt?.[period] || data.syncedAt || '') || 0;
  if (time(full) > time(current)) return full;
  const month = {
    ...current,
    transactions: current.transactions.filter(
      (row) =>
        row.period === period && !['pending', 'queued'].includes(row.source),
    ),
    budgets: current.budgets.filter((row) => row.period === period),
  };
  return { ...mergeMonthSnapshot(full, month, period), compact: false };
}

// Restore into a new in-memory ledger, never into production or the device's
// live stores. Verify exact rows, queues and receipt IDs after serialization.
export function rehearseBackup(value: unknown) {
  const file = validateBackup(value);
  const sandbox = new Map<string, string>();
  sandbox.set('ledger', JSON.stringify(file.ledger));
  sandbox.set('queue', JSON.stringify(file.queuedTransactions || []));
  sandbox.set('recovery', JSON.stringify(file.recoveryDrafts || []));
  const restored = validateBackup({
    ...file,
    ledger: JSON.parse(sandbox.get('ledger')!),
    queuedTransactions: JSON.parse(sandbox.get('queue')!),
    recoveryDrafts: JSON.parse(sandbox.get('recovery')!),
  });
  if (
    JSON.stringify(restored.ledger) !== JSON.stringify(file.ledger) ||
    JSON.stringify(restored.queuedTransactions) !==
      JSON.stringify(file.queuedTransactions || []) ||
    JSON.stringify(restored.recoveryDrafts) !==
      JSON.stringify(file.recoveryDrafts || [])
  )
    throw new Error('Recovery verification failed.');
  const periods = [
    ...new Set(
      [...restored.ledger.transactions, ...restored.ledger.budgets].map(
        (row) => row.period,
      ),
    ),
  ].sort();
  const totals = restored.ledger.transactions.reduce(
    (sum, row) => sum + (row.type === 'income' ? row.amount : -row.amount),
    restored.ledger.initialBalance,
  );
  if (!Number.isSafeInteger(totals))
    throw new Error('The restored balance is outside the safe range.');
  return {
    transactions: restored.ledger.transactions.length,
    budgets: restored.ledger.budgets.length,
    queued: restored.queuedTransactions?.length || 0,
    recovery: restored.recoveryDrafts?.length || 0,
    periods,
    balance: totals,
  };
}
