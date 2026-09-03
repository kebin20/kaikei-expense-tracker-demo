import type { Metadata, Viewport } from 'next';
import 'antd/dist/reset.css';
import './globals.css';
import Providers from './providers';

export const metadata: Metadata = {
  metadataBase: new URL('https://kaikei-demo-2026.ktanzyl.chatgpt.site'),
  title: 'Kaikei Demo — Personal expenses, made clear',
  description:
    'Try Kaikei with synthetic finances stored only in your browser.',
  applicationName: 'Kaikei Demo',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Kaikei Demo',
  },
  icons: {
    icon: [
      { url: '/favicon.ico?v=3', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon.svg?v=3', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png?v=3', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png?v=3', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon.ico?v=3',
    apple: [{ url: '/apple-touch-icon.png?v=3', sizes: '180x180', type: 'image/png' }],
    other: [{ rel: 'apple-touch-icon-precomposed', url: '/apple-touch-icon-precomposed.png?v=3' }],
  },
  openGraph: {
    title: 'Kaikei Demo — Personal expenses, made clear',
    description: 'Try income, expense, and budget tracking with synthetic sample data.',
    type: 'website',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Kaikei personal expense tracker' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Kaikei Demo — Personal expenses, made clear',
    description: 'Try income, expense, and budget tracking with synthetic sample data.',
    images: ['/og.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#102542',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
