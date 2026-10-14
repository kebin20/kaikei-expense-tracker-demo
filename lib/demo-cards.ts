import { weeklyCategoryNumber } from './category-identity.ts';
import type { LedgerData } from '../app/kaikei-app';

const name = (category: string) =>
  category
    .replace(/^\p{Extended_Pictographic}\S*\s*/u, '')
    .trim()
    .toLowerCase();
export function recalculateDemoCards(data: LedgerData): LedgerData {
  let transactions = [...data.transactions];
  const budgets = data.budgets.map((bill) => {
    if (
      bill.type !== 'expense' ||
      name(bill.category) !== 'credit card' ||
      bill.creditCardGrossAmount == null
    )
      return bill;
    const fixed = new Set(
      data.budgets
        .filter(
          (row) =>
            row.period === bill.period &&
            row.type === 'expense' &&
            weeklyCategoryNumber(row.category) === null &&
            !['rent', 'credit card'].includes(name(row.category)),
        )
        .map((row) => row.category),
    );
    const total = transactions
      .filter(
        (row) =>
          row.period === bill.period &&
          row.type === 'expense' &&
          fixed.has(row.category),
      )
      .reduce((sum, row) => sum + row.amount, 0);
    const net = bill.creditCardGrossAmount - total;
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger(net))
      throw new Error('The demo bill exceeds safe whole-yen totals.');
    transactions = transactions.filter(
      (row) =>
        !(
          row.period === bill.period &&
          row.type === 'expense' &&
          row.category === bill.category
        ),
    );
    if (net !== 0)
      transactions.push({
        id: 'demo-card-' + bill.id,
        transactionDate: bill.period + '-01',
        period: bill.period,
        type: 'expense',
        amount: net,
        description: 'Credit Card (full bill minus fixed costs)',
        category: bill.category,
        source: 'google-sheet-summary',
        createdAt: bill.updatedAt,
      });
    return { ...bill, creditCardFixedCosts: total };
  });
  return { ...data, budgets, transactions };
}
