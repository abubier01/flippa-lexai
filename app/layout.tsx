import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: 'LexAI — AI Contract Intelligence',
  description: 'Analyze, review, and understand your legal contracts instantly with AI-powered intelligence. Identify risks, extract key clauses, and get plain-English summaries.',
  keywords: ['contract analysis', 'AI legal', 'contract review', 'legal tech', 'document analysis'],
  icons: {
    icon: '/logo.png',
  }
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background text-foreground">
        {children}
        <Toaster position="top-right" richColors />
        <Analytics />
      </body>
    </html>
  )
}
