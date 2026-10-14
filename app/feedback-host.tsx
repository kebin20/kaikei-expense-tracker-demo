'use client';

import { App } from 'antd';
import { useLayoutEffect } from 'react';
import type { FeedbackCall } from '@/lib/deferred-feedback';

function BindFeedback({
  onReady,
}: {
  onReady: (port: (call: FeedbackCall) => void) => () => void;
}) {
  const api = App.useApp();
  useLayoutEffect(() => {
    return onReady((call) => {
      const channel = api[call.kind] as unknown as Record<
        string,
        (...args: unknown[]) => void
      >;
      channel[call.method](...call.args);
    });
  }, [api, onReady]);
  return null;
}
export default function FeedbackHost(props: {
  onReady: (port: (call: FeedbackCall) => void) => () => void;
}) {
  return (
    <App>
      <BindFeedback {...props} />
    </App>
  );
}
