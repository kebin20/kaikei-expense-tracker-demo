import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deferredFeedback } from './deferred-feedback.ts';

test('feedback loads only after an event, preserves call ordering and never runs approval callbacks itself', () => {
  let loads = 0,
    writes = 0;
  const controller = deferredFeedback(() => loads++),
    sent = [];
  controller.call('notification', 'destroy', 'not-opened');
  assert.equal(loads, 0);
  const confirmation = { onOk: () => writes++ };
  controller.call('message', 'success', 'Saved');
  controller.call('modal', 'confirm', confirmation);
  controller.call('notification', 'open', { key: 'undo' });
  controller.call('notification', 'destroy', 'undo');
  assert.equal(loads, 1);
  assert.equal(writes, 0);
  controller.ready((call) => sent.push(call));
  assert.deepEqual(
    sent.map((call) => call.method),
    ['success', 'confirm', 'open', 'destroy'],
  );
  assert.equal(sent[1].args[0], confirmation);
  assert.equal(writes, 0);
  controller.ready((call) => sent.push(call));
  assert.equal(sent.length, 4);
  controller.call('message', 'error', 'A later error');
  assert.equal(sent.length, 5);
});

test('Undo preflight waits for a ready UI and load failure times out without authorizing deletion', async () => {
  let loads = 0;
  const controller = deferredFeedback(() => loads++);
  assert.equal(await controller.prepare(15), false);
  assert.equal(loads, 1);
  const retry = controller.prepare(200);
  controller.ready(() => {});
  assert.equal(await retry, true);
  assert.equal(await controller.prepare(15), true);
});

test('disposed feedback drops pending commands and releases waiting controls without callbacks', async () => {
  const controller = deferredFeedback(() => {}),
    sent = [];
  controller.call('modal', 'confirm', {
    onOk() {
      throw new Error('Must not execute');
    },
  });
  const ready = controller.prepare(100);
  controller.dispose();
  assert.equal(await ready, false);
  controller.ready((call) => sent.push(call));
  controller.call('message', 'success', 'Ignored');
  assert.equal(sent.length, 0);
});

test('an unmounted or failed feedback host cannot leave a stale ready port authorizing Undo-dependent actions', async () => {
  const controller = deferredFeedback(() => {});
  const detach = controller.ready(() => {});
  assert.equal(await controller.prepare(15), true);
  detach();
  assert.equal(await controller.prepare(15), false);
  controller.call('message', 'info', 'Queued');
  assert.throws(
    () =>
      controller.ready(() => {
        throw new Error('Host failed');
      }),
    /Host failed/,
  );
  assert.equal(await controller.prepare(15), false);
  controller.ready(() => {});
  assert.equal(await controller.prepare(15), true);
});
