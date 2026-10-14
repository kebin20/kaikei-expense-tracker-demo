'use client';

import { createContext, useContext, type ReactNode, type Key } from 'react';
import type { ModalFuncProps } from 'antd';
import type { ArgsProps as NotificationArgs } from 'antd/es/notification/interface';

export interface FeedbackApi {
  prepare: () => Promise<boolean>;
  message: Record<
    'info' | 'success' | 'warning' | 'error',
    (content: ReactNode) => void
  >;
  modal: Record<'info' | 'confirm', (config: ModalFuncProps) => void>;
  notification: {
    open: (config: NotificationArgs) => void;
    destroy: (key?: Key) => void;
  };
}
// Keep context identity separate from the refreshable host component.
export const FeedbackContext = createContext<FeedbackApi | null>(null);
export function useDeferredFeedback() {
  const value = useContext(FeedbackContext);
  if (!value) throw new Error('Feedback provider is unavailable.');
  return value;
}
