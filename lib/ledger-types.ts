export type LedgerType = 'expense' | 'income';

export interface LedgerTransaction {
  id: string;
  transactionDate: string;
  period: string;
  type: LedgerType;
  amount: number;
  description: string;
  category: string;
  source: string;
  createdAt: number;
}

export interface BudgetPlan {
  id: string;
  period: string;
  type: LedgerType;
  category: string;
  plannedAmount: number;
  updatedAt: number;
  recurring?: boolean;
  creditCardGrossAmount?: number | null;
  creditCardFixedCosts?: number;
}

export interface LedgerData {
  transactions: LedgerTransaction[];
  budgets: BudgetPlan[];
  initialBalance: number;
  sourceFile: string;
  seedVersion: string;
  syncMode?: 'database' | 'google-sheets';
  syncedAt?: string;
}

export interface DemoTransactionInput {
  type: LedgerType;
  amount: number;
  transactionDate: string;
  description: string;
  category: string;
}
