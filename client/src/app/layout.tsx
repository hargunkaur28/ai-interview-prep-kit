import type { Metadata } from 'next';
import { Inter, Playfair_Display } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const playfair = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-playfair',
  display: 'swap',
  style: ['normal', 'italic'],
});

export const metadata: Metadata = {
  title: 'Trao Prep — AI Interview Prep Kit',
  description: 'Turn any job description and company URL into a structured, editable interview preparation kit.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${playfair.variable}`}>
      <body className="min-h-screen bg-[#090A0F] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200 font-sans">
        {children}
      </body>
    </html>
  );
}
