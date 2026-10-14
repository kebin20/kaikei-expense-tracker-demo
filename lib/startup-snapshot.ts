export interface CachedSnapshot<T> {
  value: T;
  cachedAt: number;
}
interface LedgerSnapshot {
  transactions: unknown[];
  budgets: unknown[];
  initialBalance: number;
  syncedAt?: string;
  periodSyncedAt?: Record<string, string>;
  compact?: boolean;
}
export function validSnapshot(value: unknown): value is LedgerSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as LedgerSnapshot;
  return (
    Array.isArray(snapshot.transactions) &&
    Array.isArray(snapshot.budgets) &&
    Number.isFinite(snapshot.initialBalance)
  );
}
export function snapshotTime(entry: CachedSnapshot<LedgerSnapshot>): number {
  return Math.max(
    Number.isFinite(entry.cachedAt) ? entry.cachedAt : 0,
    Date.parse(entry.value.syncedAt || '') || 0,
    ...Object.values(entry.value.periodSyncedAt || {}).map(
      (date) => Date.parse(date) || 0,
    ),
  );
}
export function newestSnapshot<T extends LedgerSnapshot>(
  entries: Array<CachedSnapshot<T> | null>,
): CachedSnapshot<T> | null {
  const valid = entries.filter((entry): entry is CachedSnapshot<T> =>
    Boolean(entry && validSnapshot(entry.value)),
  );
  return (
    valid.sort(
      (a, b) =>
        snapshotTime(b) - snapshotTime(a) ||
        Number(Boolean(a.value.compact)) - Number(Boolean(b.value.compact)),
    )[0] ?? null
  );
}
export async function boundedCacheRead<T>(
  read: () => Promise<T>,
  timeoutMs = 800,
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve()
        .then(read)
        .catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
