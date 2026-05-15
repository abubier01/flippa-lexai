import DemoSidebar from '@/components/demo/demo-sidebar'
import DemoBanner from '@/components/demo/demo-banner'
import DemoHeader from '@/components/demo/demo-header'

export const metadata = {
  title: 'Demo — LexAI',
  description: 'Try LexAI with sample contracts — no sign-up required.',
}

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      <DemoBanner />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <DemoSidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <DemoHeader />
          <main className="flex-1 overflow-y-auto bg-secondary/20 p-4 md:p-6 lg:p-8 pb-20 md:pb-8">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
