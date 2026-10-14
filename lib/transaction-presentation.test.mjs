import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  mergeTransactionRows,
  groupTransactionDays,
} from './transaction-order.ts';
import { updateOutbox } from './outbox.ts';
import { installClientRuntime } from './client-runtime.ts';
import { readFile } from 'node:fs/promises';

const row = (id, source = 'manual', amount = 1234) => ({
  id,
  source,
  amount,
  type: 'expense',
  transactionDate: '2026-10-14',
  period: '2026-10',
  description: 'Fictional purchase',
  category: 'Week 2',
  createdAt: 1,
});

test('queue event before submit insertion yields one placeholder, then one confirmed row', async () => {
  const oldWindow = globalThis.window;
  const storage = new Map();
  const events = new EventTarget();
  let current = [];
  installClientRuntime({}); // deterministic local persistence, no browser locks/network
  globalThis.window = events;
  const input = { ...row('unused'), clientMutationId: 'mutation-one' };
  events.addEventListener('kaikei-queue-changed', () => {
    const queued = JSON.parse(storage.get('queue') || '[]');
    current = mergeTransactionRows(
      current,
      queued.map((item) => ({
        ...item,
        id: 'pending-' + item.clientMutationId,
        source: 'queued',
      })),
    );
  });
  try {
    await updateOutbox(
      {
        getItem: (key) => storage.get(key) || null,
        setItem: (key, value) => storage.set(key, value),
      },
      'queue',
      () => [input],
    );
    assert.equal(current.length, 1); // real updateOutbox dispatched before it resolved
    const optimistic = row('pending-mutation-one', 'pending');
    assert.equal([optimistic, ...current].length, 2); // regression in the old append
    current = mergeTransactionRows(current, [optimistic]);
    assert.equal(current.length, 1);
    assert.equal(current[0].source, 'pending');
    current = mergeTransactionRows(
      current,
      [row('saved-one')],
      new Set(['pending-mutation-one']),
    );
    assert.equal(current.length, 1);
    assert.equal(current[0].id, 'saved-one');
    assert.equal(groupTransactionDays(current)[0].expense, 1234);
  } finally {
    globalThis.window = oldWindow;
    installClientRuntime(undefined);
  }
});

test('different IDs keep legitimate identical purchases and unrelated queued entries', () => {
  const result = mergeTransactionRows(
    [
      row('saved-old'),
      row('pending-sent', 'queued'),
      row('pending-other', 'queued'),
    ],
    [row('saved-new')],
    new Set(['pending-sent']),
  );
  assert.deepEqual(
    new Set(result.map((item) => item.id)),
    new Set(['saved-old', 'saved-new', 'pending-other']),
  );
  assert.equal(groupTransactionDays(result)[0].expense, 1234 * 3);
});

test('repeated receipts and legacy duplicate keys normalize without modifying input rows', () => {
  const old = [row('saved-one'), row('saved-one'), row('different-id')];
  const result = mergeTransactionRows(old, [
    row('saved-one', 'manual', 1900),
    row('saved-one', 'manual', 1900),
  ]);
  assert.equal(result.length, 2);
  assert.equal(result.find((item) => item.id === 'saved-one').amount, 1900);
  assert.equal(old.length, 3);
  assert.equal(old[0].amount, 1234);
});

test('submit and confirmation use identity merges; modal footer inherits either theme', async () => {
  const app = await readFile(
    new URL('../app/kaikei-app.tsx', import.meta.url),
    'utf8',
  );
  assert.ok(
    /transactions: mergeTransactionRows\(\s*current.transactions,\s*optimisticItems\s*,?\s*\)/.test(
      app,
    ),
    'Submit must merge the already published placeholder by ID',
  );
  assert.ok(
    /mergeTransactionRows\(\s*current.transactions,\s*result,\s*optimisticIds/.test(
      app,
    ),
    'Only confirmed batch placeholder IDs are retired',
  );
  const css = await readFile(
    new URL('../app/globals.css', import.meta.url),
    'utf8',
  );
  assert.match(
    css,
    /\.transaction-modal \.ant-modal-footer,\s*\.ledger-modal \.ant-modal-footer\s*{[^}]*background: transparent/,
  );
});
