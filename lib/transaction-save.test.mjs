import assert from 'node:assert/strict';
import {
  transactionSaveJson,
  SaveNotConfirmedError,
  validPendingEdit,
  transactionFingerprint,
} from './transaction-save.ts';

const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async () => Response.json({ saved: true });
  assert.deepEqual(await transactionSaveJson('/status', {}), { saved: true });
  globalThis.fetch = async () =>
    Response.json({ error: 'Review changed row.' }, { status: 400 });
  await assert.rejects(transactionSaveJson('/edit', {}), /Review changed row/);
  globalThis.fetch = async () =>
    Response.json({ saveUncertain: true }, { status: 504 });
  await assert.rejects(transactionSaveJson('/edit', {}), SaveNotConfirmedError);
  for (const delayedBody of [false, true]) {
    globalThis.fetch = async (_url, { signal }) => {
      const stalled = () =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      return delayedBody ? { ok: true, arrayBuffer: stalled } : stalled();
    };
    await assert.rejects(
      transactionSaveJson('/edit', {}, 10),
      SaveNotConfirmedError,
    );
  }
  globalThis.fetch = async () => {
    throw new TypeError('Network unavailable');
  };
  await assert.rejects(transactionSaveJson('/edit', {}), SaveNotConfirmedError);
  const original = {
    id: 'gstx|2026-10|expense|5',
    type: 'expense',
    transactionDate: '2026-10-02',
    amount: 4536,
    description: 'Souvenirs',
    category: 'Week 1',
  };
  const input = {
    ...original,
    clientMutationId: 'same-save-identifier',
    originalFingerprint: transactionFingerprint(original),
  };
  assert.equal(validPendingEdit({ original, input }), true);
  assert.equal(
    validPendingEdit({ original, input: { ...input, amount: -1 } }),
    false,
  );
  assert.equal(
    validPendingEdit({ original, input: { ...input, clientMutationId: '' } }),
    false,
  );
  assert.equal(
    transactionFingerprint(original),
    JSON.stringify(['expense', '2026-10-02', 4536, 'Souvenirs', 'Week 1']),
  );
} finally {
  globalThis.fetch = originalFetch;
}
console.log(
  'Save success, validation errors, timeout through body parsing, network recovery, and retained draft checks passed.',
);
