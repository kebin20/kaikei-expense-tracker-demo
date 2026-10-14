// Queue updates are synchronous in browsers. Web Locks coordinate tabs; an
// IndexedDB read/write transaction provides the same exclusion on older engines.
export async function browserQueueLock<T>(
  name: string,
  operation: () => T,
): Promise<T> {
  if (typeof window === 'undefined') return operation();
  if (navigator.locks?.request) return navigator.locks.request(name, operation);
  if (typeof indexedDB === 'undefined')
    throw new Error(
      'Safe queue storage is unavailable. Nothing was submitted.',
    );
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open('kaikei-coordination-v1', 1);
    let database: IDBDatabase | undefined,
      transaction: IDBTransaction | undefined;
    let expired = false,
      completed = false,
      value: T;
    const finish = (error?: unknown) => {
      if (expired) return;
      expired = true;
      clearTimeout(timer);
      database?.close();
      if (completed) resolve(value);
      else
        reject(
          error ||
            new Error('Queue storage did not respond. Your form is unchanged.'),
        );
    };
    const timer = setTimeout(() => {
      transaction?.abort();
      finish();
    }, 3000);
    open.onupgradeneeded = () => open.result.createObjectStore('locks');
    open.onerror = () => finish(open.error);
    open.onsuccess = () => {
      database = open.result;
      if (expired) {
        database.close();
        return;
      }
      transaction = database.transaction('locks', 'readwrite');
      const request = transaction.objectStore('locks').get(name);
      request.onsuccess = () => {
        if (expired) return;
        try {
          // No network or awaits may run inside this critical section.
          value = operation();
          completed = true;
        } catch (error) {
          transaction?.abort();
          finish(error);
        }
      };
      request.onerror = () => finish(request.error);
      transaction.oncomplete = () => finish();
      transaction.onabort = () => finish(transaction?.error);
      transaction.onerror = () => finish(transaction?.error);
    };
  });
}

export async function outboxDrainLock(
  operation: () => Promise<void>,
): Promise<void> {
  if (typeof window === 'undefined') return operation();
  if (!navigator.locks?.request)
    throw new Error(
      'Entries are safely queued. This browser needs Web Locks support to sync them without another tab sending the same batch.',
    );
  await navigator.locks.request(
    'kaikei:outbox:drain',
    { ifAvailable: true },
    async (lock) => {
      if (lock) await operation();
    },
  );
}
