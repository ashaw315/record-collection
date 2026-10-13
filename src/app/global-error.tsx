'use client';

import { Inter_Tight, Geist_Mono } from 'next/font/google';
import { ErrorBody } from './ErrorBody';
import { SCREEN_FRAME } from './screen-frame';
import './globals.css';

/**
 * The bare fallback (step 142, Design, 12 Oct): "If the header itself is
 * what failed, the bare fallback draws the same heading, sentence and
 * controls on paper with no header."
 *
 * This replaces the root layout when the layout or anything it draws has
 * failed, so it brings its own document, the stylesheet and the two faces,
 * declared as `layout.tsx` declares them. It draws nothing of the app's
 * that could be the thing that failed: no header, no provider.
 */
const sans = Inter_Tight({ variable: '--font-sans', subsets: ['latin'], display: 'swap' });
const mono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'], display: 'swap' });

export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <main data-screen-frame="" data-global-error="" className={`${SCREEN_FRAME} py-6`}>
          <ErrorBody retry={retry} />
        </main>
      </body>
    </html>
  );
}
