'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Building2, Users, CheckCircle, AlertCircle } from 'lucide-react'

interface Invite {
  id: string
  email: string
  status: string
  expires_at: string
  teams: { name: string } | null
}

interface Props {
  invite: Invite | null
  token: string
  userEmail: string
}

export default function JoinTeamClient({ invite, token, userEmail }: Props) {
  const router = useRouter()
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function joinTeam() {
    setJoining(true)
    setError(null)
    const res = await fetch('/api/team/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    const data = await res.json()
    setJoining(false)
    if (!res.ok) { setError(data.error); return }
    setSuccess(true)
    setTimeout(() => router.push('/team'), 2000)
  }

  if (!invite || invite.status !== 'pending') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-4">
          <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto">
            <AlertCircle className="w-7 h-7 text-destructive" />
          </div>
          <h2 className="text-xl font-bold text-foreground">Invite not found</h2>
          <p className="text-sm text-muted-foreground">
            This invite link is invalid, has already been used, or has expired.
          </p>
          <Button onClick={() => router.push('/dashboard')} variant="outline" className="w-full">
            Go to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  const isExpired = new Date(invite.expires_at) < new Date()

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-card border border-border rounded-2xl p-8 text-center space-y-6">
        {success ? (
          <>
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7 text-primary" />
            </div>
            <h2 className="text-xl font-bold text-foreground">You&apos;re in!</h2>
            <p className="text-sm text-muted-foreground">
              Welcome to <span className="font-semibold text-foreground">{invite.teams?.name}</span>. Redirecting to your team workspace...
            </p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto">
              <Building2 className="w-7 h-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">Join {invite.teams?.name}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                You&apos;ve been invited to join this team on ContractIQ.
              </p>
            </div>

            <div className="bg-muted/60 rounded-xl p-4 text-sm text-left space-y-2">
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Team</span>
                <span className="font-medium text-foreground">{invite.teams?.name}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Invited to</span>
                <span className="font-medium text-foreground">{invite.email}</span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Your account</span>
                <span className="font-medium text-foreground">{userEmail}</span>
              </div>
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-lg">{error}</p>
            )}

            {isExpired ? (
              <p className="text-sm text-destructive">This invite has expired. Ask your team owner to resend it.</p>
            ) : invite.email.toLowerCase() !== userEmail.toLowerCase() ? (
              <p className="text-sm text-destructive">
                This invite was sent to {invite.email}. Please sign in with that account.
              </p>
            ) : (
              <Button onClick={joinTeam} disabled={joining} className="w-full">
                <Users className="w-4 h-4 mr-2" />
                {joining ? 'Joining...' : 'Accept Invite & Join Team'}
              </Button>
            )}

            <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard')} className="w-full text-muted-foreground">
              Maybe later
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
