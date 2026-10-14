interface Transaction {
  id: string;
  type: string;
  transactionDate: string;
  description: string;
  category: string;
  amount: number;
}
interface Budget {
  type: string;
  category: string;
  plannedAmount: number;
  creditCardGrossAmount?: number | null;
}
interface Snapshot {
  transactions: Transaction[];
  budgets: Budget[];
}

export interface ReconciliationResult {
  checkedAt: string;
  differences: Array<{
    kind: string;
    label: string;
    app: string;
    sheet: string;
  }>;
  app: { count: number; income: number; expense: number };
  sheet: { count: number; income: number; expense: number };
}

export function compareSnapshots(
  app: Snapshot,
  sheet: Snapshot,
): ReconciliationResult {
  const differences: ReconciliationResult['differences'] = [];
  const fingerprint = (item: Transaction) =>
    JSON.stringify([
      item.type,
      item.transactionDate,
      item.amount,
      item.description,
      item.category,
    ]);
  // Match content as a multiset: Sheet row IDs can shift after a backdated insertion.
  const byContent = new Map<string, number[]>();
  sheet.transactions.forEach((item, index) => {
    const key = fingerprint(item);
    const bucket = byContent.get(key) || [];
    bucket.push(index);
    byContent.set(key, bucket);
  });
  const matchedSheet = new Set<number>();
  const unmatchedApp = app.transactions.filter((item) => {
    const index = byContent.get(fingerprint(item))?.pop();
    if (index === undefined) return true;
    matchedSheet.add(index);
    return false;
  });
  const unmatchedSheet = sheet.transactions.filter(
    (_, index) => !matchedSheet.has(index),
  );
  const byId = new Map<string, number[]>();
  unmatchedSheet.forEach((item, index) => {
    const bucket = byId.get(item.id) || [];
    bucket.push(index);
    byId.set(item.id, bucket);
  });
  const changedSheet = new Set<number>();
  const describe = (item: Transaction) =>
    `${item.transactionDate} · ${item.category} · ¥${item.amount.toLocaleString('en-US')}`;
  for (const item of unmatchedApp) {
    const index = byId.get(item.id)?.pop();
    const other = index === undefined ? undefined : unmatchedSheet[index];
    if (index !== undefined) changedSheet.add(index);
    differences.push({
      kind: other ? 'Changed' : 'App only',
      label: item.description,
      app: describe(item),
      sheet: other
        ? `${other.description} · ${describe(other)}`
        : 'Not present',
    });
  }
  for (const [index, item] of unmatchedSheet.entries()) {
    if (changedSheet.has(index)) continue;
    differences.push({
      kind: 'Sheet only',
      label: item.description,
      app: 'Not present',
      sheet: describe(item),
    });
  }
  const keys = new Set(
    [...app.budgets, ...sheet.budgets].map(
      (item) => `${item.type}:${item.category}`,
    ),
  );
  const budgetValue = (item?: Budget) =>
    item
      ? `Estimate ¥${item.plannedAmount.toLocaleString('en-US')}${item.creditCardGrossAmount == null ? '' : ` · Bill ¥${item.creditCardGrossAmount.toLocaleString('en-US')}`}`
      : 'Not present';
  for (const key of keys) {
    const a = app.budgets.find(
      (item) => `${item.type}:${item.category}` === key,
    );
    const b = sheet.budgets.find(
      (item) => `${item.type}:${item.category}` === key,
    );
    if (budgetValue(a) !== budgetValue(b))
      differences.push({
        kind: 'Estimate / bill',
        label: key.slice(key.indexOf(':') + 1),
        app: budgetValue(a),
        sheet: budgetValue(b),
      });
  }
  const totals = (items: Transaction[]) => ({
    count: items.length,
    income: items
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0),
    expense: items
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0),
  });
  return {
    checkedAt: new Date().toISOString(),
    differences,
    app: totals(app.transactions),
    sheet: totals(sheet.transactions),
  };
}
