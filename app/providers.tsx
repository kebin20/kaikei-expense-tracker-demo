'use client';

import { App as AntApp, ConfigProvider } from 'antd';
import type { ReactNode } from 'react';

const theme = {
  token: {
    colorPrimary: '#f26a21',
    colorInfo: '#f26a21',
    colorText: '#102542',
    colorTextSecondary: '#637083',
    colorBgLayout: '#f6f7f9',
    colorBorderSecondary: '#e9edf2',
    borderRadius: 12,
    borderRadiusLG: 18,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    boxShadowSecondary: '0 12px 32px rgba(16, 37, 66, 0.09)',
  },
  components: {
    Button: { controlHeight: 42, fontWeight: 650 },
    Card: { headerFontSize: 16 },
    Menu: { itemBorderRadius: 12, itemHeight: 46 },
  },
};

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider theme={theme}>
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
