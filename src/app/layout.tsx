import type { Metadata } from 'next';
import { Inter_Tight } from 'next/font/google';
import localFont from 'next/font/local';
import { TooltipProvider } from '@/components/ui/tooltip';
import { probesOpen } from '@/lib/probes';
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

/*
  §63 (step 167): "The arrow is the app's type, not the machine's: → is drawn
  in Geist Mono, from the family's own file, wherever the app sets it."
  Google's latin slice held ↑ and ↓ and not →, and no other slice held it, so
  every "Manage →" set its arrow in the machine's fallback at the fallback's
  width. The family's own file, cut once by scripts/cut-geist-mono.sh to
  Google's Latin range plus U+2190 to 2199 with Google's own feature list:
  22,520 bytes against the slice's 23,108, the arrows 556 of it. One file
  carrying the weight axis, as the slice did.
*/
const mono = localFont({
  src: './fonts/GeistMono-latin-arrows.woff2',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Record Collection',
  description: 'A catalogue of records owned and wanted.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  /*
    `data-e2e-probes` is written only while the probe pages are open (src/lib/probes.ts: a test
    harness, never a deploy), so `error.tsx`, a client component, can read the gate from the document
    instead of from `process.env.NODE_ENV`, which a build inlines into its bundle (Q39, 5 Nov). Absent
    on production: checked by curl after the deploy, the bytes in NOTES.
  */
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`} data-e2e-probes={probesOpen() ? '1' : undefined}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
