import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const transactions = sqliteTable(
  'transactions',
  {
    id: text('id').primaryKey(),
    transactionDate: text('transaction_date').notNull(),
    period: text('period').notNull(),
    type: text('type').notNull(),
    amount: integer('amount').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    source: text('source').notNull().default('manual'),
    createdAt: integer('created_at').notNull().default(0),
  },
  (table) => [
    index('idx_transactions_period_type').on(table.period, table.type),
    index('idx_transactions_date').on(table.transactionDate),
  ],
);

export const budgets = sqliteTable(
  'budgets',
  {
    id: text('id').primaryKey(),
    period: text('period').notNull(),
    type: text('type').notNull(),
    category: text('category').notNull(),
    plannedAmount: integer('planned_amount').notNull().default(0),
    updatedAt: integer('updated_at').notNull().default(0),
  },
  (table) => [
    uniqueIndex('idx_budgets_period_type_category').on(
      table.period,
      table.type,
      table.category,
    ),
    index('idx_budgets_period').on(table.period),
  ],
);

export const appMeta = sqliteTable('app_meta', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
