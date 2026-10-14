import { getClientRuntime } from './client-runtime.ts';
import { browserQueueLock, outboxDrainLock } from './browser-lock.ts';

export function drainOutbox(operation: () => Promise<void>) {
  return getClientRuntime() && !getClientRuntime()?.browserLocal
    ? operation()
    : outboxDrainLock(operation);
}

export const OUTBOX_BATCH_SIZE = 20;

// Serialize the read/modify/commit operation, not just the write: a native
// persistence wait must not let a draining batch erase a concurrent addition.
const updates = new Map<string, Promise<unknown>>();

export function updateOutbox<T>(
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  key: string,
  update: (current: T[]) => T[],
): Promise<T[]> {
  const previous = updates.get(key) ?? Promise.resolve();
  const operation = previous
    .catch(() => undefined)
    .then(async () => {
      const mutate = () => {
        const raw = storage.getItem(key);
        const current = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(current))
          throw new Error('The offline queue is invalid.');
        const next = update(current as T[]);
        const encoded = JSON.stringify(next);
        persistOutbox(storage, key, next);
        return { current, next, encoded };
      };
      const { current, next, encoded } =
        getClientRuntime() && !getClientRuntime()?.browserLocal
          ? mutate()
          : await browserQueueLock('kaikei:queue:' + key, mutate);
      try {
        await getClientRuntime()?.commitValue?.(key, encoded);
      } catch (error) {
        persistOutbox(storage, key, current);
        throw error;
      }
      if (typeof window !== 'undefined')
        window.dispatchEvent(new Event('kaikei-queue-changed'));
      return next;
    });
  updates.set(key, operation);
  void operation
    .finally(() => {
      if (updates.get(key) === operation) updates.delete(key);
    })
    .catch(() => undefined);
  return operation;
}

export function persistOutbox<T>(
  storage: Pick<Storage, 'setItem' | 'getItem'>,
  key: string,
  items: T[],
) {
  const encoded = JSON.stringify(items);
  storage.setItem(key, encoded);
  if (storage.getItem(key) !== encoded)
    throw new Error('Device storage did not confirm the queued changes.');
}

export function confirmedOutboxRemainder<
  T extends { clientMutationId?: string },
>(current: T[], sent: T[], confirmedCount: number) {
  if (confirmedCount !== sent.length)
    throw new Error(
      'Only part of this batch was confirmed. All unconfirmed entries remain queued.',
    );
  const ids = new Set(sent.map((item) => item.clientMutationId));
  return current.filter((item) => !ids.has(item.clientMutationId));
}
