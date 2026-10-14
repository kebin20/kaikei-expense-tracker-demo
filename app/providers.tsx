'use client';

import { ConfigProvider, theme as antdTheme } from 'antd';
import DeferredFeedback from './deferred-feedback';
import AppErrorBoundary from './app-error-boundary';
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type ThemeMode = 'light' | 'dark';

interface KaikeiThemeContextValue {
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const THEME_STORAGE_KEY = 'kaikei-theme-v1';
const KaikeiThemeContext = createContext<KaikeiThemeContextValue | null>(null);

export function useKaikeiTheme() {
  const value = useContext(KaikeiThemeContext);
  if (!value) throw new Error('useKaikeiTheme must be used inside Providers');
  return value;
}

export default function Providers({ children }: { children: ReactNode }) {
  const [themeMode, setThemeMode] = useState<ThemeMode>('light');
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const initialMode =
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
      setThemeMode(initialMode);
      setThemeReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    } catch {
      // Theme persistence is optional; blocked/full storage must not break the app.
    }
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', themeMode === 'dark' ? '#0b1422' : '#edf2f7');
  }, [themeMode, themeReady]);

  const themeConfig = useMemo(
    () => ({
      algorithm:
        themeMode === 'dark'
          ? antdTheme.darkAlgorithm
          : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: themeMode === 'dark' ? '#ff7a33' : '#f26a21',
        colorInfo: themeMode === 'dark' ? '#ff7a33' : '#f26a21',
        colorText: themeMode === 'dark' ? '#e8f0fa' : '#102542',
        colorTextSecondary: themeMode === 'dark' ? '#9fb0c5' : '#586579',
        colorTextPlaceholder: themeMode === 'dark' ? '#9fb0c5' : '#586579',
        colorBgLayout: themeMode === 'dark' ? '#0b1422' : '#edf2f7',
        colorBgContainer: themeMode === 'dark' ? '#121f31' : '#ffffff',
        colorBgElevated: themeMode === 'dark' ? '#17263a' : '#ffffff',
        colorBorderSecondary: themeMode === 'dark' ? '#27384d' : '#dfe7ef',
        borderRadius: 12,
        borderRadiusLG: 18,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxShadowSecondary:
          themeMode === 'dark'
            ? '0 12px 32px rgba(0, 0, 0, 0.28)'
            : '0 12px 32px rgba(16, 37, 66, 0.09)',
      },
      components: {
        Button: { controlHeight: 44, fontWeight: 650 },
        Card: { headerFontSize: 16 },
        Menu: { itemBorderRadius: 12, itemHeight: 46 },
      },
    }),
    [themeMode],
  );

  const themeValue = useMemo(
    () => ({
      themeMode,
      toggleTheme: () =>
        setThemeMode((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [themeMode],
  );

  return (
    <KaikeiThemeContext.Provider value={themeValue}>
      <ConfigProvider theme={themeConfig}>
        <DeferredFeedback>
          <div className="ant-app kaikei-app-root">
            <AppErrorBoundary>{children}</AppErrorBoundary>
          </div>
        </DeferredFeedback>
      </ConfigProvider>
    </KaikeiThemeContext.Provider>
  );
}
