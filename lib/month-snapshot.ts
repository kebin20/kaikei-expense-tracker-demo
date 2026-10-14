interface PeriodRecord {
  period: string;
}

export const MONTH_REFRESH_CAS_SQL =
  'UPDATE app_meta SET value = ?1 WHERE key = ?2 AND value = ?3';
export const COMPACT_INVALIDATE_SQL =
  'DELETE FROM app_meta WHERE key = ?1 AND EXISTS (SELECT 1 FROM app_meta WHERE key = ?2 AND value = ?3)';
export const COMPACT_WARM_SQL = `INSERT INTO app_meta (key, value) SELECT ?1, ?2
  WHERE EXISTS (SELECT 1 FROM app_meta WHERE key = ?3 AND value = ?4)
  ON CONFLICT(key) DO UPDATE SET value = excluded.value`;
interface Snapshot {
  transactions: (PeriodRecord & { type?: string; amount?: number })[];
  budgets: PeriodRecord[];
  syncedAt?: string;
  periodSyncedAt?: Record<string, string>;
  periodSummaries?: Array<{
    period: string;
    income: number;
    expense: number;
    balance: number;
  }>;
}

// A month snapshot's opening balance is not the workbook's opening balance.
// Keep all workbook metadata and history, replacing only the requested month.
export function mergeMonthSnapshot<T extends Snapshot>(
  base: T,
  month: Snapshot,
  period: string,
): T {
  if (
    [...month.transactions, ...month.budgets].some(
      (item) => item.period !== period,
    )
  )
    throw new Error('The Sheet returned records outside the requested month.');
  let periodSummaries = base.periodSummaries;
  const summary = periodSummaries?.find((item) => item.period === period);
  if (
    summary &&
    month.transactions.every((item) => typeof item.amount === 'number')
  ) {
    const income = month.transactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount!, 0);
    const expense = month.transactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount!, 0);
    const delta = income - expense - (summary.income - summary.expense);
    periodSummaries = periodSummaries!.map((item) => ({
      ...item,
      ...(item.period === period ? { income, expense } : {}),
      balance: item.balance + (item.period >= period ? delta : 0),
    }));
  }
  return {
    ...base,
    ...(periodSummaries ? { periodSummaries } : {}),
    transactions: [
      ...base.transactions.filter((item) => item.period !== period),
      ...month.transactions,
    ],
    budgets: [
      ...base.budgets.filter((item) => item.period !== period),
      ...month.budgets,
    ],
    syncedAt: month.syncedAt,
    periodSyncedAt: {
      ...base.periodSyncedAt,
      ...(month.syncedAt ? { [period]: month.syncedAt } : {}),
    },
  };
}
