'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
  Users, UserPlus, Copy, Trash2, FileText, AlertTriangle,
  CheckCircle, BarChart2, Building2, Link2, Shield, Crown
} from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import RiskBadge from '@/components/contracts/risk-badge'

interface Member {
  id: string
  user_id: string
  role: 'owner' | 'admin' | 'member'
  joined_at: string
  profiles: { id: string; full_name: string | null; plan: string }
}

interface Invite {
  id: string
  email: string
  token: string
  created_at: string
  expires_at: string
  status: string
}

interface SharedContract {
  id: string
  title: string
  status: string
  risk_score: number
  created_at: string
  user_id: string
  contract_analyses: { risks: { severity: string }[]; summary?: string }[]
}

interface Analytics {
  totalContracts: number
  avgRisk: number
  highRisks: number
  mediumRisks: number
  lowRisks: number
  memberCount: number
}

interface Props {
  currentUserId: string
  profile: { plan: string; team_id: string | null; full_name: string | null } | null
  team: { id: string; name: string; owner_id: string; created_at: string } | null
  members: Member[]
  invites: Invite[]
  sharedContracts: SharedContract[]
  teamAnalytics: Analytics | null
}

export default function TeamDashboard({
  currentUserId, profile, team: initialTeam, members: initialMembers, invites, sharedContracts, teamAnalytics,
}: Props) {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'library'>('overview')
  const [teamName, setTeamName] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [creatingTeam, setCreatingTeam] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [pendingInvites, setPendingInvites] = useState(invites)
  const [lastInviteLink, setLastInviteLink] = useState<{ email: string; link: string } | null>(null)
  const [team, setTeam] = useState(initialTeam)
  const [members, setMembers] = useState(initialMembers)

  const isOwner = team ? members.find(m => m.user_id === currentUserId)?.role === 'owner' : false

  // Effective risk score from analyses
  const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
  function effectiveScore(c: SharedContract) {
    const analyses = c.contract_analyses || []
    for (const a of analyses) {
      const risks = a.risks || []
      if (risks.length > 0) {
        return Math.min(100, Math.round(risks.reduce((s, r) => s + (weights[r.severity] ?? 20), 0) / risks.length))
      }
    }
    return c.risk_score ?? 0
  }

  async function createTeam() {
    if (!teamName.trim()) return
    setCreatingTeam(true)
    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: teamName }),
    })
    const data = await res.json()
    setCreatingTeam(false)
    if (!res.ok) { toast.error(data.error); return }
    // Immediately render the dashboard with the new team — no round-trip needed
    setTeam(data.team)
    setMembers(data.members ?? [])
    setActiveTab('overview')
    toast.success(`Team "${data.team.name}" created!`)
    router.refresh() // Revalidate server cache in background
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true)
    setLastInviteLink(null)
    const res = await fetch('/api/team/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    })
    const data = await res.json()
    setInviting(false)
    if (!res.ok) { toast.error(data.error); return }
    const link = `${window.location.origin}/team/join?token=${data.invite.token}`
    setPendingInvites(prev => [...prev, data.invite])
    setLastInviteLink({ email: inviteEmail, link })
    setInviteEmail('')
  }

  function copyLastLink() {
    if (!lastInviteLink) return
    navigator.clipboard.writeText(lastInviteLink.link)
    toast.success('Invite link copied!')
  }

  async function removeMember(userId: string) {
    const res = await fetch(`/api/team/members/${userId}`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    toast.success('Member removed.')
    router.refresh()
  }

  function copyInviteLink(token: string) {
    const url = `${window.location.origin}/team/join?token=${token}`
    navigator.clipboard.writeText(url)
    toast.success('Invite link copied to clipboard!')
  }

  // No team yet — show create form
  if (!team) {
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto">
            <Building2 className="w-7 h-7 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground">Create your team</h2>
          <p className="text-muted-foreground text-sm">
            Set up your team workspace to invite members and share contracts.
          </p>
        </div>
        <div className="bg-card rounded-xl border border-border p-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Team name</label>
            <Input
              placeholder="Acme Legal Team"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createTeam()}
            />
          </div>
          <Button onClick={createTeam} disabled={creatingTeam || !teamName.trim()} className="w-full">
            <Building2 className="w-4 h-4 mr-2" />
            {creatingTeam ? 'Creating...' : 'Create Team'}
          </Button>
        </div>
      </div>
    )
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: BarChart2 },
    { id: 'members', label: `Members (${members.length})`, icon: Users },
    { id: 'library', label: `Shared Library (${sharedContracts.length})`, icon: FileText },
  ] as const

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{team.name}</h2>
            <p className="text-xs text-muted-foreground">
              Created {formatDistanceToNow(new Date(team.created_at), { addSuffix: true })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
            <Shield className="w-3 h-3" />
            Team Plan
          </span>
          <span className="text-xs text-muted-foreground">{members.length}/10 members</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === t.id
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && teamAnalytics && (
        <div className="space-y-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { label: 'Members', value: teamAnalytics.memberCount, icon: Users, color: 'text-primary' },
              { label: 'Shared Contracts', value: teamAnalytics.totalContracts, icon: FileText, color: 'text-primary' },
              { label: 'Avg Risk Score', value: teamAnalytics.avgRisk, icon: BarChart2, color: 'text-primary' },
              { label: 'High Risks', value: teamAnalytics.highRisks, icon: AlertTriangle, color: 'text-destructive' },
              { label: 'Medium Risks', value: teamAnalytics.mediumRisks, icon: AlertTriangle, color: 'text-yellow-600' },
              { label: 'Low Risks', value: teamAnalytics.lowRisks, icon: CheckCircle, color: 'text-emerald-600' },
            ].map(s => (
              <div key={s.label} className="bg-card rounded-xl border border-border p-4 flex flex-col gap-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <p className="text-2xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground leading-snug">{s.label}</p>
              </div>
            ))}
          </div>

          {/* Recent shared contracts */}
          {sharedContracts.length > 0 ? (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border flex items-center justify-between">
                <p className="font-semibold text-sm text-foreground">Recent Shared Contracts</p>
                <button onClick={() => setActiveTab('library')} className="text-xs text-primary hover:underline">
                  View all
                </button>
              </div>
              <div className="divide-y divide-border">
                {sharedContracts.slice(0, 5).map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-3 gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}</p>
                      </div>
                    </div>
                    <RiskBadge score={effectiveScore(c)} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-card rounded-xl border border-border p-10 text-center">
              <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-medium text-foreground">No shared contracts yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Share contracts from their detail page to make them visible to the whole team.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Members tab */}
      {activeTab === 'members' && (
        <div className="space-y-4">
          {/* Invite section */}
          {isOwner && (
            <div className="bg-card rounded-xl border border-border p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  Invite a member by email
                </p>
                <span className="text-xs text-muted-foreground">{10 - members.length} seat{10 - members.length !== 1 ? 's' : ''} remaining</span>
              </div>

              {members.length >= 10 ? (
                <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
                  Your team is full (10/10 members). Remove a member to invite someone new.
                </p>
              ) : (
                <div className="flex gap-2">
                  <Input
                    placeholder="colleague@company.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    type="email"
                    className="flex-1"
                  />
                  <Button onClick={sendInvite} disabled={inviting || !inviteEmail.trim()} className="shrink-0">
                    {inviting ? 'Sending...' : 'Send Invite'}
                  </Button>
                </div>
              )}

              {/* Inline link banner shown immediately after invite is created */}
              {lastInviteLink && (
                <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 space-y-2">
                  <p className="text-xs font-medium text-foreground">
                    Invite created for <span className="text-primary">{lastInviteLink.email}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Share this link with them — they must be signed in with the same email to accept.
                  </p>
                  <div className="flex items-center gap-2 mt-2">
                    <code className="flex-1 text-xs bg-background border border-border rounded px-2 py-1.5 truncate text-muted-foreground">
                      {lastInviteLink.link}
                    </code>
                    <Button size="sm" variant="outline" onClick={copyLastLink} className="shrink-0 gap-1.5 text-xs">
                      <Copy className="w-3 h-3" />
                      Copy
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Members list */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border">
              <p className="font-semibold text-sm text-foreground">Members</p>
            </div>
            <div className="divide-y divide-border">
              {members.map(m => (
                <div key={m.id} className="flex items-center justify-between px-5 py-3 gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold shrink-0">
                      {(m.profiles?.full_name || 'U')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{m.profiles?.full_name || 'Team Member'}</p>
                      <p className="text-xs text-muted-foreground">
                        Joined {formatDistanceToNow(new Date(m.joined_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border ${
                      m.role === 'owner'
                        ? 'bg-primary/10 text-primary border-primary/20'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}>
                      {m.role === 'owner' && <Crown className="w-2.5 h-2.5" />}
                      {m.role}
                    </span>
                    {isOwner && m.user_id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => removeMember(m.user_id)}
                        aria-label={`Remove ${m.profiles?.full_name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Pending invites */}
          {pendingInvites.length > 0 && (
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-5 py-3.5 border-b border-border">
                <p className="font-semibold text-sm text-foreground">Pending Invites</p>
              </div>
              <div className="divide-y divide-border">
                {pendingInvites.map(inv => (
                  <div key={inv.id} className="flex items-center justify-between px-5 py-3 gap-4">
                    <div>
                      <p className="text-sm font-medium text-foreground">{inv.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Expires {formatDistanceToNow(new Date(inv.expires_at), { addSuffix: true })}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs gap-1.5"
                      onClick={() => copyInviteLink(inv.token)}
                    >
                      <Copy className="w-3 h-3" />
                      Copy Link
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shared Library tab */}
      {activeTab === 'library' && (
        <div className="space-y-4">
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-5 py-3.5 border-b border-border flex items-center gap-2">
              <Link2 className="w-4 h-4 text-primary" />
              <p className="font-semibold text-sm text-foreground">Shared Contract Library</p>
              <span className="ml-auto text-xs text-muted-foreground">{sharedContracts.length} contract{sharedContracts.length !== 1 ? 's' : ''}</span>
            </div>
            {sharedContracts.length === 0 ? (
              <div className="p-10 text-center">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground">No shared contracts yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                  Open any contract you own, go to the Summary tab, and toggle &quot;Share with team&quot; to add it here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {sharedContracts.map(c => (
                  <div key={c.id} className="flex items-center justify-between px-5 py-4 gap-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{c.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {c.contract_analyses?.[0]?.summary
                            ? c.contract_analyses[0].summary.slice(0, 80) + '...'
                            : formatDistanceToNow(new Date(c.created_at), { addSuffix: true })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <RiskBadge score={effectiveScore(c)} />
                      <Button variant="outline" size="sm" asChild className="h-7 text-xs">
                        <a href={`/contracts/${c.id}`}>View</a>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
