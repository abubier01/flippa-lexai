import { NextResponse } from 'next/server'

// Uses pg directly (POSTGRES_URL_NON_POOLING is available at Next.js runtime)
// to run DDL statements needed for the team tables.
export async function POST() {
  const dbUrl = process.env.POSTGRES_URL_NON_POOLING!

  if (!dbUrl) {
    return NextResponse.json({ error: 'POSTGRES_URL_NON_POOLING not set' }, { status: 500 })
  }

  const steps: { name: string; ok: boolean; error?: string }[] = []

  // Use dynamic import of pg so this only loads server-side
  const { default: pg } = await import('pg')
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    steps.push({ name: 'Database connected', ok: true })
  } catch (e) {
    return NextResponse.json({ steps: [{ name: 'Connect', ok: false, error: String(e) }] })
  }

  const ddl: [string, string][] = [
    ['Create teams table', `
      CREATE TABLE IF NOT EXISTS public.teams (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `],
    ['Enable RLS on teams', `ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY`],
    ['Create team_members table', `
      CREATE TABLE IF NOT EXISTS public.team_members (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
        joined_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(team_id, user_id)
      )
    `],
    ['Enable RLS on team_members', `ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY`],
    ['Create team_invites table', `
      CREATE TABLE IF NOT EXISTS public.team_invites (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
        invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
      )
    `],
    ['Enable RLS on team_invites', `ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY`],
    ['Add team_id to contracts', `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`],
    ['Add shared_with_team to contracts', `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE`],
    ['Add team_id to profiles', `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`],
    ['RLS: teams select', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select_member') THEN
          CREATE POLICY teams_select_member ON public.teams FOR SELECT USING (
            auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: teams insert', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_owner') THEN
          CREATE POLICY teams_insert_owner ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
        END IF;
      END $$
    `],
    ['RLS: teams update', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_owner') THEN
          CREATE POLICY teams_update_owner ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
        END IF;
      END $$
    `],
    ['RLS: teams delete', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_delete_owner') THEN
          CREATE POLICY teams_delete_owner ON public.teams FOR DELETE USING (auth.uid() = owner_id);
        END IF;
      END $$
    `],
    ['RLS: team_members select', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
          CREATE POLICY team_members_select ON public.team_members FOR SELECT USING (
            user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members tm2 WHERE tm2.team_id = team_members.team_id AND tm2.user_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: team_members insert', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert') THEN
          CREATE POLICY team_members_insert ON public.team_members FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid()
          );
        END IF;
      END $$
    `],
    ['RLS: team_members delete', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete') THEN
          CREATE POLICY team_members_delete ON public.team_members FOR DELETE USING (
            user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: team_invites select', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_select') THEN
          CREATE POLICY invites_select ON public.team_invites FOR SELECT USING (
            invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: team_invites insert', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_insert') THEN
          CREATE POLICY invites_insert ON public.team_invites FOR INSERT WITH CHECK (
            EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: team_invites update', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_update') THEN
          CREATE POLICY invites_update ON public.team_invites FOR UPDATE USING (
            invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
          );
        END IF;
      END $$
    `],
    ['RLS: contracts team select', `
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_select_team') THEN
          CREATE POLICY contracts_select_team ON public.contracts FOR SELECT USING (
            shared_with_team = TRUE AND EXISTS (
              SELECT 1 FROM public.team_members WHERE team_id = contracts.team_id AND user_id = auth.uid()
            )
          );
        END IF;
      END $$
    `],
  ]

  for (const [name, sql] of ddl) {
    try {
      await client.query(sql)
      steps.push({ name, ok: true })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      steps.push({ name, ok: false, error: msg })
    }
  }

  await client.end()
  return NextResponse.json({ steps })
}
