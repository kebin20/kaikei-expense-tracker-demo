import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createDemoRuntime, DEMO_STORE, resetDemo } from './demo-runtime.ts';
import { freshDemoLedger } from './demo-seed.ts';
import { transactionFingerprint } from './transaction-save.ts';
import { defaultLedgerPeriod } from './calendar-period.ts';

function memory() {
  const values = new Map();
  let reject = false;
  return {
    get length() {
      return values.size;
    },
    key: (i) => [...values.keys()][i] || null,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      if (reject) throw new Error('Storage quota exceeded');
      values.set(key, String(value));
    },
    removeItem: (key) => values.delete(key),
    clear: () => {
      throw new Error('Do not clear unrelated data');
    },
    failWrites: () => {
      reject = true;
    },
  };
}
function setup(storage = memory()) {
  let sequence = 0;
  const demo = createDemoRuntime(storage, () => 'test-' + ++sequence);
  const request = async (path, method = 'GET', body) => {
    const response = await demo.runtime.request(path, {
      method,
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return {
      ok: response.ok,
      status: response.status,
      body: await response.json(),
    };
  };
  return { ...demo, request, storage };
}
const input = (clientMutationId = 'one') => ({
  clientMutationId,
  type: 'expense',
  transactionDate: '2026-10-14',
  amount: 1234,
  description: 'Fictional groceries',
  category: 'Week 2',
});

test('demo bootstrap contains fictional current-month weekly data and no Sheet mode', () => {
  const demo = setup();
  assert.equal(demo.snapshot().syncMode, 'database');
  assert.equal(defaultLedgerPeriod(demo.snapshot(), '2026-10-14'), '2026-10');
  assert.equal(
    demo
      .snapshot()
      .budgets.filter(
        (row) => row.period === '2026-10' && row.category.startsWith('Week'),
      ).length,
    4,
  );
  assert.equal(demo.runtime.isOnline(), true); // local operations need no internet
});
test('saved browser records migrate without changing their amounts or deleting the older copy', () => {
  const storage = memory();
  const previous = freshDemoLedger();
  previous.transactions[0].description = 'My earlier demo edit';
  previous.initialBalance = 123;
  storage.setItem('kaikei-demo-ledger-v1', JSON.stringify(previous));
  const demo = setup(storage);
  assert.equal(demo.snapshot().initialBalance, 123);
  assert.equal(
    demo.snapshot().transactions[0].description,
    'My earlier demo edit',
  );
  assert.ok(storage.getItem('kaikei-demo-ledger-v1'));
});
test('addition and edit receipts survive reopen, and exact retries never duplicate', async () => {
  const first = setup();
  const saved = await first.request('/api/ledger', 'POST', {
    transactions: [input()],
  });
  assert.equal(saved.ok, true);
  const reopened = setup(first.storage);
  const retry = await reopened.request('/api/ledger', 'POST', {
    transactions: [input()],
  });
  assert.equal(retry.body[0].id, saved.body[0].id);
  assert.equal(
    reopened
      .snapshot()
      .transactions.filter((row) => row.description === input().description)
      .length,
    1,
  );
  assert.equal(
    (
      await reopened.request('/api/ledger', 'POST', {
        transactions: [{ ...input(), amount: 456 }],
      })
    ).ok,
    false,
  );
});
test('backdated edits move between months immediately and reject stale fingerprints', async () => {
  const demo = setup();
  const row = (await demo.request('/api/ledger', 'POST', input())).body;
  const body = {
    ...input('edit-one'),
    transactionDate: '2026-09-29',
    originalFingerprint: transactionFingerprint(row),
  };
  const saved = await demo.request('/api/ledger/' + row.id, 'PATCH', body);
  assert.equal(saved.body.period, '2026-09');
  assert.equal(
    demo.snapshot().transactions.find((item) => item.id === row.id).period,
    '2026-09',
  );
  assert.equal(
    (
      await demo.request('/api/ledger/' + row.id, 'PATCH', {
        ...body,
        clientMutationId: 'edit-two',
      })
    ).ok,
    false,
  );
  assert.equal(
    (await demo.request('/api/ledger/' + row.id + '?mutationId=edit-one')).body
      .transactionDate,
    '2026-09-29',
  );
});
test('batch validation is atomic and malformed dates/yen never get persisted', async () => {
  const demo = setup();
  const before = demo.storage.getItem(DEMO_STORE);
  assert.equal(
    (
      await demo.request('/api/ledger', 'POST', {
        transactions: [
          input(),
          { ...input('two'), transactionDate: '2026-02-30' },
        ],
      })
    ).ok,
    false,
  );
  assert.equal(demo.storage.getItem(DEMO_STORE), before);
  assert.equal(
    (await demo.request('/api/ledger', 'POST', { ...input(), amount: 12.5 }))
      .ok,
    false,
  );
});
test('delete receipts are idempotent and resolved cancellation blocks a delayed deletion', async () => {
  const demo = setup();
  const row = (await demo.request('/api/ledger', 'POST', input())).body;
  const body = {
    period: row.period,
    clientMutationId: 'delete-one',
    originalFingerprint: transactionFingerprint(row),
  };
  assert.equal(
    (
      await demo.request('/api/ledger/delete-status', 'POST', {
        ...body,
        resolve: true,
      })
    ).body.deleted,
    false,
  );
  assert.equal(
    (await demo.request('/api/ledger/' + row.id, 'DELETE', body)).ok,
    false,
  );
  const accepted = { ...body, clientMutationId: 'delete-two' };
  assert.equal(
    (await demo.request('/api/ledger/' + row.id, 'DELETE', accepted)).body
      .deleted,
    true,
  );
  assert.equal(
    (
      await setup(demo.storage).request(
        '/api/ledger/' + row.id,
        'DELETE',
        accepted,
      )
    ).body.deleted,
    true,
  );
});
test('weekly rename retains identity and updates matching transactions; deleting an estimate keeps entries', async () => {
  const demo = setup();
  const value = {
    period: '2026-10',
    type: 'expense',
    originalCategory: 'Week 1',
    category: 'Groceries',
    plannedAmount: 21000,
    recurring: true,
  };
  const saved = await demo.request('/api/budgets', 'PUT', value);
  assert.equal(saved.body.category, 'Week 1 · Groceries');
  assert.ok(
    demo
      .snapshot()
      .transactions.some((row) => row.category === saved.body.category),
  );
  const count = demo.snapshot().transactions.length;
  await demo.request('/api/budgets', 'DELETE', {
    ...value,
    category: saved.body.category,
  });
  assert.equal(demo.snapshot().transactions.length, count);
});
test('reorder and month setup preserve rows and existing destination transactions', async () => {
  const demo = setup();
  const rows = demo
    .snapshot()
    .budgets.filter(
      (row) => row.period === '2026-10' && row.type === 'expense',
    );
  const order = rows.map((row) => row.category).reverse();
  assert.deepEqual(
    (
      await demo.request('/api/budgets', 'PATCH', {
        period: '2026-10',
        type: 'expense',
        categories: order,
      })
    ).body.map((row) => row.category),
    order,
  );
  const destination = (
    await demo.request('/api/ledger', 'POST', {
      ...input(),
      transactionDate: '2026-11-02',
    })
  ).body;
  await demo.request('/api/month-close', 'POST', {
    period: '2026-10',
    plans: [
      {
        type: 'expense',
        category: 'Week 1',
        plannedAmount: 22000,
        recurring: true,
      },
    ],
  });
  assert.ok(
    demo.snapshot().transactions.some((row) => row.id === destination.id),
  );
  assert.equal(
    demo
      .snapshot()
      .budgets.find(
        (row) => row.period === '2026-11' && row.category === 'Week 1',
      ).plannedAmount,
    22000,
  );
  assert.equal(defaultLedgerPeriod(demo.snapshot(), '2026-10-14'), '2026-10');
});
test('credit card always deducts fixed Actuals, excludes rent, and follows later fixed edits', async () => {
  const demo = setup();
  await demo.request('/api/budgets/credit-card', 'PUT', {
    period: '2026-10',
    grossAmount: 100000,
  });
  const card = () =>
    demo
      .snapshot()
      .transactions.find(
        (row) => row.period === '2026-10' && row.category === 'Credit Card',
      );
  assert.equal(card().amount, 94300); // Internet4500 + Netflix1200; not Rent90000
  const internet = demo
    .snapshot()
    .transactions.find(
      (row) => row.period === '2026-10' && row.category === 'Internet',
    );
  await demo.request('/api/ledger/' + internet.id, 'PATCH', {
    ...internet,
    amount: 5000,
    clientMutationId: 'fixed-edit',
    originalFingerprint: transactionFingerprint(internet),
  });
  assert.equal(card().amount, 93800);
});
test('blocked storage cannot claim a successful save or alter the confirmed record', async () => {
  const demo = setup();
  const before = demo.storage.getItem(DEMO_STORE);
  demo.storage.failWrites();
  assert.equal((await demo.request('/api/ledger', 'POST', input())).ok, false);
  assert.equal(demo.storage.getItem(DEMO_STORE), before);
});
test('unknown/external routes have no network fallback, and separate visitors remain isolated', async () => {
  const demo = setup();
  for (const path of [
    'https://example.invalid/api/ledger',
    '//example.invalid/api/ledger',
    '/api/not-supported',
  ])
    assert.equal((await demo.request(path)).ok, false);
  await demo.request('/api/ledger', 'POST', input());
  assert.equal(
    setup()
      .snapshot()
      .transactions.some((row) => row.description === input().description),
    false,
  );
});
test('reset removes owned demo data only; corrupt storage is retained and reported', () => {
  const demo = setup();
  demo.storage.setItem('other-app', 'keep');
  resetDemo(demo.storage);
  assert.equal(demo.storage.getItem(DEMO_STORE), null);
  assert.equal(demo.storage.getItem('other-app'), 'keep');
  demo.storage.setItem(DEMO_STORE, '{broken');
  assert.throws(() => setup(demo.storage));
  assert.equal(demo.storage.getItem(DEMO_STORE), '{broken');
});
