import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

async function run(sql, label) {
  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.error(`[FAIL] ${label}:`, error.message)
  } else {
    console.log(`[OK] ${label}`)
  }
}

// Teams table
await run(`CREATE TABLE IF NOT EXISTS public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
)`, 'Create teams table')

await run(`ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY`, 'RLS teams')

// Team members table
await run(`CREATE TABLE IF NOT EXISTS public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
)`, 'Create team_members table')

await run(`ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY`, 'RLS team_members')

// Team invites table
await run(`CREATE TABLE IF NOT EXISTS public.team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
)`, 'Create team_invites table')

await run(`ALTER TABLE public.team_invites ENABLE ROW LEVEL SECURITY`, 'RLS team_invites')

// Policies via DO blocks
await run(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_select_member') THEN
    CREATE POLICY "teams_select_member" ON public.teams FOR SELECT USING (
      auth.uid() = owner_id OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = teams.id AND user_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_insert_owner') THEN
    CREATE POLICY "teams_insert_owner" ON public.teams FOR INSERT WITH CHECK (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_update_owner') THEN
    CREATE POLICY "teams_update_owner" ON public.teams FOR UPDATE USING (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='teams' AND policyname='teams_delete_owner') THEN
    CREATE POLICY "teams_delete_owner" ON public.teams FOR DELETE USING (auth.uid() = owner_id);
  END IF;
END $$`, 'Teams RLS policies')

await run(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_select') THEN
    CREATE POLICY "team_members_select" ON public.team_members FOR SELECT USING (
      user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members tm2 WHERE tm2.team_id = team_members.team_id AND tm2.user_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_insert_owner') THEN
    CREATE POLICY "team_members_insert_owner" ON public.team_members FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid()) OR user_id = auth.uid()
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_members' AND policyname='team_members_delete') THEN
    CREATE POLICY "team_members_delete" ON public.team_members FOR DELETE USING (
      user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    );
  END IF;
END $$`, 'team_members RLS policies')

await run(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_select_team_member') THEN
    CREATE POLICY "invites_select_team_member" ON public.team_invites FOR SELECT USING (
      invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_insert_member') THEN
    CREATE POLICY "invites_insert_member" ON public.team_invites FOR INSERT WITH CHECK (
      EXISTS (SELECT 1 FROM public.team_members WHERE team_id = team_invites.team_id AND user_id = auth.uid())
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='team_invites' AND policyname='invites_update') THEN
    CREATE POLICY "invites_update" ON public.team_invites FOR UPDATE USING (
      invited_by = auth.uid() OR EXISTS (SELECT 1 FROM public.teams WHERE id = team_id AND owner_id = auth.uid())
    );
  END IF;
END $$`, 'team_invites RLS policies')

// Extend contracts
await run(`ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`, 'Add team_id to contracts')
await run(`ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS shared_with_team BOOLEAN DEFAULT FALSE`, 'Add shared_with_team to contracts')

await run(`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_select_team') THEN
    CREATE POLICY "contracts_select_team" ON public.contracts FOR SELECT USING (
      shared_with_team = TRUE AND EXISTS (
        SELECT 1 FROM public.team_members WHERE team_id = contracts.team_id AND user_id = auth.uid()
      )
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='contracts' AND policyname='contracts_update_share') THEN
    CREATE POLICY "contracts_update_share" ON public.contracts FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$`, 'Contracts team RLS policies')

// Extend profiles
await run(`ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL`, 'Add team_id to profiles')

console.log('\nMigration complete!')
