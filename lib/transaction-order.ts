interface DatedTransaction {
  id: string;
  transactionDate: string;
  createdAt: number;
}

export function compareTransactions(a: DatedTransaction, b: DatedTransaction) {
  return (
    b.transactionDate.localeCompare(a.transactionDate) ||
    b.createdAt - a.createdAt ||
    b.id.localeCompare(a.id)
  );
}

interface DayTransaction extends DatedTransaction {
  type: 'expense' | 'income';
  amount: number;
}

export function groupTransactionDays<T extends DayTransaction>(
  transactions: T[],
) {
  const days = new Map<
    string,
    { date: string; items: T[]; expense: number; income: number }
  >();
  for (const item of [...transactions].sort(compareTransactions)) {
    const group = days.get(item.transactionDate) || {
      date: item.transactionDate,
      items: [],
      expense: 0,
      income: 0,
    };
    group.items.push(item);
    group[item.type] += item.amount;
    days.set(item.transactionDate, group);
  }
  return [...days.values()];
}

export function replaceTransaction<T extends DatedTransaction>(
  transactions: T[],
  originalId: string,
  saved: T,
) {
  return [
    ...transactions.filter(
      (item) => item.id !== originalId && item.id !== saved.id,
    ),
    saved,
  ].sort(compareTransactions);
}

// A queue-change event can publish a placeholder before the submit callback.
// Merge by row identity, never by merchant/date/amount: identical purchases
// with different mutation IDs are legitimate separate transactions.
export function mergeTransactionRows<T extends DatedTransaction>(
  current: T[],
  incoming: T[],
  retiredIds: ReadonlySet<string> = new Set(),
) {
  const rows = new Map<string, T>();
  for (const item of current) {
    if (!retiredIds.has(item.id) && !rows.has(item.id)) rows.set(item.id, item);
  }
  for (const item of incoming) rows.set(item.id, item);
  return [...rows.values()].sort(compareTransactions);
}
