import type { Metadata, Viewport } from 'next';
import 'antd/dist/reset.css';
import './globals.css';
import Providers from './providers';
import { bootRecoveryScript } from '@/lib/shell-recovery';

export const metadata: Metadata = {
  metadataBase: new URL('https://kaikei-demo-2026.ktanzyl.chatgpt.site'),
  title: 'Kaikei Demo V3.10.4 — Personal expenses, made clear',
  description:
    'A browser-local showcase with fictional finances; no spreadsheet or production connection.',
  applicationName: 'Kaikei Demo V3.10.4',
  icons: {
    icon: [
      {
        url: '/favicon.ico?v=21',
        sizes: '32x32',
        type: 'image/x-icon',
      },
      {
        url: '/favicon-32x32-v21.png',
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: '/favicon-16x16-v21.png',
        sizes: '16x16',
        type: 'image/png',
      },
    ],
    shortcut: '/favicon.ico?v=21',
    apple: [
      {
        url: '/apple-touch-icon-v21.png',
        sizes: '180x180',
        type: 'image/png',
      },
      {
        url: '/apple-touch-icon-167-v21.png',
        sizes: '167x167',
        type: 'image/png',
      },
      {
        url: '/apple-touch-icon-152-v21.png',
        sizes: '152x152',
        type: 'image/png',
      },
    ],
  },
  openGraph: {
    title: 'Kaikei Demo V3.10.4 — Personal expenses, made clear',
    description:
      'Track income, expenses, and monthly budgets in one calm place.',
    type: 'website',
    images: [
      {
        url: '/og.png',
        width: 1200,
        height: 630,
        alt: 'Kaikei personal expense tracker',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kaikei Demo V3.10.4 — Personal expenses, made clear',
    description:
      'Track income, expenses, and monthly budgets in one calm place.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#edf2f7',
};

const themeInitializer = `
  try {
    const saved = localStorage.getItem('kaikei-theme-v1');
    const theme = saved === 'light' || saved === 'dark'
      ? saved
      : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  } catch {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest?v=21" />
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="/apple-touch-icon-v21.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="167x167"
          href="/apple-touch-icon-167-v21.png"
        />
        <link
          rel="apple-touch-icon"
          sizes="152x152"
          href="/apple-touch-icon-152-v21.png"
        />
        <link
          rel="apple-touch-icon-precomposed"
          sizes="180x180"
          href="/apple-touch-icon-v21.png"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Kaikei Demo" />
        <script dangerouslySetInnerHTML={{ __html: themeInitializer }} />
        <script dangerouslySetInnerHTML={{ __html: bootRecoveryScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
