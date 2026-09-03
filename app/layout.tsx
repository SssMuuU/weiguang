import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://weiguang-plan-habits.workspace-192140.chatgpt.site'),
  title: '微光｜计划、习惯与待办',
  description: '把想做的事，变成每天真的做到。',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: '微光',
    statusBarStyle: 'black-translucent',
  },
  other: {
    'apple-mobile-web-app-capable': 'yes',
  },
  icons: {
    icon: '/icon-1024.png',
    apple: '/icon-1024.png',
  },
  openGraph: {
    title: '微光｜计划、习惯与待办',
    description: '把想做的事，变成每天真的做到。',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: '微光应用分享封面' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: '微光｜计划、习惯与待办',
    description: '把想做的事，变成每天真的做到。',
    images: ['/og.png'],
  },
};

export const viewport = {
  themeColor: '#7465eb',
  colorScheme: 'light',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
