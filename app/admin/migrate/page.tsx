'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function MigratePage() {
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function run() {
    setRunning(true)
    setLog(['Running migration...'])
    const res = await fetch('/api/admin/migrate-teams', { method: 'POST' })
    const data = await res.json()
    const lines = data.results.map((r: { label: string; status: string; error?: string }) =>
      `${r.status === 'ok' ? '[OK]' : '[FAIL]'} ${r.label}${r.error ? ': ' + r.error : ''}`
    )
    setLog(lines)
    setDone(data.success)
    setRunning(false)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-xl w-full bg-card border border-border rounded-xl p-8 space-y-6">
        <h1 className="text-xl font-bold text-foreground">Team Tables Migration</h1>
        <p className="text-sm text-muted-foreground">Click the button to create team tables in your Supabase database. This is a one-time setup.</p>
        <Button onClick={run} disabled={running || done} className="w-full">
          {running ? 'Running...' : done ? 'Migration Complete' : 'Run Migration'}
        </Button>
        {log.length > 0 && (
          <pre className="text-xs bg-muted rounded-lg p-4 overflow-auto max-h-80 text-foreground">
            {log.join('\n')}
          </pre>
        )}
        {done && (
          <p className="text-sm font-medium text-primary text-center">
            All tables created successfully. You can close this page.
          </p>
        )}
      </div>
    </div>
  )
}
