export type FeedbackKind = 'message' | 'modal' | 'notification';
export interface FeedbackCall {
  kind: FeedbackKind;
  method: string;
  args: unknown[];
}

// Stable event-only port: loading feedback must never re-parent the ledger,
// reset its forms, or run a queued confirmation's onOk before user approval.
export function deferredFeedback(activate: () => void) {
  let port: ((call: FeedbackCall) => void) | undefined;
  let activated = false;
  let disposed = false;
  const queue: FeedbackCall[] = [];
  const waiting = new Set<(ready: boolean) => void>();
  const start = () => {
    if (!activated) {
      activated = true;
      activate();
    }
  };
  return {
    call(kind: FeedbackKind, method: string, ...args: unknown[]) {
      if (disposed) return;
      const command = { kind, method, args };
      if (port) {
        port(command);
        return;
      }
      if (method === 'destroy' && !activated) return;
      queue.push(command);
      start();
    },
    prepare(timeoutMs = 8000): Promise<boolean> {
      if (disposed) return Promise.resolve(false);
      if (port) return Promise.resolve(true);
      start();
      if (port) return Promise.resolve(true);
      return new Promise((resolve) => {
        const done = (ready: boolean) => {
          clearTimeout(timer);
          waiting.delete(done);
          resolve(ready);
        };
        const timer = setTimeout(() => done(false), timeoutMs);
        waiting.add(done);
      });
    },
    ready(next: (call: FeedbackCall) => void): () => void {
      if (disposed) return () => {};
      port = next;
      try {
        for (const command of queue.splice(0)) next(command);
      } catch (error) {
        port = undefined;
        for (const done of waiting) done(false);
        throw error;
      }
      for (const done of waiting) done(true);
      return () => {
        if (port === next) port = undefined;
      };
    },
    dispose() {
      disposed = true;
      queue.length = 0;
      port = undefined;
      for (const done of waiting) done(false);
    },
  };
}
