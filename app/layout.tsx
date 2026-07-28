import type { Metadata, Viewport } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import { RegisterSW } from '@/components/pwa/RegisterSW';
import { Toaster } from '@/components/ui/toast';
import { ReducedMotionProvider } from '@/components/motion/ReducedMotionProvider';
import { ProductionAnalytics } from '@/components/analytics/ProductionAnalytics';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800'],
});
// Display face — trip titles, hero headlines, empty-state prompts. Body stays Inter.
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  weight: ['400', '500', '600', '700'],
  style: ['normal', 'italic'],
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
        className={`${inter.variable} ${fraunces.variable} antialiased bg-[#0A0A0F] text-white`}
      >
        <ReducedMotionProvider>
          {children}
          <Toaster />
          <RegisterSW />
          <ProductionAnalytics />
        </ReducedMotionProvider>
      </body>
    </html>
  );
}
