import type { Metadata } from 'next';
import { Inter_Tight, Geist_Mono } from 'next/font/google';
import { TooltipProvider } from '@/components/ui/tooltip';
import './globals.css';

/**
 * Two faces, each doing a job.
 *
 * Inter Tight for UI and headings: a tight grotesque that stays legible at the
 * small sizes a dense ledger needs, without the geometric evenness that makes
 * the Geist default read as a template.
 *
 * Geist Mono is NOT decorative here. Catalog numbers, matrix runouts and
 * Discogs ids are strings where a single character matters — `ABC-1-A1` versus
 * `ABC-l-A1` — so they are set in mono throughout, and `tabular-nums` keeps
 * counts and years aligned down a column.
 */
const sans = Inter_Tight({
  variable: '--font-sans',
  subsets: ['latin'],
  display: 'swap',
});

const mono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Record Collection',
  description: 'A catalogue of records owned and wanted.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
