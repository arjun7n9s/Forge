import type { Metadata } from 'next';
import { ForgeProvider } from '@/components/ForgeProvider';
import './globals.css';
import './persistence.css';
import './origin-trial.css';

export const metadata: Metadata = { title: 'FORGE — Citation Integrity', description: 'Prevent compromised citations from entering or surviving in private notes.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><ForgeProvider>{children}</ForgeProvider></body></html>; }
