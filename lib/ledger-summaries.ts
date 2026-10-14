interface Transaction {
  period: string;
  type: string;
  amount: number;
}
interface Summary {
  period: string;
  income: number;
  expense: number;
  balance: number;
}
interface Ledger {
  transactions: Transaction[];
  initialBalance: number;
  periodSummaries?: Summary[];
}

function totals(items: Transaction[]) {
  const result = new Map<string, { income: number; expense: number }>();
  for (const item of items) {
    const sum = result.get(item.period) || { income: 0, expense: 0 };
    if (item.type === 'income') sum.income += item.amount;
    if (item.type === 'expense') sum.expense += item.amount;
    result.set(item.period, sum);
  }
  return result;
}

// Compact ledgers omit historical rows. Apply only the changed rows' delta,
// rather than rebuilding workbook totals from an incomplete transaction list.
export function updateLedgerSummaries<T extends Ledger>(
  before: T,
  after: T,
): T {
  if (
    !before.periodSummaries ||
    before.periodSummaries !== after.periodSummaries ||
    before.transactions === after.transactions
  )
    return after;
  const oldTotals = totals(before.transactions);
  const newTotals = totals(after.transactions);
  const summaries = new Map(
    before.periodSummaries.map((item) => [item.period, { ...item }]),
  );
  for (const period of new Set([...oldTotals.keys(), ...newTotals.keys()])) {
    const old = oldTotals.get(period) || { income: 0, expense: 0 };
    const next = newTotals.get(period) || { income: 0, expense: 0 };
    const summary = summaries.get(period) || {
      period,
      income: 0,
      expense: 0,
      balance: 0,
    };
    summary.income += next.income - old.income;
    summary.expense += next.expense - old.expense;
    summaries.set(period, summary);
  }
  let balance = after.initialBalance;
  const periodSummaries = [...summaries.values()].sort((a, b) =>
    a.period.localeCompare(b.period),
  );
  for (const summary of periodSummaries) {
    balance += summary.income - summary.expense;
    summary.balance = balance;
  }
  return { ...after, periodSummaries };
}
