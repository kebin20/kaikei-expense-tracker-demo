import type { LedgerType } from '@/db/ledger';

const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const periodPattern = /^\d{4}-\d{2}$/;

function isType(value: unknown): value is LedgerType {
  return value === 'expense' || value === 'income';
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateTransactionBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Please complete the transaction form.');
  const value = body as Record<string, unknown>;
  const amount = Math.round(Number(value.amount));
  const transactionDate = textValue(value.transactionDate);
  const description = textValue(value.description);
  const category = textValue(value.category);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Enter an amount greater than zero.');
  if (!isoDatePattern.test(transactionDate)) throw new Error('Choose a valid date.');
  if (!description || description.length > 120) throw new Error('Add a short description.');
  if (!category || category.length > 80) throw new Error('Choose or enter a category.');
  return { type: value.type, amount, transactionDate, description, category };
}

export function validateBudgetBody(body: unknown) {
  if (!body || typeof body !== 'object') throw new Error('Please complete the budget form.');
  const value = body as Record<string, unknown>;
  const plannedAmount = Math.round(Number(value.plannedAmount));
  const period = textValue(value.period);
  const category = textValue(value.category);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!periodPattern.test(period)) throw new Error('Choose a valid month.');
  if (!category || category.length > 80) throw new Error('Choose a valid category.');
  if (!Number.isFinite(plannedAmount) || plannedAmount < 0) throw new Error('Enter zero or a positive amount.');
  return { type: value.type, plannedAmount, period, category };
}
