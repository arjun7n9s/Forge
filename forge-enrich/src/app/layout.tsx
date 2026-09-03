import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'FORGE Enrichment',
  description: 'Cross-origin citation integrity provider for FORGE',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
