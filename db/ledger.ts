import { env } from 'cloudflare:workers';
import seedData from '@/lib/seed-data.json';

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
}

interface TransactionInput {
  transactionDate: string;
  type: LedgerType;
  amount: number;
  description: string;
  category: string;
}

interface BudgetInput {
  period: string;
  type: LedgerType;
  category: string;
  plannedAmount: number;
}

function getD1() {
  if (!env.DB) throw new Error('The Kakei database is unavailable.');
  return env.DB;
}

async function runBatches(statements: D1PreparedStatement[], size = 80) {
  const db = getD1();
  for (let start = 0; start < statements.length; start += size) {
    await db.batch(statements.slice(start, start + size));
  }
}

export async function ensureSeeded() {
  const db = getD1();
  const seeded = await db
    .prepare('SELECT value FROM app_meta WHERE key = ?1')
    .bind('seed_version')
    .first<{ value: string }>();

  if (seeded?.value === seedData.version) return;

  const statements: D1PreparedStatement[] = [];
  for (const item of seedData.transactions) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO transactions
          (id, transaction_date, period, type, amount, description, category, source, created_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
        )
        .bind(
          item.id,
          item.transactionDate,
          item.period,
          item.type,
          item.amount,
          item.description,
          item.category,
          item.source,
          0,
        ),
    );
  }

  for (const item of seedData.budgets) {
    statements.push(
      db
        .prepare(
          `INSERT OR IGNORE INTO budgets
          (id, period, type, category, planned_amount, updated_at)
          VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .bind(
          item.id,
          item.period,
          item.type,
          item.category,
          item.plannedAmount,
          0,
        ),
    );
  }

  await runBatches(statements);
  await db.batch([
    db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind('initial_balance', String(seedData.initialBalance)),
    db
      .prepare(
        `INSERT INTO app_meta (key, value) VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .bind('seed_version', seedData.version),
    db.prepare('PRAGMA optimize'),
  ]);
}

export async function getLedgerData() {
  await ensureSeeded();
  const db = getD1();
  const [transactionsResult, budgetsResult, metaResult] = await Promise.all([
    db
      .prepare(
        `SELECT id, transaction_date AS transactionDate, period, type, amount,
          description, category, source, created_at AS createdAt
        FROM transactions
        ORDER BY period DESC, transaction_date DESC, created_at DESC, id DESC`,
      )
      .all<LedgerTransaction>(),
    db
      .prepare(
        `SELECT id, period, type, category, planned_amount AS plannedAmount,
          updated_at AS updatedAt
        FROM budgets
        ORDER BY period, type, category`,
      )
      .all<BudgetPlan>(),
    db.prepare('SELECT key, value FROM app_meta').all<{ key: string; value: string }>(),
  ]);

  const meta = Object.fromEntries(metaResult.results.map((item) => [item.key, item.value]));
  return {
    transactions: transactionsResult.results,
    budgets: budgetsResult.results,
    initialBalance: Number(meta.initial_balance || seedData.initialBalance),
    sourceFile: seedData.sourceFile,
    seedVersion: meta.seed_version || seedData.version,
  };
}

export async function createLedgerTransaction(input: TransactionInput) {
  await ensureSeeded();
  const db = getD1();
  const item: LedgerTransaction = {
    id: crypto.randomUUID(),
    transactionDate: input.transactionDate,
    period: input.transactionDate.slice(0, 7),
    type: input.type,
    amount: input.amount,
    description: input.description,
    category: input.category,
    source: 'manual',
    createdAt: Date.now(),
  };
  await db
    .prepare(
      `INSERT INTO transactions
      (id, transaction_date, period, type, amount, description, category, source, created_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)`,
    )
    .bind(
      item.id,
      item.transactionDate,
      item.period,
      item.type,
      item.amount,
      item.description,
      item.category,
      item.source,
      item.createdAt,
    )
    .run();
  return item;
}

export async function updateLedgerTransaction(id: string, input: TransactionInput) {
  await ensureSeeded();
  const db = getD1();
  const period = input.transactionDate.slice(0, 7);
  const result = await db
    .prepare(
      `UPDATE transactions SET transaction_date = ?1, period = ?2, type = ?3,
        amount = ?4, description = ?5, category = ?6, created_at = ?7
      WHERE id = ?8`,
    )
    .bind(
      input.transactionDate,
      period,
      input.type,
      input.amount,
      input.description,
      input.category,
      Date.now(),
      id,
    )
    .run();
  if (!result.meta.changes) return null;
  return db
    .prepare(
      `SELECT id, transaction_date AS transactionDate, period, type, amount,
        description, category, source, created_at AS createdAt
      FROM transactions WHERE id = ?1`,
    )
    .bind(id)
    .first<LedgerTransaction>();
}

export async function deleteLedgerTransaction(id: string) {
  await ensureSeeded();
  const result = await getD1()
    .prepare('DELETE FROM transactions WHERE id = ?1')
    .bind(id)
    .run();
  return Boolean(result.meta.changes);
}

export async function upsertBudget(input: BudgetInput) {
  await ensureSeeded();
  const db = getD1();
  const id = crypto.randomUUID();
  const updatedAt = Date.now();
  await db
    .prepare(
      `INSERT INTO budgets (id, period, type, category, planned_amount, updated_at)
      VALUES (?1, ?2, ?3, ?4, ?5, ?6)
      ON CONFLICT(period, type, category) DO UPDATE SET
        planned_amount = excluded.planned_amount,
        updated_at = excluded.updated_at`,
    )
    .bind(id, input.period, input.type, input.category, input.plannedAmount, updatedAt)
    .run();

  return db
    .prepare(
      `SELECT id, period, type, category, planned_amount AS plannedAmount,
        updated_at AS updatedAt
      FROM budgets WHERE period = ?1 AND type = ?2 AND category = ?3`,
    )
    .bind(input.period, input.type, input.category)
    .first<BudgetPlan>();
}
