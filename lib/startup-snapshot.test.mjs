import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newestSnapshot, boundedCacheRead } from './startup-snapshot.ts';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { startupLedger, cachedMonthLedger } from './startup-ledger.ts';
import { afterPaintOpportunity } from './startup-timing.ts';

// Execute the real browser-cache implementation against controlled IndexedDB
// requests, including transactions that stall. No user database is opened.
const clientSource = (
  await readFile(new URL('../app/client-cache.ts', import.meta.url), 'utf8')
)
  .replaceAll(
    '@/lib/client-runtime',
    new URL('./client-runtime.ts', import.meta.url).href,
  )
  .replaceAll(
    '@/lib/startup-snapshot',
    new URL('./startup-snapshot.ts', import.meta.url).href,
  );
const compiled = ts.transpileModule(clientSource, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
}).outputText;
const cacheClient = await import(
  'data:text/javascript;base64,' + Buffer.from(compiled).toString('base64')
);
function indexedFixture() {
  const values = new Map();
  const reads = [];
  let writes = 0,
    opens = 0,
    transactions = 0,
    closes = 0,
    stalledRead = false,
    stalledWrite = false;
  const api = {
    open: () => {
      opens++;
      const request = {
        result: {
          close: () => {
            closes++;
          },
          transaction: (_, mode) => {
            transactions++;
            const staged = new Map();
            let aborted = false,
              commitScheduled = false,
              requests = 0;
            const read = (key, onlyKey = false) => {
              reads.push(onlyKey ? `exists:${key}` : key);
              requests++;
              const result = {
                result: onlyKey
                  ? values.has(key)
                    ? key
                    : undefined
                  : values.get(key),
              };
              if (!stalledRead)
                queueMicrotask(() => {
                  if (aborted) return;
                  result.onsuccess?.();
                  requests--;
                  if (!requests && mode === 'readonly')
                    queueMicrotask(() => {
                      if (!aborted && !requests) transaction.oncomplete?.();
                    });
                });
              return result;
            };
            const transaction = {
              abort: () => {
                aborted = true;
                staged.clear();
                transaction.onabort?.();
              },
              objectStore: () => ({
                get: (key) => read(key),
                getKey: (key) => read(key, true),
                put: (value, key) => {
                  if (!stalledWrite) {
                    staged.set(key, value);
                    if (!commitScheduled) {
                      commitScheduled = true;
                      queueMicrotask(() => {
                        if (aborted) return;
                        staged.forEach((entry, name) => {
                          values.set(name, entry);
                          writes++;
                        });
                        transaction.oncomplete?.();
                      });
                    }
                  }
                },
              }),
            };
            return transaction;
          },
        },
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  return {
    values,
    reads,
    opens: () => opens,
    transactions: () => transactions,
    api,
    writes: () => writes,
    closes: () => closes,
    stallRead: () => {
      stalledRead = true;
    },
    stallWrite: () => {
      stalledWrite = true;
    },
  };
}

const ledger = (compact = false, syncedAt = '2026-10-01T00:00:00Z') => ({
  transactions: [],
  budgets: [],
  initialBalance: 10,
  compact,
  syncedAt,
});
test('newer full snapshot is not shadowed by an old compact snapshot', () => {
  const full = { value: ledger(), cachedAt: 20 };
  const compact = { value: ledger(true), cachedAt: 10 };
  // Use realistic epoch timestamps; both inherited sync dates are deliberately old.
  full.cachedAt = Date.parse('2026-10-02T01:00:00Z');
  compact.cachedAt = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(newestSnapshot([compact, full]), full);
});
test('legacy snapshots use sync times; full wins a tie', () => {
  const full = { value: ledger(), cachedAt: 0 };
  const compact = { value: ledger(true), cachedAt: 0 };
  assert.equal(newestSnapshot([compact, full]), full);
  const newer = { value: ledger(true, '2026-10-03T00:00:00Z'), cachedAt: 0 };
  assert.equal(newestSnapshot([full, newer]), newer);
});
test('fresh server snapshot beats an older local cache; malformed data is ignored', () => {
  const server = { value: ledger(true, '2026-10-04T00:00:00Z'), cachedAt: 0 };
  assert.equal(
    newestSnapshot([
      { value: ledger(), cachedAt: Date.parse('2026-10-03T00:00:00Z') },
      server,
    ]),
    server,
  );
  assert.equal(
    newestSnapshot([null, { value: {}, cachedAt: Date.now() }]),
    null,
  );
});
test('stalled or failed cache reads are optional and bounded', async () => {
  assert.equal(await boundedCacheRead(() => new Promise(() => {}), 15), null);
  assert.equal(
    await boundedCacheRead(() => Promise.reject(new Error('blocked')), 15),
    null,
  );
  assert.equal(
    await boundedCacheRead(() => Promise.resolve('snapshot'), 15),
    'snapshot',
  );
});
test('browser snapshots retain their timestamp on unchanged reopen and migrate legacy values', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    const data = ledger();
    fixture.values.set('legacy', data);
    assert.deepEqual(await cacheClient.readClientCacheEntry('legacy'), {
      value: data,
      cachedAt: 0,
    });
    await cacheClient.writeClientCache('new-cache', data);
    const first = fixture.values.get('new-cache');
    assert.equal(first.format, 'kaikei-snapshot-v1');
    assert.ok(first.cachedAt > 0);
    assert.deepEqual(await cacheClient.readClientCache('new-cache'), data);
    await cacheClient.writeClientCache('new-cache', { ...data });
    assert.equal(fixture.writes(), 1);
    assert.equal(fixture.values.get('new-cache').cachedAt, first.cachedAt);
    await Promise.all([
      cacheClient.writeClientCache('new-cache', {
        ...data,
        initialBalance: 20,
      }),
      cacheClient.writeClientCache('new-cache', {
        ...data,
        initialBalance: 30,
      }),
    ]);
    assert.equal(fixture.values.get('new-cache').value.initialBalance, 30);
  } finally {
    globalThis.indexedDB = saved;
  }
});
test('a stalled IndexedDB transaction cannot indefinitely block startup', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  fixture.stallRead();
  globalThis.indexedDB = fixture.api;
  try {
    const started = performance.now();
    assert.equal(await cacheClient.readClientCacheEntry('blocked'), null);
    assert.ok(performance.now() - started < 1500);
    assert.ok(fixture.closes() > 0);
  } finally {
    globalThis.indexedDB = saved;
  }
});
test('a stalled snapshot write aborts without claiming persistence succeeded', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  fixture.stallWrite();
  globalThis.indexedDB = fixture.api;
  try {
    await assert.rejects(
      cacheClient.writeClientCache('blocked-write', ledger()),
    );
    assert.equal(fixture.writes(), 0);
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('startup projection retains historical balances and calendar month, without historical rows', () => {
  const data = {
    ...ledger(),
    sourceFile: '',
    seedVersion: '',
    budgets: [
      { period: '2026-09', plannedAmount: 1 },
      { period: '2026-10', plannedAmount: 2 },
      { period: '2026-11', plannedAmount: 3 },
    ],
    transactions: [
      { period: '2026-09', type: 'income', amount: 100 },
      { period: '2026-10', type: 'expense', amount: 20 },
    ],
  };
  const compact = startupLedger(data, '2026-10-11');
  assert.equal(compact.detailPeriod, '2026-10');
  assert.equal(compact.transactions.length, 1);
  assert.equal(compact.budgets.length, 1);
  assert.equal(
    compact.periodSummaries.find((s) => s.period === '2026-09').balance,
    110,
  );
  assert.equal(
    compact.periodSummaries.find((s) => s.period === '2026-10').balance,
    90,
  );
  assert.equal(data.transactions.length, 2);
  assert.equal(startupLedger(compact, '2026-10-11'), compact);
});

test('indexed startup selects fresh current-month payload without fetching either history record', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    const full = {
      ...ledger(false, '2099-10-03T00:00:00Z'),
      sourceFile: '',
      seedVersion: '',
      budgets: [],
      transactions: Array.from({ length: 500 }, (_, i) => ({
        period: i === 0 ? '2026-10' : '2026-09',
        type: 'expense',
        amount: 1,
      })),
    };
    await cacheClient.writeClientCache(
      'indexed-full',
      full,
      startupLedger(full, '2026-10-11'),
    );
    const old = ledger(true, '2026-10-01T00:00:00Z');
    await cacheClient.writeClientCache('indexed-compact', old, old);
    fixture.reads.length = 0;
    const opensBefore = fixture.opens(),
      transactionsBefore = fixture.transactions();
    const restored = await cacheClient.readStartupCache([
      'indexed-compact',
      'indexed-full',
    ]);
    assert.equal(restored.value.transactions.length, 1);
    assert.equal(restored.value.syncedAt, full.syncedAt);
    assert.equal(fixture.opens() - opensBefore, 1);
    assert.equal(fixture.transactions() - transactionsBefore, 1);
    assert.deepEqual(fixture.reads, [
      'indexed-compact:index-v1',
      'indexed-full:index-v1',
      'indexed-full:startup-v1',
    ]);
    assert.equal(
      fixture.values.get('indexed-full').value.transactions.length,
      500,
    );
    // An incomplete/tampered projection must fall back to the original snapshots.
    fixture.values.delete('indexed-full:startup-v1');
    assert.equal(
      await cacheClient.readStartupCache(['indexed-compact', 'indexed-full']),
      null,
    );
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('missing metadata never silently hides a populated legacy source', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    const compact = ledger(true);
    await cacheClient.writeClientCache('migration-compact', compact, compact);
    fixture.values.set('migration-full', ledger(false, '2099-10-04T00:00:00Z'));
    assert.equal(
      await cacheClient.readStartupCache([
        'migration-compact',
        'migration-full',
      ]),
      null,
    );
    const legacy = await cacheClient.readClientCacheEntry('migration-full');
    await cacheClient.writeClientCache(
      'migration-full',
      legacy.value,
      legacy.value,
    );
    assert.equal(fixture.values.get('migration-full:index-v1').cachedAt, 0);
    const restored = await cacheClient.readStartupCache([
      'migration-compact',
      'migration-full',
    ]);
    assert.equal(restored.value.syncedAt, '2099-10-04T00:00:00Z');
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('never-created history slot does not prevent indexed startup; unchanged data retains freshness', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    const compact = ledger(true);
    await cacheClient.writeClientCache('only-compact', compact, compact);
    const time = fixture.values.get('only-compact').cachedAt;
    assert.ok(
      await cacheClient.readStartupCache(['only-compact', 'absent-full']),
    );
    assert.ok(fixture.reads.includes('exists:absent-full'));
    assert.equal(fixture.reads.includes('absent-full'), false);
    await cacheClient.writeClientCache(
      'only-compact',
      { ...compact },
      { ...compact },
    );
    assert.equal(fixture.values.get('only-compact').cachedAt, time);
    assert.equal(fixture.writes(), 3);
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('blocked indexed writes cannot publish a partial startup index', async () => {
  const saved = globalThis.indexedDB;
  const fixture = indexedFixture();
  fixture.stallWrite();
  globalThis.indexedDB = fixture.api;
  try {
    await assert.rejects(
      cacheClient.writeClientCache('atomic', ledger(), ledger(true)),
    );
    assert.equal(fixture.values.has('atomic:index-v1'), false);
    assert.equal(fixture.values.has('atomic:startup-v1'), false);
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('batched startup read times out and closes its only connection without publishing a partial result', async () => {
  const saved = globalThis.indexedDB,
    fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    fixture.stallRead();
    const started = performance.now();
    assert.equal(
      await cacheClient.readStartupCache(['stall-compact', 'stall-full']),
      null,
    );
    assert.ok(performance.now() - started < 1500);
    assert.equal(fixture.opens(), 1);
    assert.equal(fixture.closes(), 1);
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('batched startup retains full-wins-freshness ties and rejects a mismatched projection timestamp', async () => {
  const saved = globalThis.indexedDB,
    fixture = indexedFixture();
  globalThis.indexedDB = fixture.api;
  try {
    const compact = ledger(true),
      full = ledger();
    for (const key of ['tie-compact', 'tie-full']) {
      const value = key === 'tie-compact' ? compact : full;
      fixture.values.set(key + ':index-v1', {
        format: 'kaikei-startup-index-v1',
        cachedAt: 10,
        freshness: 20,
        sourceCompact: value.compact,
        payloadKey: key + ':startup-v1',
      });
      fixture.values.set(key + ':startup-v1', {
        format: 'kaikei-snapshot-v1',
        cachedAt: 10,
        value,
      });
    }
    assert.equal(
      (await cacheClient.readStartupCache(['tie-compact', 'tie-full'])).value
        .compact,
      false,
    );
    fixture.values.get('tie-full:startup-v1').cachedAt = 9;
    assert.equal(
      await cacheClient.readStartupCache(['tie-compact', 'tie-full']),
      null,
    );
  } finally {
    globalThis.indexedDB = saved;
  }
});

test('paint opportunity requires two frames and cancels cleanly on unmount', () => {
  const frames = new Map();
  let id = 0,
    calls = 0;
  const request = (callback) => {
    frames.set(++id, callback);
    return id;
  };
  const cancel = (id) => frames.delete(id);
  const stop = afterPaintOpportunity(() => calls++, request, cancel);
  frames.get(1)();
  assert.equal(calls, 0);
  stop();
  assert.equal(frames.has(2), false);
  const finish = afterPaintOpportunity(() => calls++, request, cancel);
  frames.get(3)();
  frames.get(4)();
  assert.equal(calls, 1);
  finish();
});

test('offline month navigation retains newer current-month totals and rejects stale history', () => {
  const full = {
    ...ledger(),
    sourceFile: '',
    seedVersion: '',
    budgets: [],
    transactions: [
      { period: '2026-09', type: 'income', amount: 100 },
      { period: '2026-10', type: 'expense', amount: 20 },
    ],
  };
  const base = startupLedger(full, '2026-10-11');
  base.periodSummaries = base.periodSummaries.map((s) =>
    s.period === '2026-10' ? { ...s, expense: 30, balance: 80 } : s,
  );
  const september = cachedMonthLedger(base, full, '2026-09');
  assert.equal(september.detailPeriod, '2026-09');
  assert.equal(
    september.periodSummaries.find((s) => s.period === '2026-10').expense,
    30,
  );
  assert.equal(
    september.periodSummaries.find((s) => s.period === '2026-10').balance,
    80,
  );
  assert.equal(cachedMonthLedger(base, full, '2026-11'), null);
  assert.equal(
    cachedMonthLedger(base, { ...full, compact: true }, '2026-09'),
    null,
  );
  assert.equal(
    cachedMonthLedger(
      { ...base, periodSyncedAt: { '2026-09': '2026-10-02T00:00:00Z' } },
      full,
      '2026-09',
    ),
    null,
  );
});
