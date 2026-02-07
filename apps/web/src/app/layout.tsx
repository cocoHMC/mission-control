import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Fira_Code, Fira_Sans } from 'next/font/google';
import './globals.css';
import { DesktopNotificationsProvider } from '@/components/notifications/DesktopNotificationsProvider';

const display = Fira_Code({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

const body = Fira_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const mono = Fira_Code({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'OpenClaw Mission Control',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#f6f1ea',
};

// This is an authenticated, realtime dashboard. Disable static generation so
// builds don't try to prerender pages that require runtime env credentials.
export const dynamic = 'force-dynamic';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${display.variable} ${body.variable} ${mono.variable} antialiased`}>
        <Script id="mc-theme-init" strategy="beforeInteractive">
          {`(() => {
  try {
    const t = localStorage.getItem('mc_theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
    const ua = navigator.userAgent || '';
    if (ua.includes('Electron') || (window && window.MissionControlDesktop)) {
      document.documentElement.dataset.mcDesktop = '1';
      if (/Macintosh|Mac OS X|MacIntel/i.test(ua)) {
        document.documentElement.dataset.mcMacos = '1';
      }
    }
  } catch {}
})();`}
        </Script>
        <DesktopNotificationsProvider />
        {children}
      </body>
    </html>
  );
}
