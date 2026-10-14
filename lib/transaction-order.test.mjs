import assert from 'node:assert/strict';
import { compareTransactions, replaceTransaction } from './transaction-order.ts';

const familyMart = { id: 'gstx|2026-09|expense|90', transactionDate: '2026-09-30', createdAt: 0, period: '2026-09' };
const other = { id: 'gstx|2026-09|expense|91', transactionDate: '2026-09-30', createdAt: 0, period: '2026-09' };
const backdated = { ...familyMart, transactionDate: '2026-09-29' };
const reordered = replaceTransaction([familyMart, other], familyMart.id, backdated);
assert.equal(reordered[0].id, other.id);
assert.equal(reordered[1].transactionDate, '2026-09-29');
assert.equal(familyMart.transactionDate, '2026-09-30');
const october = { ...familyMart, id: 'gstx|2026-10|expense|5', period: '2026-10', transactionDate: '2026-10-01' };
const moved = replaceTransaction([october, other], october.id, backdated);
assert.equal(moved.some((item) => item.id === october.id), false);
assert.equal(moved.filter((item) => item.id === backdated.id).length, 1);
assert.equal(moved.some((item) => item.period === '2026-10'), false);
assert.equal(replaceTransaction(moved, october.id, backdated).length, 2);
assert.equal(replaceTransaction([], october.id, backdated)[0].id, backdated.id);
assert.deepEqual([...moved].sort(compareTransactions), moved);
console.log('Transaction reordering and cross-month replacement checks passed.');
