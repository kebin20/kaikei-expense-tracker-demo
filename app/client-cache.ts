'use client';

import { getClientRuntime } from '@/lib/client-runtime';
import {
  boundedCacheRead,
  snapshotTime,
  validSnapshot,
  type CachedSnapshot,
} from '@/lib/startup-snapshot';

const DATABASE_NAME = 'kaikei-client-cache';
const STORE_NAME = 'snapshots';
const DATABASE_VERSION = 1;
const pendingWrites = new Map<string, unknown>();
const scheduledWrites = new Set<string>();
const knownContents = new Map<string, unknown>();
const writeChains = new Map<string, Promise<void>>();
const CACHE_FORMAT = 'kaikei-snapshot-v1';
const knownTimes = new Map<string, number>();
const indexedStartupKeys = new Set<string>();
interface StartupIndex {
  format: 'kaikei-startup-index-v1';
  cachedAt: number;
  freshness: number;
  sourceCompact: boolean;
  payloadKey: string;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(new Error('Snapshot storage did not open in time.'));
    }, 800);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME))
        database.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => {
      if (finished) {
        request.result.close();
        return;
      }
      finished = true;
      clearTimeout(timer);
      resolve(request.result);
    };
    request.onerror = () => {
      finished = true;
      clearTimeout(timer);
      reject(request.error);
    };
  });
}

export async function readClientCacheEntry<T>(
  key: string,
): Promise<CachedSnapshot<T> | null> {
  const nativeRead = getClientRuntime()?.readSnapshot;
  if (nativeRead) {
    const value = await boundedCacheRead(() => nativeRead<T>(key));
    return value === null ? null : { value, cachedAt: 0 };
  }
  if (typeof indexedDB === 'undefined') return null;
  let database: IDBDatabase | undefined;
  let expired = false;
  const result = await boundedCacheRead(async () => {
    const opened = await openDatabase();
    database = opened;
    if (expired) {
      database.close();
      return null;
    }
    return await new Promise<CachedSnapshot<T> | null>((resolve, reject) => {
      const transaction = opened.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => {
        if (expired) {
          resolve(null);
          return;
        }
        const stored = request.result;
        if (stored == null) {
          resolve(null);
          return;
        }
        const entry =
          typeof stored === 'object' &&
          stored.format === CACHE_FORMAT &&
          'value' in stored
            ? {
                value: stored.value as T,
                cachedAt: Number(stored.cachedAt) || 0,
              }
            : { value: stored as T, cachedAt: 0 };
        // Reading an unchanged snapshot must not make it look like a new save.
        knownContents.set(key, entry.value);
        knownTimes.set(key, entry.cachedAt);
        resolve(entry);
      };
      request.onerror = () => reject(request.error);
      transaction.onabort = () => reject(transaction.error);
    });
  });
  expired = true;
  database?.close();
  return result;
}

export async function readClientCache<T>(key: string): Promise<T | null> {
  return (await readClientCacheEntry<T>(key))?.value ?? null;
}

export async function readStartupCache<T>(
  keys: string[],
): Promise<CachedSnapshot<T> | null> {
  if (getClientRuntime() || typeof indexedDB === 'undefined' || !keys.length)
    return null;
  let database: IDBDatabase | undefined;
  let transaction: IDBTransaction | undefined;
  let expired = false;
  const result = await boundedCacheRead(async () => {
    database = await openDatabase();
    if (expired) {
      database.close();
      return null;
    }
    return new Promise<CachedSnapshot<T> | null>((resolve, reject) => {
      transaction = database!.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const indices: Array<StartupIndex | null> = keys.map(() => null);
      let pending = keys.length;
      let selected: StartupIndex | undefined;
      let entry: CachedSnapshot<T> | null = null;
      let legacyPresent = false;
      // Queue dependent requests directly from IDB callbacks: awaiting between
      // requests can leave Safari's transaction inactive. All reads share one
      // coherent readonly transaction and one bounded database connection.
      const select = () => {
        if (
          expired ||
          legacyPresent ||
          indices.some(
            (item, i) =>
              item &&
              (item.format !== 'kaikei-startup-index-v1' ||
                item.payloadKey !== `${keys[i]}:startup-v1` ||
                !Number.isFinite(item.freshness) ||
                !Number.isFinite(item.cachedAt)),
          )
        )
          return;
        selected = indices
          .filter((item): item is StartupIndex => Boolean(item))
          .sort(
            (a, b) =>
              b.freshness - a.freshness ||
              Number(a.sourceCompact) - Number(b.sourceCompact),
          )[0];
        if (!selected) return;
        const request = store.get(selected.payloadKey);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const stored = request.result;
          if (
            !stored ||
            stored.format !== CACHE_FORMAT ||
            stored.cachedAt !== selected!.cachedAt ||
            !validSnapshot(stored.value)
          )
            return;
          entry = { value: stored.value as T, cachedAt: stored.cachedAt };
        };
      };
      const checkLegacy = () => {
        const absent = keys.filter((_, index) => !indices[index]);
        if (!absent.length) {
          select();
          return;
        }
        let remaining = absent.length;
        for (const key of absent) {
          // Check existence without deserializing full historical payloads.
          const request = store.getKey(key);
          request.onerror = () => reject(request.error);
          request.onsuccess = () => {
            if (request.result !== undefined) legacyPresent = true;
            if (!--remaining) select();
          };
        }
      };
      transaction.oncomplete = () => {
        if (expired) {
          resolve(null);
          return;
        }
        if (entry && selected) {
          knownContents.set(selected.payloadKey, entry.value);
          knownTimes.set(selected.payloadKey, entry.cachedAt);
          if (selected.sourceCompact) {
            const sourceKey = selected.payloadKey.slice(
              0,
              -':startup-v1'.length,
            );
            knownContents.set(sourceKey, entry.value);
            knownTimes.set(sourceKey, entry.cachedAt);
            indexedStartupKeys.add(sourceKey);
          }
        }
        resolve(entry);
      };
      transaction.onabort = () => reject(transaction?.error);
      transaction.onerror = () => reject(transaction?.error);
      keys.forEach((key, index) => {
        const request = store.get(`${key}:index-v1`);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          indices[index] = request.result ?? null;
          if (!--pending) checkLegacy();
        };
      });
    });
  });
  expired = true;
  try {
    transaction?.abort();
  } catch {
    /* Completed already. */
  }
  database?.close();
  return result;
}

export async function writeClientCache<T>(
  key: string,
  value: T,
  startupValue?: T,
) {
  const nativeWrite = getClientRuntime()?.writeSnapshot;
  if (nativeWrite) return nativeWrite<T>(key, value);
  if (typeof indexedDB === 'undefined') return;
  const contents = JSON.stringify(value);
  const previous = writeChains.get(key) ?? Promise.resolve();
  const write = previous
    .catch(() => undefined)
    .then(async () => {
      const unchanged =
        knownContents.has(key) &&
        JSON.stringify(knownContents.get(key)) === contents;
      if (
        unchanged &&
        (startupValue === undefined || indexedStartupKeys.has(key))
      )
        return;
      const cachedAt = unchanged ? knownTimes.get(key) || 0 : Date.now();
      const database = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const transaction = database.transaction(STORE_NAME, 'readwrite');
          const timer = setTimeout(() => {
            try {
              transaction.abort();
            } catch {
              /* Already completed/closed. */
            }
            reject(new Error('Snapshot storage did not finish in time.'));
          }, 800);
          const store = transaction.objectStore(STORE_NAME);
          if (!unchanged)
            store.put({ format: CACHE_FORMAT, cachedAt, value }, key);
          if (startupValue !== undefined && validSnapshot(value)) {
            const payloadKey = `${key}:startup-v1`;
            store.put(
              { format: CACHE_FORMAT, cachedAt, value: startupValue },
              payloadKey,
            );
            store.put(
              {
                format: 'kaikei-startup-index-v1',
                cachedAt,
                freshness: snapshotTime({ value, cachedAt }),
                sourceCompact: Boolean(value.compact),
                payloadKey,
              },
              `${key}:index-v1`,
            );
          }
          transaction.oncomplete = () => {
            clearTimeout(timer);
            resolve();
          };
          transaction.onerror = () => {
            clearTimeout(timer);
            reject(transaction.error);
          };
          transaction.onabort = () => {
            clearTimeout(timer);
            reject(transaction.error);
          };
        });
        knownContents.set(key, value);
        knownTimes.set(key, cachedAt);
        if (startupValue !== undefined) indexedStartupKeys.add(key);
      } finally {
        database.close();
      }
    });
  writeChains.set(key, write);
  try {
    await write;
  } finally {
    if (writeChains.get(key) === write) writeChains.delete(key);
  }
}

export function scheduleClientCacheWrite<T>(
  key: string,
  value: T,
  startupValue?: T,
) {
  pendingWrites.set(key, { value, startupValue });
  if (scheduledWrites.has(key)) return;
  scheduledWrites.add(key);
  const write = () => {
    const latestValue = pendingWrites.get(key) as
      | { value: T; startupValue?: T }
      | undefined;
    pendingWrites.delete(key);
    scheduledWrites.delete(key);
    if (latestValue !== undefined)
      void writeClientCache(
        key,
        latestValue.value,
        latestValue.startupValue,
      ).catch(() => undefined);
  };
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(write, { timeout: 2000 });
    return;
  }
  globalThis.setTimeout(write, 0);
}
