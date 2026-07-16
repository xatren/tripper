import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Inter } from 'next/font/google';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import { Toaster } from '@/components/ui/toast';
import { ReducedMotionProvider } from '@/components/motion/ReducedMotionProvider';
import './globals.css';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Tripper — Road Trip Planner',
  description: 'Plan epic road trips with friends. Interactive map, realtime collaboration, and budget tracking.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Tripper',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a1020',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} antialiased bg-[#0A0A0F] text-white`}
      >
        <ReducedMotionProvider>
          {children}
          <Toaster />
          <RegisterSW />
        </ReducedMotionProvider>
      </body>
    </html>
  );
}
