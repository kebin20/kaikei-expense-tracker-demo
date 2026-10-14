import { getClientRuntime } from './client-runtime.ts';

export interface RequestTiming {
  requestMs: number;
  serverMs?: number;
  sheetMs?: number;
  transportMs?: number;
}

export class RequestTimeoutError extends Error {
  constructor(write: boolean) {
    super(
      write
        ? 'The save has not been confirmed yet. Check sync status before submitting another change.'
        : 'The request timed out. Your current data is unchanged; try again when connected.',
    );
    this.name = 'RequestTimeoutError';
  }
}

// Buffer the response while the deadline is active. A server can return headers
// promptly and then stall indefinitely while sending its JSON body.
export async function boundedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  deadlineMs = 20000,
  onTiming?: (timing: RequestTiming, successful: boolean) => void,
) {
  const controller = new AbortController();
  const started = performance.now();
  const abort = () => controller.abort();
  const timer = setTimeout(abort, deadlineMs);
  init.signal?.addEventListener('abort', abort, { once: true });
  if (init.signal?.aborted) abort();
  let timing: RequestTiming | undefined;
  let successful = false;
  try {
    const runtime = getClientRuntime();
    // Native transports cannot necessarily cancel an in-flight OS request.
    // Racing the entire buffered read still bounds the UI wait; an uncertain
    // write continues through the existing receipt/recovery flow, not a retry.
    const operation = async () => {
      if (!['GET', 'HEAD'].includes((init.method || 'GET').toUpperCase()))
        await runtime?.flushRecovery?.();
      if (controller.signal.aborted)
        throw new DOMException('Aborted', 'AbortError');
      const response = await (runtime?.request ?? fetch)(input, {
        ...init,
        signal: controller.signal,
      });
      const bytes = await response.arrayBuffer();
      return { response, bytes };
    };
    const { response, bytes } = await new Promise<{
      response: Response;
      bytes: ArrayBuffer;
    }>((resolve, reject) => {
      const rejectAbort = () =>
        reject(new DOMException('Aborted', 'AbortError'));
      controller.signal.addEventListener('abort', rejectAbort, { once: true });
      if (controller.signal.aborted) rejectAbort();
      else
        operation()
          .then(resolve, reject)
          .finally(() =>
            controller.signal.removeEventListener('abort', rejectAbort),
          );
    });
    const requestMs = performance.now() - started;
    const header = response.headers.get('Server-Timing') || '';
    const duration = (name: string) => {
      const value = header.match(
        new RegExp(`(?:^|,)\\s*${name};dur=([\\d.]+)`),
      );
      return value ? Number(value[1]) : undefined;
    };
    const serverMs = duration('server');
    timing = {
      requestMs,
      serverMs,
      sheetMs: duration('sheet'),
      transportMs:
        serverMs === undefined ? undefined : Math.max(0, requestMs - serverMs),
    };
    successful = response.ok;
    return new Response(bytes, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (error) {
    if (controller.signal.aborted)
      throw new RequestTimeoutError(
        !['GET', 'HEAD'].includes(init.method || 'GET'),
      );
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abort);
    onTiming?.(
      timing || { requestMs: performance.now() - started },
      successful,
    );
    if (!onTiming && typeof window !== 'undefined')
      window.dispatchEvent(
        new CustomEvent('kaikei-request-timing', {
          detail: {
            timing: timing || { requestMs: performance.now() - started },
            successful,
          },
        }),
      );
  }
}
