import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import { Providers } from '@/components/providers';
import { Navbar } from '@/components/navbar';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'WalMarket — AI Memory Marketplace on Sui',
  description:
    'Buy, rent, and sell AI agent memory namespaces as ownable Sui objects. Powered by MemWal, Walrus, and Seal.',
  keywords: ['AI memory', 'Sui', 'Walrus', 'MemWal', 'agent marketplace', 'on-chain', 'zkLogin'],
  openGraph: {
    title: 'WalMarket — AI Memory Marketplace',
    description: 'Trade AI agent memory namespaces on Sui. Buy once, export everywhere.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#10b981',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${jetbrainsMono.variable}`}>
      <body className="antialiased font-sans">
        <Providers>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
