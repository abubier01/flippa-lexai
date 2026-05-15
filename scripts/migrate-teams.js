// Required for Supabase's self-signed cert chain in this environment
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const { Client } = require('pg')

async function main() {
  const connStr = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL
  if (!connStr) {
    const available = Object.keys(process.env).filter(k => /POSTGRES|SUPA|DATABASE/.test(k))
    console.error('No DB connection string found. Available env keys:', available.join(', '))
    process.exit(1)
  }
  console.log('Connecting...')

  const client = new Client({ connectionString: connStr, ssl: { rejectUnauthorized: false } })
  await client.connect()
  console.log('Connected!')

  const steps = [
    // 1. Add team_id to profiles (the missing column causing the error)
    `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID`,

    // 2. Create teams table
    `CREATE TABLE IF NOT EXISTS public.teams (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`,

    // 3. Add FK now that both tables exist
    `ALTER TABLE public.profiles
      DROP CONSTRAINT IF EXISTS profiles_team_id_fkey`,
    `ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_team_id_fkey
      FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL`,

    // 4. Create team_members table
    `CREATE TABLE IF NOT EXISTS public.team_members (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member')),
      joined_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(team_id, user_id)
    )`,

    // 5. Create team_invites table
    `CREATE TABLE IF NOT EXISTS public.team_invites (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
      invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','expired')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
    )`,

    // 6. Add team_id + shared flag to contracts
    `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID`,
    `ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE`,

    // 7. Enable RLS on team tables
    `ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY`,

    // 8. RLS policies - teams
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select_member') THEN
        CREATE POLICY teams_select_member ON public.teams FOR SELECT USING (
          auth.uid() = owner_id OR
          EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_owner') THEN
        CREATE POLICY teams_insert_owner ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_owner') THEN
        CREATE POLICY teams_update_owner ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_delete_owner') THEN
        CREATE POLICY teams_delete_owner ON public.teams FOR DELETE USING (auth.uid() = owner_id);
      END IF;
    END $$`,

    // 9. RLS policies - team_members
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
        CREATE POLICY team_members_select ON public.team_members FOR SELECT USING (
          user_id = auth.uid() OR
          EXISTS (SELECT 1 FROM public.team_members tm2 WHERE tm2.team_id = team_members.team_id AND tm2.user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert') THEN
        CREATE POLICY team_members_insert ON public.team_members FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid()
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete') THEN
        CREATE POLICY team_members_delete ON public.team_members FOR DELETE USING (
          user_id = auth.uid() OR
          EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
        );
      END IF;
    END $$`,

    // 10. RLS policies - team_invites
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_select') THEN
        CREATE POLICY invites_select ON public.team_invites FOR SELECT USING (
          invited_by = auth.uid() OR
          EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_insert') THEN
        CREATE POLICY invites_insert ON public.team_invites FOR INSERT WITH CHECK (
          EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
        );
      END IF;
    END $$`,
    `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_update') THEN
        CREATE POLICY invites_update ON public.team_invites FOR UPDATE USING (
          invited_by = auth.uid() OR
          EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
        );
      END IF;
    END $$`,
  ]

  for (let i = 0; i < steps.length; i++) {
    try {
      await client.query(steps[i])
      console.log(`Step ${i + 1}/${steps.length} OK`)
    } catch (err) {
      console.error(`Step ${i + 1} FAILED:`, err.message)
    }
  }

  console.log('Migration complete!')
  await client.end()
}

main().catch(err => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
