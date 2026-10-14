import type { ClientRuntime } from './client-runtime.ts';
import type { LedgerData, LedgerTransaction } from '../app/kaikei-app';
import { freshDemoLedger } from './demo-seed.ts';
import { recalculateDemoCards } from './demo-cards.ts';
import { durableRecoveryStorage } from './recovery-storage.ts';
import { transactionFingerprint } from './transaction-save.ts';
import {
  validateBudgetBody,
  validateBudgetIdentity,
  validateBudgetOrderBody,
  validateMonthCloseBody,
  validateNewBudgetBody,
  validateTransactionBatchBody,
  validateTransactionBody,
} from './validation.ts';
import { isCalendarPeriod, wholeYen } from './calendar-validation.ts';

export const DEMO_STORE = 'kaikei-demo-ledger-v2';
const LEGACY_STORE = 'kaikei-demo-ledger-v1';
interface DemoState {
  ledger: LedgerData;
  receipts: Record<string, { signature: string; result: unknown }>;
  cancelled: string[];
}
class DemoCommitUncertain extends Error {}
function writable(period: string) {
  if (!isCalendarPeriod(period) || period < '2026-09')
    throw new Error('Months before September 2026 are read-only in the demo.');
}
function validLedger(value: unknown): value is LedgerData {
  if (!value || typeof value !== 'object') return false;
  const data = value as LedgerData;
  return (
    Number.isSafeInteger(data.initialBalance) &&
    Array.isArray(data.transactions) &&
    Array.isArray(data.budgets) &&
    data.transactions.every(
      (row) =>
        typeof row.id === 'string' &&
        typeof row.transactionDate === 'string' &&
        Number.isSafeInteger(row.amount),
    ) &&
    data.budgets.every(
      (row) =>
        typeof row.id === 'string' &&
        isCalendarPeriod(row.period) &&
        Number.isSafeInteger(row.plannedAmount),
    )
  );
}

export function createDemoRuntime(
  storage: Storage,
  makeId = () => crypto.randomUUID(),
) {
  function read(): DemoState {
    const saved = storage.getItem(DEMO_STORE);
    if (saved) {
      const parsed = JSON.parse(saved) as DemoState;
      if (
        !validLedger(parsed.ledger) ||
        !parsed.receipts ||
        !Array.isArray(parsed.cancelled)
      )
        throw new Error(
          'Demo storage is damaged. Export it before resetting the demo.',
        );
      return parsed;
    }
    let ledger = freshDemoLedger();
    const legacy = storage.getItem(LEGACY_STORE);
    if (legacy) {
      const previous = JSON.parse(legacy);
      if (!validLedger(previous))
        throw new Error(
          'The older demo data could not be read. It has not been removed.',
        );
      const months = new Set(
        [...previous.transactions, ...previous.budgets].map(
          (row) => row.period,
        ),
      );
      ledger = {
        ...ledger,
        initialBalance: previous.initialBalance,
        transactions: [
          ...previous.transactions,
          ...ledger.transactions.filter((row) => !months.has(row.period)),
        ],
        budgets: [
          ...previous.budgets,
          ...ledger.budgets.filter((row) => !months.has(row.period)),
        ],
      };
    }
    return {
      ledger: recalculateDemoCards(ledger),
      receipts: {},
      cancelled: [],
    };
  }
  function commit(state: DemoState) {
    state.ledger = recalculateDemoCards({
      ...state.ledger,
      syncMode: 'database',
      sourceFile: 'Fictional demo data',
      syncedAt: new Date().toISOString(),
    });
    const encoded = JSON.stringify(state);
    storage.setItem(DEMO_STORE, encoded);
    let confirmed = false;
    try {
      confirmed = storage.getItem(DEMO_STORE) === encoded;
    } catch {
      /* Stored outcome is unknown. */
    }
    if (!confirmed)
      throw new DemoCommitUncertain(
        'Your browser could not confirm the demo save.',
      );
  }
  // Verify initial persistence before allowing the shared UI to submit additions.
  const initial = read();
  if (!storage.getItem(DEMO_STORE)) commit(initial);
  function perform(input: RequestInfo | URL, init: RequestInit = {}): Response {
    try {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const target = input instanceof Request ? input.url : String(input);
      // Deliberately no fetch fallback, external URLs, tokens or Sheet endpoint.
      if (
        !target.startsWith('/api/') ||
        target.startsWith('//') ||
        target.includes('\\')
      )
        throw new Error('The demo only accepts local browser operations.');
      const url = new URL(target, 'https://demo.invalid');
      const method = (init.method || 'GET').toUpperCase();
      if (init.body && typeof init.body !== 'string')
        throw new Error('The demo expects JSON text.');
      const body = init.body ? JSON.parse(init.body as string) : {};
      const state = read();
      let { ledger } = state;
      const snapshot = (period?: string | null) =>
        period
          ? {
              ...ledger,
              transactions: ledger.transactions.filter(
                (row) => row.period === period,
              ),
              budgets: ledger.budgets.filter((row) => row.period === period),
            }
          : ledger;
      if (method === 'GET' && url.pathname === '/api/ledger')
        return Response.json(ledger);
      if (method === 'GET' && url.pathname === '/api/ledger/reconcile')
        return Response.json(snapshot(url.searchParams.get('period')));
      const id = decodeURIComponent(url.pathname.split('/').at(-1) || '');
      if (method === 'GET' && url.pathname.startsWith('/api/ledger/')) {
        const receipt =
          state.receipts['edit:' + url.searchParams.get('mutationId')];
        return Response.json(
          receipt?.result ||
            ledger.transactions.find((row) => row.id === id) || {
              error: 'Demo transaction not found',
            },
          {
            status:
              receipt || ledger.transactions.some((row) => row.id === id)
                ? 200
                : 404,
          },
        );
      }
      let result: unknown;
      if (url.pathname === '/api/ledger' && method === 'POST') {
        const inputs = body.transactions
          ? validateTransactionBatchBody(body)
          : [validateTransactionBody(body)];
        const items = inputs.map((value) => {
          writable(value.transactionDate.slice(0, 7));
          const key = 'add:' + (value.clientMutationId || makeId());
          const signature = JSON.stringify(value);
          const previous = state.receipts[key];
          if (previous) {
            if (previous.signature !== signature)
              throw new Error(
                'This demo save identifier was already used for different input.',
              );
            return previous.result as LedgerTransaction;
          }
          const item: LedgerTransaction = {
            ...value,
            id: 'demo-' + makeId(),
            period: value.transactionDate.slice(0, 7),
            source: 'manual',
            createdAt: Date.now(),
          };
          ledger.transactions.push(item);
          state.receipts[key] = { signature, result: item };
          return item;
        });
        result = body.transactions ? items : items[0];
      } else if (
        url.pathname === '/api/ledger/delete-status' &&
        method === 'POST'
      ) {
        if (!/^[a-zA-Z0-9_-]{1,80}$/.test(body.clientMutationId || ''))
          throw new Error('Invalid demo deletion identifier.');
        const previous = state.receipts['delete:' + body.clientMutationId];
        if (body.resolve && !previous)
          state.cancelled.push(body.clientMutationId);
        result = {
          deleted: Boolean(previous),
          resolved: Boolean(body.resolve),
        };
      } else if (
        url.pathname.startsWith('/api/ledger/') &&
        ['PATCH', 'DELETE'].includes(method)
      ) {
        const key =
          (method === 'PATCH' ? 'edit:' : 'delete:') +
          (body.clientMutationId || makeId());
        const signature = JSON.stringify([id, body]);
        const receipt = state.receipts[key];
        if (receipt) {
          if (receipt.signature !== signature)
            throw new Error('This demo operation identifier was reused.');
          return Response.json(receipt.result);
        }
        if (state.cancelled.includes(body.clientMutationId))
          throw new Error('This demo deletion was cancelled.');
        const old = ledger.transactions.find((row) => row.id === id);
        if (!old)
          return Response.json(
            { error: 'Demo transaction not found' },
            { status: 404 },
          );
        writable(old.period);
        if (
          body.originalFingerprint &&
          body.originalFingerprint !== transactionFingerprint(old)
        )
          throw new Error(
            'This demo transaction changed in another tab. Reopen it before editing.',
          );
        if (method === 'PATCH') {
          const value = validateTransactionBody(body);
          writable(value.transactionDate.slice(0, 7));
          const item = {
            ...old,
            ...value,
            period: value.transactionDate.slice(0, 7),
          };
          ledger.transactions = ledger.transactions.map((row) =>
            row.id === id ? item : row,
          );
          result = item;
        } else {
          ledger.transactions = ledger.transactions.filter(
            (row) => row.id !== id,
          );
          result = { id, deleted: true };
        }
        state.receipts[key] = { signature, result };
      } else if (
        url.pathname === '/api/budgets' &&
        ['PUT', 'POST'].includes(method)
      ) {
        const value =
          method === 'POST'
            ? validateNewBudgetBody(body)
            : validateBudgetBody(body);
        writable(value.period);
        const original =
          'originalCategory' in value ? value.originalCategory : value.category;
        const old = ledger.budgets.find(
          (row) =>
            row.period === value.period &&
            row.type === value.type &&
            row.category === original,
        );
        if (
          ledger.budgets.some(
            (row) =>
              row.period === value.period &&
              row.type === value.type &&
              row.category === value.category &&
              row.id !== old?.id,
          )
        )
          throw new Error('That demo category already exists.');
        const item = {
          ...old,
          ...value,
          id: old?.id || 'demo-budget-' + makeId(),
          updatedAt: Date.now(),
        };
        ledger.budgets = old
          ? ledger.budgets.map((row) => (row.id === old.id ? item : row))
          : [...ledger.budgets, item];
        ledger.transactions = ledger.transactions.map((row) =>
          row.period === value.period &&
          row.type === value.type &&
          row.category === original
            ? { ...row, category: item.category }
            : row,
        );
        result = item;
      } else if (url.pathname === '/api/budgets' && method === 'DELETE') {
        const value = validateBudgetIdentity(body);
        writable(value.period);
        const matches = (row: LedgerData['budgets'][number]) =>
          row.period === value.period &&
          row.type === value.type &&
          row.category === value.category;
        result = { deleted: ledger.budgets.some(matches) };
        ledger.budgets = ledger.budgets.filter((row) => !matches(row));
      } else if (url.pathname === '/api/budgets' && method === 'PATCH') {
        const value = validateBudgetOrderBody(body);
        writable(value.period);
        const rows = ledger.budgets.filter(
          (row) => row.period === value.period && row.type === value.type,
        );
        if (
          rows.length !== value.categories.length ||
          value.categories.some(
            (category) => !rows.some((row) => row.category === category),
          )
        )
          throw new Error('The demo categories changed. Reopen rearranging.');
        const ordered = value.categories.map((category) =>
          rows.find((row) => row.category === category)!,
        );
        let index = 0;
        ledger.budgets = ledger.budgets.map((row) =>
          row.period === value.period && row.type === value.type
            ? ordered[index++]
            : row,
        );
        result = ordered;
      } else if (
        url.pathname === '/api/budgets/credit-card' &&
        method === 'PUT'
      ) {
        writable(body.period);
        const grossAmount = wholeYen(body.grossAmount);
        const index = ledger.budgets.findIndex(
          (row) =>
            row.period === body.period &&
            row.type === 'expense' &&
            row.category.toLowerCase().replace(/^\S+\s(?=credit card$)/, '') ===
              'credit card',
        );
        if (index < 0 || !Number.isSafeInteger(grossAmount) || grossAmount < 0)
          throw new Error(
            'Choose a demo credit-card category and a whole-yen bill.',
          );
        ledger.budgets[index] = {
          ...ledger.budgets[index],
          creditCardGrossAmount: grossAmount,
          updatedAt: Date.now(),
        };
        result = 'snapshot';
      } else if (url.pathname === '/api/month-close' && method === 'POST') {
        const value = validateMonthCloseBody(body);
        const date = new Date(value.period + '-01T00:00:00Z');
        date.setUTCMonth(date.getUTCMonth() + 1);
        const period = date.toISOString().slice(0, 7);
        for (const plan of value.plans) {
          const old = ledger.budgets.find(
            (row) =>
              row.period === period &&
              row.type === plan.type &&
              row.category === plan.category,
          );
          const item = {
            ...plan,
            period,
            id: old?.id || 'demo-budget-' + makeId(),
            updatedAt: Date.now(),
          };
          ledger.budgets = old
            ? ledger.budgets.map((row) => (row.id === old.id ? item : row))
            : [...ledger.budgets, item];
        }
        result = 'snapshot';
      } else
        throw new Error(
          'This operation is not available in the browser-local demo.',
        );
      state.ledger = ledger;
      commit(state);
      return Response.json(result === 'snapshot' ? state.ledger : result);
    } catch (error) {
      return Response.json(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Could not save demo data.',
          ...(error instanceof DemoCommitUncertain
            ? { saveUncertain: true }
            : {}),
        },
        { status: error instanceof DemoCommitUncertain ? 503 : 400 },
      );
    }
  }
  const runtime: ClientRuntime = {
    browserLocal: true,
    isOnline: () => true,
    recoveryStorage: durableRecoveryStorage(storage),
    request: async (input, init) =>
      typeof navigator !== 'undefined' && navigator.locks
        ? navigator.locks.request('kaikei-demo-ledger', () =>
            perform(input, init),
          )
        : perform(input, init),
  };
  return { runtime, snapshot: () => structuredClone(read().ledger) };
}

export function resetDemo(storage: Storage) {
  // Only keys owned by this separate demo origin; never localStorage.clear().
  const keys = Array.from({ length: storage.length }, (_, index) =>
    storage.key(index),
  ).filter((key): key is string => Boolean(key?.startsWith('kaikei-')));
  keys.forEach((key) => storage.removeItem(key));
}
