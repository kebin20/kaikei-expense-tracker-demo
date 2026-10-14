import type { LedgerType } from './ledger-types.ts';
import { preserveWeeklyIdentity } from './category-identity.ts';

import {
  isCalendarDate,
  isCalendarPeriod,
  wholeYen,
} from './calendar-validation.ts';

function isType(value: unknown): value is LedgerType {
  return value === 'expense' || value === 'income';
}

function textValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateTransactionBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Please complete the transaction form.');
  const value = body as Record<string, unknown>;
  const amount = wholeYen(value.amount, false);
  const transactionDate = textValue(value.transactionDate);
  const description = textValue(value.description);
  const category = textValue(value.category);
  const clientMutationId = textValue(value.clientMutationId);
  const originalFingerprint = textValue(value.originalFingerprint);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!Number.isFinite(amount) || amount <= 0)
    throw new Error('Enter an amount greater than zero.');
  if (!isCalendarDate(transactionDate)) throw new Error('Choose a valid date.');
  if (!description || description.length > 120)
    throw new Error('Add a short description.');
  if (!category || category.length > 80)
    throw new Error('Choose or enter a category.');
  if (clientMutationId && !/^[a-zA-Z0-9_-]{1,80}$/.test(clientMutationId))
    throw new Error('Invalid transaction request identifier.');
  if (originalFingerprint && originalFingerprint.length > 600)
    throw new Error('Invalid original transaction reference.');
  return {
    type: value.type,
    amount,
    transactionDate,
    description,
    category,
    clientMutationId: clientMutationId || undefined,
    originalFingerprint: originalFingerprint || undefined,
  };
}

export function validateTransactionBatchBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Please add at least one expense.');
  const value = body as Record<string, unknown>;
  if (!Array.isArray(value.transactions) || !value.transactions.length) {
    throw new Error('Please add at least one expense.');
  }
  if (value.transactions.length > 20) {
    throw new Error('Add up to 20 expenses at a time.');
  }
  return value.transactions.map(validateTransactionBody);
}

export function validateBudgetBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Please complete the estimate form.');
  const value = body as Record<string, unknown>;
  const plannedAmount = wholeYen(value.plannedAmount);
  const period = textValue(value.period);
  const requestedCategory = textValue(value.category);
  const originalCategory =
    textValue(value.originalCategory) || requestedCategory;
  const category = preserveWeeklyIdentity(originalCategory, requestedCategory);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!isCalendarPeriod(period)) throw new Error('Choose a valid month.');
  if (!category || category.length > 80)
    throw new Error('Choose a valid category.');
  if (!originalCategory || originalCategory.length > 80)
    throw new Error('Choose a valid original category.');
  if (!Number.isFinite(plannedAmount) || plannedAmount < 0)
    throw new Error('Enter zero or a positive estimated amount.');
  return {
    type: value.type,
    plannedAmount,
    period,
    category,
    originalCategory,
    recurring: Boolean(value.recurring),
  };
}

export function validateNewBudgetBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Please complete the estimate form.');
  const value = body as Record<string, unknown>;
  const plannedAmount = wholeYen(value.plannedAmount);
  const period = textValue(value.period);
  const category = textValue(value.category);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!isCalendarPeriod(period)) throw new Error('Choose a valid month.');
  if (!category || category.length > 80)
    throw new Error('Choose a valid category.');
  if (!Number.isFinite(plannedAmount) || plannedAmount < 0) {
    throw new Error('Enter zero or a positive estimated amount.');
  }
  return {
    type: value.type,
    plannedAmount,
    period,
    category,
    recurring: Boolean(value.recurring),
  };
}

export function validateMonthCloseBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Choose a month to set up.');
  const value = body as Record<string, unknown>;
  const period = textValue(value.period);
  if (!isCalendarPeriod(period) || period < '2026-09') {
    throw new Error('Choose September 2026 or a later month.');
  }
  if (!Array.isArray(value.plans) || !value.plans.length) {
    throw new Error('Add at least one estimate for the next month.');
  }
  if (value.plans.length > 100) {
    throw new Error('Too many estimates were supplied.');
  }
  const seen = new Set<string>();
  const plans = value.plans.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Choose valid next-month estimates.');
    }
    const plan = entry as Record<string, unknown>;
    const category = textValue(plan.category);
    const plannedAmount = wholeYen(plan.plannedAmount);
    if (!isType(plan.type)) throw new Error('Choose income or expense.');
    if (!category || category.length > 80) {
      throw new Error('Choose valid category names.');
    }
    if (!Number.isFinite(plannedAmount) || plannedAmount < 0) {
      throw new Error('Use zero or a positive estimated amount.');
    }
    const key = `${plan.type}:${category}`;
    if (seen.has(key)) throw new Error('Each estimate can appear only once.');
    seen.add(key);
    return {
      type: plan.type,
      category,
      plannedAmount,
      recurring: Boolean(plan.recurring),
    };
  });
  return { period, plans };
}

export function validateBudgetIdentity(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Choose a category to delete.');
  const value = body as Record<string, unknown>;
  const period = textValue(value.period);
  const category = textValue(value.category);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!isCalendarPeriod(period)) throw new Error('Choose a valid month.');
  if (!category || category.length > 80)
    throw new Error('Choose a valid category.');
  return { type: value.type, period, category };
}

export function validateBudgetOrderBody(body: unknown) {
  if (!body || typeof body !== 'object')
    throw new Error('Choose categories to reorder.');
  const value = body as Record<string, unknown>;
  const period = textValue(value.period);
  if (!isType(value.type)) throw new Error('Choose income or expense.');
  if (!isCalendarPeriod(period)) throw new Error('Choose a valid month.');
  if (!Array.isArray(value.categories) || value.categories.length < 2) {
    throw new Error('Choose at least two categories to reorder.');
  }
  if (value.categories.length > 60)
    throw new Error('Too many categories were supplied.');
  const categories = value.categories.map(textValue);
  if (categories.some((category) => !category || category.length > 80)) {
    throw new Error('Choose valid category names.');
  }
  if (new Set(categories).size !== categories.length) {
    throw new Error('Each category can appear only once.');
  }
  return { type: value.type, period, categories };
}
