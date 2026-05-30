import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import TeamDashboard from '@/components/team/team-dashboard'
import type { Member, Invite, SharedContract, Analytics, Team } from '@/components/team/types'
import { hasTeamAccess } from '@/lib/plan/access'
import { getServiceClient } from '@/lib/supabase/service-role'
import { listTeamContractsWithRuns } from '@/lib/contracts/read'

export default async function TeamPage() {
  // Use user auth client only for getUser() — all DB reads use service role to bypass RLS
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const service = getServiceClient()

  // Parallelize: profile (display + fallback team_id) is independent of
  // hasTeamAccess (subscriptions + team_members reads). Previously sequential.
  const [profileRes, access] = await Promise.all([
    service
      .from('profiles')
      .select('plan, team_id, full_name')
      .eq('id', user.id)
      .single(),
    // Check team access via subscription + membership (team members have plan='solo'
    // but should still see the team page when the team owner has an active team plan).
    hasTeamAccess(user.id),
  ])
  const profile = profileRes.data
  if (!access.ok) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mb-6">
          <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
          </svg>
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2">Team workspace</h2>
        <p className="text-muted-foreground text-sm max-w-sm mb-8">
          The Team plan gives you a shared contract library, member management, team analytics, and up to 10 members. Upgrade to unlock it.
        </p>
        <Button asChild size="lg">
          <Link href="/upgrade?plan=team">Upgrade to Team</Link>
        </Button>
      </div>
    )
  }

  // Use access.teamId (resolved from subscription or membership) as the team lookup key.
  const effectiveTeamId = access.teamId ?? profile?.team_id

  let team: Team | null = null
  let members: Member[] = []
  let invites: Invite[] = []
  let sharedContracts: SharedContract[] = []
  let teamAnalytics: Analytics | null = null

  if (effectiveTeamId) {
    const [teamRes, membersRes, invitesRes, contractsList] = await Promise.all([
      service.from('teams').select('*').eq('id', effectiveTeamId).returns<Team[]>().single(),
      service.from('team_members').select('*').eq('team_id', effectiveTeamId),
      service.from('team_invites').select('*').eq('team_id', effectiveTeamId).eq('status', 'pending').returns<Invite[]>(),
      // Bulk read: contracts joined with analysis_runs via current_run_id in
      // one round-trip. Replaces the legacy contract_analyses fetch. See
      // lib/contracts/read.ts::listTeamContractsWithRuns.
      listTeamContractsWithRuns(effectiveTeamId, service),
    ])

    const rawMembers = (membersRes.data ?? []) as Array<{
      user_id: string
      id: string
      role: 'owner' | 'admin' | 'member'
      joined_at: string
    }>

    // Fetch member profiles separately — avoids the FK join 400 error
    const userIds = rawMembers.map(m => m.user_id).filter(Boolean)
    const { data: profileRows } = userIds.length > 0
      ? await service.from('profiles').select('id, full_name, plan').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null; plan: string }[] }

    const profileMap = Object.fromEntries((profileRows ?? []).map(p => [p.id, p]))

    team = teamRes.data ?? null
    members = rawMembers.map(m => ({
      ...m,
      profiles: profileMap[m.user_id] ?? { id: m.user_id, full_name: null, plan: 'solo' },
    }))
    invites = invitesRes.data ?? []
    sharedContracts = contractsList

    // Compute team analytics from analysis_runs.output. The structured output
    // carries a per-run integer risk_score (0-100) computed at analysis time
    // by the prompt compiler — no need to recompute from risks[].
    let totalRisk = 0, riskCount = 0
    let high = 0, medium = 0, low = 0

    for (const c of sharedContracts) {
      const output = c.run?.output
      if (!output) continue
      for (const r of output.risks) {
        // The new schema includes a 'critical' severity; bucket it with high
        // for the dashboard's 3-tier summary.
        if (r.severity === 'high' || r.severity === 'critical') high++
        else if (r.severity === 'medium') medium++
        else low++
      }
      totalRisk += output.risk_score
      riskCount++
    }

    teamAnalytics = {
      totalContracts: sharedContracts.length,
      avgRisk: riskCount > 0 ? Math.round(totalRisk / riskCount) : 0,
      highRisks: high,
      mediumRisks: medium,
      lowRisks: low,
      memberCount: members.length,
    }
  }

  return (
    <TeamDashboard
      currentUserId={user.id}
      profile={profile}
      team={team}
      members={members}
      invites={invites}
      sharedContracts={sharedContracts}
      teamAnalytics={teamAnalytics}
    />
  )
}
