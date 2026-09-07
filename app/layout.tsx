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
  icons: {
    icon: [
      { url: '/favicon-v8.ico', sizes: '32x32', type: 'image/x-icon' },
      { url: '/favicon-v8.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32-v8.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16-v8.png', sizes: '16x16', type: 'image/png' },
    ],
    shortcut: '/favicon-v8.ico',
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
      <head>
        <link rel="manifest" href="/manifest.webmanifest?v=8" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-v8.png" />
        <link
          rel="apple-touch-icon-precomposed"
          sizes="180x180"
          href="/apple-touch-icon-v8.png"
        />
      </head>
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
