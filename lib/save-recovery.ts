interface RecordSnapshot {
  transactions: Array<{ id: string }>;
  budgets: Array<{
    period: string;
    type: string;
    category: string;
    plannedAmount: number;
    recurring?: boolean;
    creditCardGrossAmount?: number | null;
  }>;
}

export interface PendingWrite {
  operationId?: string;
  url: string;
  method: string;
  body?: string;
  period: string;
}

export function validPendingWrite(value: unknown): value is PendingWrite {
  if (!value || typeof value !== 'object') return false;
  const item = value as PendingWrite;
  if (
    item.operationId !== undefined &&
    !/^[a-zA-Z0-9_-]{1,80}$/.test(item.operationId)
  )
    return false;
  if (item.body !== undefined) {
    if (typeof item.body !== 'string' || item.body.length >= 50000)
      return false;
    try {
      const input = JSON.parse(item.body);
      if (!input || typeof input !== 'object' || Array.isArray(input))
        return false;
    } catch {
      return false;
    }
  }
  return (
    /^\/api\/(budgets(?:\/credit-card)?|month-close|ledger\/[a-zA-Z0-9_%|.-]+)$/.test(
      item.url,
    ) &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(item.method) &&
    /^20\d{2}-(0[1-9]|1[0-2])$/.test(item.period) &&
    (item.body === undefined ||
      (typeof item.body === 'string' && item.body.length < 50000))
  );
}

// Check the intended state without sending a mutation or guessing from a cached UI.
export function pendingWriteConfirmed(
  write: PendingWrite,
  snapshot: RecordSnapshot,
) {
  if (!validPendingWrite(write)) return false;
  const input = JSON.parse(write.body || '{}');
  const budgets = snapshot.budgets.filter(
    (item) => item.period === write.period,
  );
  if (write.url.startsWith('/api/ledger/') && write.method === 'DELETE')
    // Row absence alone is not proof: use the deletion receipt instead.
    return false;
  if (write.url.endsWith('/credit-card'))
    return budgets.some(
      (item) =>
        item.category.toLowerCase() === 'credit card' &&
        item.creditCardGrossAmount === input.grossAmount,
    );
  if (write.url === '/api/month-close')
    return (
      Array.isArray(input.plans) &&
      input.plans.every((plan: Record<string, unknown>) =>
        budgets.some(
          (item) =>
            item.type === plan.type &&
            item.category === plan.category &&
            item.plannedAmount === plan.plannedAmount &&
            Boolean(item.recurring) === Boolean(plan.recurring),
        ),
      )
    );
  const group = budgets.filter((item) => item.type === input.type);
  if (write.method === 'DELETE')
    return !group.some((item) => item.category === input.category);
  if (write.method === 'PATCH')
    return (
      JSON.stringify(group.map((item) => item.category)) ===
      JSON.stringify(input.categories)
    );
  return (
    group.some(
      (item) =>
        item.category === input.category &&
        item.plannedAmount === input.plannedAmount &&
        Boolean(item.recurring) === Boolean(input.recurring),
    ) &&
    (!input.originalCategory ||
      input.originalCategory === input.category ||
      !group.some((item) => item.category === input.originalCategory))
  );
}
