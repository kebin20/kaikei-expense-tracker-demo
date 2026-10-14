import { defaultLedgerPeriod } from './calendar-period.ts';
import type { LedgerData } from '../app/kaikei-app';
import { mergeMonthSnapshot } from './month-snapshot.ts';

// Keep historical totals, not historical rows, in the launch record. The full
// ledger remains independently available for exports and history hydration.
export function startupLedger(data: LedgerData, today: string): LedgerData {
  if (data.compact) return data;
  const totals = new Map<string, { income: number; expense: number }>();
  for (const item of [...data.budgets, ...data.transactions])
    if (!totals.has(item.period))
      totals.set(item.period, { income: 0, expense: 0 });
  for (const item of data.transactions) {
    const total = totals.get(item.period)!;
    total[item.type] += item.amount;
  }
  let balance = data.initialBalance;
  const periodSummaries =
    data.periodSummaries ||
    [...totals.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, total]) => {
        balance += total.income - total.expense;
        return { period, ...total, balance };
      });
  const detailPeriod = defaultLedgerPeriod({ ...data, periodSummaries }, today);
  return {
    ...data,
    compact: true,
    detailPeriod,
    latestPeriod: periodSummaries.at(-1)?.period,
    periodSummaries,
    transactions: data.transactions.filter(
      (item) => item.period === detailPeriod,
    ),
    budgets: data.budgets.filter((item) => item.period === detailPeriod),
  };
}

export function cachedMonthLedger(
  base: LedgerData,
  full: LedgerData,
  period: string,
): LedgerData | null {
  if (full.compact) return null;
  const month = startupLedger(full, `${period}-01`);
  if (month.detailPeriod !== period) return null;
  const cachedTime = full.periodSyncedAt?.[period] || full.syncedAt;
  const knownTime = base.periodSyncedAt?.[period];
  if (
    knownTime &&
    (Date.parse(knownTime) || 0) > (Date.parse(cachedTime || '') || 0)
  )
    return null;
  // Only this month's rows may come from history; keep current workbook totals
  // for other months and never invent freshness for an offline read.
  const merged = mergeMonthSnapshot(
    { ...base, periodSummaries: base.periodSummaries || month.periodSummaries },
    { ...month, syncedAt: cachedTime },
    period,
  );
  return {
    ...merged,
    compact: true,
    detailPeriod: period,
    syncedAt: base.syncedAt,
  };
}
