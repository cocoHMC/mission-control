import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { IBM_Plex_Sans, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { DesktopNotificationsProvider } from '@/components/notifications/DesktopNotificationsProvider';

const display = Space_Grotesk({
  variable: '--font-display',
  subsets: ['latin'],
});

const body = IBM_Plex_Sans({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Mission Control',
  description: 'OpenClaw Mission Control',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#f4efe9',
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
  } catch {}
})();`}
        </Script>
        <DesktopNotificationsProvider />
        {children}
      </body>
    </html>
  );
}
