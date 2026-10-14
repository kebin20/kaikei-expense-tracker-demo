import type { BudgetPlan, LedgerTransaction } from './ledger-types';

interface BudgetLedger {
  budgets: BudgetPlan[];
  transactions: LedgerTransaction[];
}

// Use the same month/type match for the immediate preview and the confirmed save.
export function applyBudgetSave<T extends BudgetLedger>(
  ledger: T,
  item: BudgetPlan,
  originalCategory?: string,
): T {
  const matches = (entry: BudgetPlan) =>
    entry.period === item.period &&
    entry.type === item.type &&
    entry.category === (originalCategory || item.category);
  const exists = ledger.budgets.some(matches);
  return {
    ...ledger,
    budgets: exists
      ? ledger.budgets.map((entry) =>
          matches(entry) ? { ...entry, ...item } : entry,
        )
      : [...ledger.budgets, item],
    transactions:
      originalCategory && originalCategory !== item.category
        ? ledger.transactions.map((entry) =>
            entry.period === item.period &&
            entry.type === item.type &&
            entry.category === originalCategory
              ? { ...entry, category: item.category }
              : entry,
          )
        : ledger.transactions,
  };
}

// Restore only this edit, preserving unrelated ledger changes made meanwhile.
export function rollbackBudgetSave<T extends BudgetLedger>(
  ledger: T,
  preview: BudgetPlan,
  original: BudgetPlan | null,
): T {
  if (original) {
    const restored = applyBudgetSave(ledger, original, preview.category);
    return {
      ...restored,
      budgets: restored.budgets.map((entry) =>
        entry.period === original.period &&
        entry.type === original.type &&
        entry.category === original.category
          ? original
          : entry,
      ),
    };
  }
  return {
    ...ledger,
    budgets: ledger.budgets.filter((entry) => entry.id !== preview.id),
  };
}
