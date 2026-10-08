import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Langee Lounge | Live Football Breaks',
  description: 'Watch Langee live, hang out in break chat, and follow football card breaks and biggest hits.',
};

export default function RootLayout({children}: Readonly<{children: React.ReactNode}>) {
  return <html lang="en"><body>{children}</body></html>;
}
