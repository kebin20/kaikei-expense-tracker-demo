import { isCalendarPeriod } from './calendar-validation.ts';

export interface TransactionDeleteInput {
  period: string;
  clientMutationId: string;
  originalFingerprint: string;
}

export function validateTransactionDelete(
  id: string,
  body: unknown,
): TransactionDeleteInput {
  const input = body as Partial<TransactionDeleteInput> | null;
  if (
    !input ||
    !isCalendarPeriod(input.period) ||
    !/^[a-zA-Z0-9_-]{1,80}$/.test(input.clientMutationId || '') ||
    typeof input.originalFingerprint !== 'string' ||
    !input.originalFingerprint ||
    input.originalFingerprint.length > 600
  )
    throw new Error('A deletion needs its original transaction reference.');
  if (id.startsWith('gstx|') && id.split('|')[1] !== input.period)
    throw new Error('Deletion month does not match the original transaction.');
  return input as TransactionDeleteInput;
}
