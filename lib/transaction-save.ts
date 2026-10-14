import type { LedgerTransaction } from './ledger-types';
import {
  boundedFetch,
  RequestTimeoutError,
  type RequestTiming,
} from './request.ts';
import { isCalendarDate } from './calendar-validation.ts';

type EditInput = Pick<
  LedgerTransaction,
  'type' | 'amount' | 'transactionDate' | 'description' | 'category'
> & {
  clientMutationId: string;
  originalFingerprint: string;
};

export interface PendingTransactionEdit {
  original: LedgerTransaction;
  input: EditInput;
}

export class SaveNotConfirmedError extends Error {
  constructor() {
    super(
      'Browser storage has not confirmed this edit yet. Check save status before submitting again.',
    );
    this.name = 'SaveNotConfirmedError';
  }
}

// Keep the deadline active through response-body parsing, not only until headers arrive.
export async function transactionSaveJson<T>(
  url: string,
  init: RequestInit,
  deadlineMs = 20000,
  onTiming?: (timing: RequestTiming, successful: boolean) => void,
): Promise<T> {
  try {
    const response = await boundedFetch(url, init, deadlineMs, onTiming);
    const body = (await response.json()) as T & {
      error?: string;
      saveUncertain?: boolean;
    };
    if (!response.ok) {
      if (body.saveUncertain || response.status >= 500)
        throw new SaveNotConfirmedError();
      throw new Error(body.error || 'Could not save this edit.');
    }
    return body as T;
  } catch (error) {
    if (
      error instanceof RequestTimeoutError ||
      error instanceof TypeError ||
      error instanceof SyntaxError
    )
      throw new SaveNotConfirmedError();
    throw error;
  }
}

export function validPendingEdit(
  value: unknown,
): value is PendingTransactionEdit {
  if (!value || typeof value !== 'object') return false;
  const draft = value as PendingTransactionEdit;
  return Boolean(
    draft.original?.id &&
    draft.input &&
    /^[a-zA-Z0-9_-]{1,80}$/.test(draft.input.clientMutationId || '') &&
    isCalendarDate(draft.input.transactionDate) &&
    (draft.input.type === 'expense' || draft.input.type === 'income') &&
    Number.isSafeInteger(draft.input.amount) &&
    draft.input.amount > 0 &&
    typeof draft.input.description === 'string' &&
    typeof draft.input.category === 'string' &&
    typeof draft.input.originalFingerprint === 'string',
  );
}

export function transactionFingerprint(
  item: Pick<
    LedgerTransaction,
    'type' | 'transactionDate' | 'amount' | 'description' | 'category'
  >,
) {
  return JSON.stringify([
    item.type,
    item.transactionDate,
    item.amount,
    item.description,
    item.category,
  ]);
}
