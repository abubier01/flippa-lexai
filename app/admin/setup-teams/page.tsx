'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

export default function SetupTeamsPage() {
  const [log, setLog] = useState<string[]>([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)

  async function runMigration() {
    setRunning(true)
    setLog([])

    const res = await fetch('/api/admin/setup-teams-v2', { method: 'POST' })
    const data = await res.json()

    if (data.steps) {
      setLog(data.steps.map((s: { name: string; ok: boolean; error?: string }) =>
        `${s.ok ? '✓' : '✗'} ${s.name}${s.error ? ': ' + s.error : ''}`
      ))
    } else {
      setLog([JSON.stringify(data)])
    }
    setDone(true)
    setRunning(false)
  }

  return (
    <div className="max-w-2xl mx-auto mt-16 p-8 space-y-6 font-mono">
      <h1 className="text-2xl font-bold">Team Tables Setup</h1>
      <p className="text-sm text-muted-foreground">
        Run this once to create the teams, team_members, and team_invites tables and add team_id columns.
      </p>
      <Button onClick={runMigration} disabled={running || done}>
        {running ? 'Running...' : done ? 'Done' : 'Run Migration'}
      </Button>
      {log.length > 0 && (
        <pre className="bg-muted rounded-lg p-4 text-xs overflow-auto max-h-[500px] leading-6">
          {log.join('\n')}
        </pre>
      )}
      {done && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 text-sm text-green-700">
          Migration complete. Now navigate to <a href="/team" className="underline">/team</a> to verify.
        </div>
      )}
    </div>
  )
}
