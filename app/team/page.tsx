import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import TeamDashboard from '@/components/team/team-dashboard'

export default async function TeamPage() {
  // Use user auth client only for getUser() — all DB reads use service role to bypass RLS
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: profile } = await service
    .from('profiles')
    .select('plan, team_id, full_name')
    .eq('id', user.id)
    .single()

  // Show upgrade prompt in-page instead of redirecting — avoids redirect loops
  if (!profile || profile?.plan !== 'team') {
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

  let team = null
  let members: unknown[] = []
  let invites: unknown[] = []
  let sharedContracts: unknown[] = []
  let teamAnalytics = null

  if (profile?.team_id) {
    const [teamRes, membersRes, invitesRes, contractsRes] = await Promise.all([
      service.from('teams').select('*').eq('id', profile.team_id).single(),
      service.from('team_members').select('*').eq('team_id', profile.team_id),
      service.from('team_invites').select('*').eq('team_id', profile.team_id).eq('status', 'pending'),
      service.from('contracts')
        .select('*, contract_analyses(risks, summary)')
        .eq('team_id', profile.team_id)
        .eq('shared_with_team', true)
        .order('created_at', { ascending: false }),
    ])

    const rawMembers: { user_id: string; id: string; role: string; joined_at: string }[] = membersRes.data || []

    // Fetch member profiles separately — avoids the FK join 400 error
    const userIds = rawMembers.map(m => m.user_id).filter(Boolean)
    const { data: profileRows } = userIds.length > 0
      ? await service.from('profiles').select('id, full_name, plan').in('id', userIds)
      : { data: [] as { id: string; full_name: string | null; plan: string }[] }

    const profileMap = Object.fromEntries((profileRows || []).map(p => [p.id, p]))

    team = teamRes.data
    members = rawMembers.map(m => ({
      ...m,
      profiles: profileMap[m.user_id] ?? { id: m.user_id, full_name: null, plan: 'free' },
    }))
    invites = invitesRes.data || []
    sharedContracts = contractsRes.data || []

    // Compute team analytics
    const analyses = sharedContracts.flatMap((c: any) => c.contract_analyses || [])
    const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
    let totalRisk = 0, riskCount = 0
    let high = 0, medium = 0, low = 0

    for (const a of analyses) {
      const risks = (a.risks as { severity: string }[]) || []
      for (const r of risks) {
        if (r.severity === 'high') high++
        else if (r.severity === 'medium') medium++
        else low++
      }
      if (risks.length > 0) {
        const score = Math.min(100, Math.round(risks.reduce((s, r) => s + (weights[r.severity] ?? 20), 0) / risks.length))
        totalRisk += score
        riskCount++
      }
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
      members={members as any}
      invites={invites as any}
      sharedContracts={sharedContracts as any}
      teamAnalytics={teamAnalytics}
    />
  )
}
