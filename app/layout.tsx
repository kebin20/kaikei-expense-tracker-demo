import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import 'antd/dist/reset.css';
import './globals.css';
import Providers from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
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
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
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
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
