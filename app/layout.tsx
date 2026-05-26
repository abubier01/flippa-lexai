import type { Metadata } from 'next'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { ThemeProvider } from '@/components/theme-provider'
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
  const analyticsEnabled = process.env.NEXT_PUBLIC_ENABLE_VERCEL_ANALYTICS === 'true'

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* eslint-disable-next-line @next/next/next-script-for-ga */}
        <script
          async
          src="https://www.googletagmanager.com/gtag/js?id=G-R4F3T7E37S"
        ></script>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-R4F3T7E37S');
            `,
          }}
        />
      </head>
      <body className="font-sans antialiased bg-background text-foreground relative min-h-screen">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {/* Atmospheric Background Graphics */}
          <div className="bg-orbs">
            <div className="orb orb-1" />
            <div className="orb orb-2" />
          </div>
          
          <div className="relative z-10">
            {children}
          </div>
          <Toaster position="top-right" richColors />
          {analyticsEnabled ? <Analytics /> : null}
        </ThemeProvider>
      </body>
    </html>
  )
}
