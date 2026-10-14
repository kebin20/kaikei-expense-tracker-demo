'use client';

import {
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { FeedbackContext, type FeedbackApi } from './feedback-context';
import { deferredFeedback, type FeedbackCall } from '@/lib/deferred-feedback';
import AppErrorBoundary from './app-error-boundary';

const FeedbackHost = lazy(() => import('./feedback-host'));
export default function DeferredFeedback({
  children,
}: {
  children: ReactNode;
}) {
  const [active, setActive] = useState(false);
  const [controller] = useState(() => deferredFeedback(() => setActive(true)));
  const onReady = useCallback(
    (port: (call: FeedbackCall) => void) => controller.ready(port),
    [controller],
  );
  const api = useMemo<FeedbackApi>(
    () => ({
      prepare: () => controller.prepare(),
      message: {
        info: (content) => controller.call('message', 'info', content),
        success: (content) => controller.call('message', 'success', content),
        warning: (content) => controller.call('message', 'warning', content),
        error: (content) => controller.call('message', 'error', content),
      },
      modal: {
        info: (config) => controller.call('modal', 'info', config),
        confirm: (config) => controller.call('modal', 'confirm', config),
      },
      notification: {
        open: (config) => controller.call('notification', 'open', config),
        destroy: (key) => controller.call('notification', 'destroy', key),
      },
    }),
    [controller],
  );
  return (
    <FeedbackContext.Provider value={api}>
      {children}
      {active && (
        <AppErrorBoundary>
          <Suspense fallback={null}>
            <FeedbackHost onReady={onReady} />
          </Suspense>
        </AppErrorBoundary>
      )}
    </FeedbackContext.Provider>
  );
}
