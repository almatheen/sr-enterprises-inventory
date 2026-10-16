import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Providers } from '@/components/ui/Providers';
import { Splash } from '@/components/ui/Splash';

export const metadata: Metadata = { title: 'SR Enterprises – Inventory & Billing' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Applies the saved theme before first paint (no flash).
const themeScript = `try{var t=localStorage.srt;if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;800&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>
          <Splash />
          {children}
        </Providers>
      </body>
    </html>
  );
}
