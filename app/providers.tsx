'use client';

import { App as AntApp, ConfigProvider } from 'antd';
import { theme as antdTheme } from 'antd';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'kaikei-demo-theme';

const ThemeModeContext = createContext<{
  mode: ThemeMode;
  toggleTheme: () => void;
}>({ mode: 'light', toggleTheme: () => undefined });

export function useKaikeiTheme() {
  return useContext(ThemeModeContext);
}

export default function Providers({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>('light');
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMode(
        document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
      );
      setThemeReady(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.dataset.theme = mode;
    document.documentElement.style.colorScheme = mode;
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', mode === 'dark' ? '#071627' : '#edf3f8');
  }, [mode, themeReady]);

  const theme = useMemo(
    () => ({
      algorithm:
        mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      token: {
        colorPrimary: '#ff7a36',
        colorInfo: '#ff7a36',
        colorText: mode === 'dark' ? '#f7f9fc' : '#102542',
        colorTextSecondary: mode === 'dark' ? '#aebcd0' : '#53647d',
        colorBgLayout: mode === 'dark' ? '#071627' : '#edf3f8',
        colorBgContainer: mode === 'dark' ? '#0f2238' : '#ffffff',
        colorBorder: mode === 'dark' ? '#29405b' : '#d8e1eb',
        colorBorderSecondary: mode === 'dark' ? '#22364f' : '#e2e9f0',
        borderRadius: 13,
        borderRadiusLG: 18,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        boxShadowSecondary:
          mode === 'dark'
            ? '0 16px 40px rgba(0, 0, 0, 0.28)'
            : '0 14px 36px rgba(16, 37, 66, 0.08)',
      },
      components: {
        Button: { controlHeight: 44, fontWeight: 680 },
        Card: { headerFontSize: 16 },
        Menu: { itemBorderRadius: 13, itemHeight: 46 },
        Segmented: { itemSelectedBg: mode === 'dark' ? '#1d3653' : '#ffffff' },
      },
    }),
    [mode],
  );

  const themeValue = useMemo(
    () => ({
      mode,
      toggleTheme: () =>
        setMode((current) => (current === 'dark' ? 'light' : 'dark')),
    }),
    [mode],
  );

  return (
    <ThemeModeContext.Provider value={themeValue}>
      <ConfigProvider theme={theme}>
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeModeContext.Provider>
  );
}
