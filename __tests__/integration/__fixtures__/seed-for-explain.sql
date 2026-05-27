-- Seed fixture for P0-2 EXPLAIN evidence.
-- Run with:
--   psql $DB_URL -f __tests__/integration/__fixtures__/seed-for-explain.sql
--
-- Idempotent: deletes any prior seed rows for explain-seed%@example.test
-- before re-inserting, so it can be re-run as fixture sizes are tuned.
--
-- Strategy: create one "seed" user/team with a small slice of rows, plus
-- many "noise" users/teams that own the bulk of the rows. This makes the
-- seed user's selector predicates highly selective, so the Postgres planner
-- chooses the FK/RLS indexes instead of falling back to a Seq Scan.

DO $$
DECLARE
  uid uuid;
  cid uuid;
  tid uuid;
  noise_uid uuid;
  noise_tid uuid;
  noise_cid uuid;
  i int;
  j int;
BEGIN
  -- Clean prior seed (cascade clears contracts/analyses/messages/team_members)
  DELETE FROM auth.users WHERE email LIKE 'explain-seed%@example.test';

  uid := gen_random_uuid();

  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, aud, role)
    VALUES (uid, 'explain-seed@example.test', '', now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  INSERT INTO public.profiles (id, plan, contracts_this_month)
    VALUES (uid, 'solo', 0)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.teams (name, owner_id) VALUES ('seed-team', uid) RETURNING id INTO tid;

  -- Seed user owns 50 contracts on seed-team.
  FOR i IN 1..50 LOOP
    INSERT INTO public.contracts (user_id, team_id, status, raw_text, title, file_name)
      VALUES (uid, tid, 'completed', 'seed', 'seed contract', 'seed.txt') RETURNING id INTO cid;
    INSERT INTO public.contract_analyses (contract_id, user_id, summary)
      VALUES (cid, uid, 'seed summary');
    INSERT INTO public.chat_messages (contract_id, user_id, role, content)
      VALUES (cid, uid, 'user', 'q'), (cid, uid, 'assistant', 'a');
  END LOOP;

  -- Seed team has 10 members + 10 invites (selective slice within team tables).
  FOR i IN 1..10 LOOP
    DECLARE
      member_uid uuid := gen_random_uuid();
    BEGIN
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, aud, role)
        VALUES (member_uid, 'explain-seed-tm' || i || '@example.test', '', now(),
                '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.team_members (team_id, user_id, role)
        VALUES (tid, member_uid, 'member');
    END;
    INSERT INTO public.team_invites (team_id, invited_by, email, status)
      VALUES (tid, uid, 'seed-invite-' || i || '@example.test', 'pending');
  END LOOP;

  -- Distinct invite the EXPLAIN query targets on idx_team_invites_email.
  INSERT INTO public.team_invites (team_id, invited_by, email, status)
    VALUES (tid, uid, 'i1@example.test', 'pending');

  -- Noise: 100 other users, each owning their own team with 20 contracts
  -- and a few team members / invites. Drives row counts up so the seed
  -- user's predicates are highly selective.
  FOR i IN 1..100 LOOP
    noise_uid := gen_random_uuid();
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, aud, role)
      VALUES (noise_uid, 'explain-seed-noise' || i || '@example.test', '', now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
    INSERT INTO public.profiles (id, plan, contracts_this_month)
      VALUES (noise_uid, 'solo', 0)
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.teams (name, owner_id) VALUES ('noise-team-' || i, noise_uid) RETURNING id INTO noise_tid;

    FOR j IN 1..20 LOOP
      INSERT INTO public.contracts (user_id, team_id, status, raw_text, title, file_name)
        VALUES (noise_uid, noise_tid, 'completed', 'noise', 'noise contract', 'noise.txt') RETURNING id INTO noise_cid;
      INSERT INTO public.contract_analyses (contract_id, user_id, summary)
        VALUES (noise_cid, noise_uid, 'noise summary');
      INSERT INTO public.chat_messages (contract_id, user_id, role, content)
        VALUES (noise_cid, noise_uid, 'user', 'q'), (noise_cid, noise_uid, 'assistant', 'a');
    END LOOP;

    FOR j IN 1..5 LOOP
      DECLARE
        nm_uid uuid := gen_random_uuid();
      BEGIN
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, instance_id, aud, role)
          VALUES (nm_uid, 'explain-seed-nm' || i || '-' || j || '@example.test', '', now(),
                  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
        INSERT INTO public.team_members (team_id, user_id, role)
          VALUES (noise_tid, nm_uid, 'member');
      END;
      INSERT INTO public.team_invites (team_id, invited_by, email, status)
        VALUES (noise_tid, noise_uid, 'noise-inv-' || i || '-' || j || '@example.test', 'pending');
    END LOOP;
  END LOOP;

  ANALYZE public.contracts;
  ANALYZE public.contract_analyses;
  ANALYZE public.chat_messages;
  ANALYZE public.team_members;
  ANALYZE public.team_invites;
END
$$;
