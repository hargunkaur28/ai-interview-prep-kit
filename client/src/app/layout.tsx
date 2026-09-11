import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-[#090A0F] text-slate-100 antialiased selection:bg-indigo-500/30 selection:text-indigo-200">
        {children}
      </body>
    </html>
  );
}
