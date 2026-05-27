'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'

type Migration = {
  name: string
  label: string
  description: string
}

export default function MigratePage() {
  const [migrations, setMigrations] = useState<Migration[]>([])
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadMigrations() {
      const res = await fetch('/api/admin/migrate', { method: 'GET' })
      const data = await res.json()
      if (!cancelled) {
        setMigrations(Array.isArray(data.migrations) ? data.migrations : [])
      }
    }

    void loadMigrations()
    return () => {
      cancelled = true
    }
  }, [])

  async function run(name: string) {
    setRunning(name)
    setLog((prev) => [...prev, `Running ${name}...`])

    const res = await fetch('/api/admin/migrate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    const data = await res.json()

    if (res.ok) {
      setLog((prev) => [...prev, `[OK] ${name}`])
    } else {
      setLog((prev) => [...prev, `[FAIL] ${name}: ${data.error || 'Unknown error'}`])
    }

    setRunning(null)
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-8">
      <div className="max-w-2xl w-full bg-card border border-border rounded-xl p-8 space-y-6">
        <h1 className="text-xl font-bold text-foreground">Database Migrations</h1>
        <p className="text-sm text-muted-foreground">
          Run SQL migrations from the <code>scripts/</code> source of truth.
        </p>

        <div className="space-y-3">
          {migrations.map((migration) => (
            <div key={migration.name} className="border border-border rounded-lg p-4 space-y-2">
              <div>
                <p className="text-sm font-semibold text-foreground">{migration.label}</p>
                <p className="text-xs text-muted-foreground">{migration.description}</p>
                <p className="text-xs text-muted-foreground mt-1">{migration.name}</p>
              </div>
              <Button
                size="sm"
                onClick={() => run(migration.name)}
                disabled={running !== null}
              >
                {running === migration.name ? 'Running...' : 'Run Migration'}
              </Button>
            </div>
          ))}
        </div>

        {log.length > 0 && (
          <pre className="text-xs bg-muted rounded-lg p-4 overflow-auto max-h-80 text-foreground">
            {log.join('\n')}
          </pre>
        )}
      </div>
    </div>
  )
}
