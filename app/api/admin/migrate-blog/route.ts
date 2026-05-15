import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const statements = [
    `CREATE TABLE IF NOT EXISTS public.blog_posts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      excerpt TEXT,
      content TEXT,
      cover_url TEXT,
      author_name TEXT NOT NULL DEFAULT 'LexAI Team',
      author_avatar TEXT,
      category TEXT NOT NULL DEFAULT 'Product',
      published BOOLEAN NOT NULL DEFAULT false,
      published_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`,
    `ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY`,
    `DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'blog_posts_public_read'
      ) THEN
        CREATE POLICY "blog_posts_public_read" ON public.blog_posts FOR SELECT USING (published = true);
      END IF;
    END $$`,
    `INSERT INTO public.blog_posts (slug, title, excerpt, content, category, author_name, published, published_at)
    VALUES
    (
      'introducing-lexai',
      'Introducing LexAI: AI-Powered Contract Intelligence',
      'We built LexAI because reading contracts is painful. Today, we''re making it effortless for every team.',
      E'Contracts are the backbone of every business relationship — yet reading, understanding, and tracking them remains one of the most time-consuming legal tasks. That''s why we built LexAI.\n\nLexAI uses advanced AI to analyze contracts in seconds, surface hidden risks, extract key clauses, and give your team a clear risk score — all without needing a law degree.\n\n## What LexAI does\n\nUpload any contract — PDF, DOCX, or paste text — and within moments you will see:\n\n- **Risk scoring**: An overall score and per-clause breakdown\n- **Key clauses**: Auto-extracted parties, dates, obligations, and termination terms\n- **AI chat**: Ask follow-up questions in plain English\n- **Reports**: Export a full risk summary to share with your team\n\n## Built for teams\n\nLexAI is designed for legal ops, procurement, and founders — anyone who handles contracts regularly and needs clarity fast.',
      'Product',
      'LexAI Team',
      true,
      NOW() - INTERVAL ''2 days''
    ),
    (
      'understanding-contract-risk-scores',
      'How to Read Your Contract Risk Score',
      'A risk score of 74 — is that bad? Here''s exactly how LexAI calculates contract risk and what each band means for your business.',
      E'When LexAI assigns a risk score to your contract, it''s not a random number. It''s a weighted calculation based on the severity and frequency of risk items found in the document.\n\n## The scoring model\n\nEvery identified risk is classified as:\n\n- **High** (weight: 100) — clauses that could expose you to significant liability\n- **Medium** (weight: 55) — clauses worth negotiating but not deal-breakers\n- **Low** (weight: 20) — minor or standard clauses with minimal risk\n\nThe final score is the average of all weighted risks, capped at 100.\n\n## Risk bands\n\nScores 0–29 are Low risk. Scores 30–59 are Medium risk. Scores 60–79 are High risk. Scores 80–100 are Critical risk and legal review is strongly recommended before signing.',
      'Legal Insights',
      'LexAI Team',
      true,
      NOW() - INTERVAL ''5 days''
    ),
    (
      'five-contract-clauses-to-watch',
      '5 Contract Clauses You Should Never Ignore',
      'These five clauses appear in almost every business contract — and most people skip right past them. Here''s why that''s a mistake.',
      E'Most contract disputes don''t come from the headline terms — they come from the fine print. Here are five clauses that regularly cause problems.\n\n## 1. Limitation of liability\n\nThis clause caps how much either party can sue for. Broad caps that are too low can leave you undercompensated in a dispute.\n\n## 2. Indemnification\n\nWho pays if a third party sues because of your contract? Broad indemnification language can make you responsible for things outside your control.\n\n## 3. Intellectual property assignment\n\nWatch for clauses that give a vendor rights to anything you create using their platform.\n\n## 4. Automatic renewal\n\nMany contracts renew automatically with notice periods of 30–90 days. Miss the window and you are locked in for another year.\n\n## 5. Governing law and jurisdiction\n\nA clause requiring disputes to be settled in another country can make enforcement practically impossible.',
      'Legal Insights',
      'LexAI Team',
      true,
      NOW() - INTERVAL ''10 days''
    ),
    (
      'team-contracts-best-practices',
      'Best Practices for Managing Contracts as a Team',
      'When multiple people touch contracts, things fall through the cracks. Here''s how to build a contract workflow that scales.',
      E'Contract management is straightforward when it is just you. But as teams grow, contracts multiply — and so do the risks of missed renewals, conflicting versions, and unclear ownership.\n\n## Build a shared library\n\nThe first step is centralizing your contracts so everyone has access to the same source of truth.\n\n## Assign clear ownership\n\nEvery contract should have one owner — the person responsible for monitoring renewals and renegotiations.\n\n## Standardize your review process\n\nCreate a checklist of what gets reviewed on every incoming contract: liability caps, IP terms, payment terms, and renewal clauses.\n\n## Track renewals proactively\n\nSet reminders 90 days before any renewal date to give time to renegotiate or cancel.\n\n## Use AI for first-pass review\n\nAI does not replace legal counsel — it makes your legal spend more efficient. Use LexAI for initial screening so lawyers only spend time on contracts that genuinely need attention.',
      'Best Practices',
      'LexAI Team',
      true,
      NOW() - INTERVAL ''14 days''
    )
    ON CONFLICT (slug) DO NOTHING`,
  ]

  const results: string[] = []

  for (const sql of statements) {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!,
          'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
        },
        body: JSON.stringify({ sql }),
      })

      if (!res.ok) {
        // exec_sql might not exist — use the management API
        const mgmtRes = await fetch(
          `https://api.supabase.com/v1/projects/${process.env.SUPABASE_PROJECT_ID}/database/query`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
            },
            body: JSON.stringify({ query: sql }),
          }
        )
        const d = await mgmtRes.json()
        results.push(mgmtRes.ok ? 'OK via mgmt API' : `Error: ${JSON.stringify(d)}`)
      } else {
        results.push('OK via rpc')
      }
    } catch (e) {
      results.push(`Exception: ${e}`)
    }
  }

  // Verify table exists
  const { data, error } = await supabase.from('blog_posts').select('id').limit(1)
  const tableExists = !error || error.code !== '42P01'

  return NextResponse.json({ results, tableExists })
}
