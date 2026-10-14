import seed from './seed-data.json' with { type: 'json' };
import type { LedgerData } from '../app/kaikei-app';
import { recalculateDemoCards } from './demo-cards.ts';

// Only fictional demo data is extended; the private workbook is never read.
export function freshDemoLedger(): LedgerData {
  const data = structuredClone(seed) as unknown as LedgerData;
  data.seedVersion = 'kaikei-demo-v3.10.1';
  data.sourceFile = 'Fictional demo data';
  data.syncMode = 'database';
  const period = '2026-10';
  const plans: Array<[string, number]> = [
    ['Week 1', 20000],
    ['Week 2', 22500],
    ['Week 3', 25000],
    ['Week 4', 20000],
    ['Rent', 90000],
    ['Internet', 4500],
    ['Netflix', 1200],
    ['Apple One', 1500],
    ['Electricity', 5500],
    ['Gas', 2800],
    ['Water', 2500],
    ['Credit Card', 76000],
  ];
  data.budgets.push(
    ...plans.map(([category, plannedAmount], index) => ({
      id: 'demo-oct-plan-' + index,
      period,
      type: 'expense' as const,
      category,
      plannedAmount,
      updatedAt: 0,
      recurring: !category.startsWith('Week'),
      ...(category === 'Credit Card' ? { creditCardGrossAmount: 80000 } : {}),
    })),
    {
      id: 'demo-oct-paycheck',
      period,
      type: 'income',
      category: 'Paycheck',
      plannedAmount: 360000,
      updatedAt: 0,
      recurring: true,
    },
    {
      id: 'demo-oct-other',
      period,
      type: 'income',
      category: 'Other',
      plannedAmount: 6000,
      updatedAt: 0,
    },
  );
  const rows: Array<[string, number, string, string]> = [
    ['01', 90000, 'Apartment rent', 'Rent'],
    ['01', 4500, 'Internet plan', 'Internet'],
    ['01', 1200, 'Streaming subscription', 'Netflix'],
    ['02', 2250, 'Neighbourhood groceries', 'Week 1'],
    ['02', 540, 'Coffee and pastry', 'Week 1'],
    ['03', 1780, 'Weekend lunch', 'Week 1'],
    ['03', 640, 'Train tickets', 'Week 1'],
    ['05', 3280, 'Household supplies', 'Week 1'],
    ['08', 2940, 'Groceries for the week', 'Week 2'],
    ['09', 1200, 'Lunch at the market', 'Week 2'],
    ['12', 850, 'Bakery visit', 'Week 2'],
  ];
  data.transactions.push(
    ...rows.map(([day, amount, description, category], index) => ({
      id: 'demo-oct-expense-' + index,
      transactionDate: period + '-' + day,
      period,
      type: 'expense' as const,
      amount,
      description,
      category,
      source: 'manual',
      createdAt: index,
    })),
    {
      id: 'demo-oct-salary',
      transactionDate: period + '-01',
      period,
      type: 'income',
      amount: 360000,
      description: 'Fictional monthly salary',
      category: 'Paycheck',
      source: 'manual',
      createdAt: 0,
    },
  );
  return recalculateDemoCards(data);
}
