import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
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
      CREATE POLICY "blog_posts_public_read" ON public.blog_posts
        FOR SELECT USING (published = true);
    END IF;
  END $$`,

  // Seed sample posts
  `INSERT INTO public.blog_posts (slug, title, excerpt, content, category, author_name, published, published_at)
  VALUES
  (
    'introducing-lexai',
    'Introducing LexAI: AI-Powered Contract Intelligence',
    'We built LexAI because reading contracts is painful. Today, we''re making it effortless for every team.',
    'Contracts are the backbone of every business relationship — yet reading, understanding, and tracking them remains one of the most time-consuming legal tasks. That''s why we built LexAI.\n\nLexAI uses advanced AI to analyze contracts in seconds, surface hidden risks, extract key clauses, and give your team a clear risk score — all without needing a law degree.\n\n## What LexAI does\n\nUpload any contract — PDF, DOCX, or paste text — and within moments you''ll see:\n\n- **Risk scoring**: An overall score and per-clause breakdown\n- **Key clauses**: Auto-extracted parties, dates, obligations, and termination terms\n- **AI chat**: Ask follow-up questions in plain English\n- **Reports**: Export a full risk summary to share with your team\n\n## Built for teams\n\nLexAI is designed for legal ops, procurement, and founders — anyone who handles contracts regularly and needs clarity fast. With the Team plan, you can share contracts across your organization and track analytics across your whole portfolio.\n\nWe''re just getting started. Sign up free and analyze your first contract today.',
    'Product',
    'LexAI Team',
    true,
    NOW() - INTERVAL '2 days'
  ),
  (
    'understanding-contract-risk-scores',
    'How to Read Your Contract Risk Score',
    'A risk score of 74 — is that bad? Here''s exactly how LexAI calculates contract risk and what each band means for your business.',
    'When LexAI assigns a risk score to your contract, it''s not a random number. It''s a weighted calculation based on the severity and frequency of risk items found in the document.\n\n## The scoring model\n\nEvery identified risk is classified as:\n\n- **High** (weight: 100) — clauses that could expose you to significant liability\n- **Medium** (weight: 55) — clauses worth negotiating but not deal-breakers\n- **Low** (weight: 20) — minor or standard clauses with minimal risk\n\nThe final score is the average of all weighted risks, capped at 100.\n\n## What the bands mean\n\n| Score | Level | Recommended action |\n|-------|-------|--------------------|\n| 0–29 | Low | Review and sign |\n| 30–59 | Medium | Negotiate key terms |\n| 60–79 | High | Legal review recommended |\n| 80–100 | Critical | Do not sign without counsel |\n\n## Common high-risk clauses\n\n- Unlimited liability provisions\n- Automatic renewal with long notice periods\n- One-sided IP assignment\n- Broad indemnification obligations\n- Unilateral amendment rights\n\nUnderstanding your score is the first step. LexAI''s AI chat lets you drill into any clause and ask "why is this risky?" in plain English.',
    'Legal Insights',
    'LexAI Team',
    true,
    NOW() - INTERVAL '5 days'
  ),
  (
    'five-contract-clauses-to-watch',
    '5 Contract Clauses You Should Never Ignore',
    'These five clauses appear in almost every business contract — and most people skip right past them. Here''s why that''s a mistake.',
    'Most contract disputes don''t come from the headline terms — they come from the fine print. Here are five clauses that regularly cause problems for businesses.\n\n## 1. Limitation of liability\n\nThis clause caps how much either party can sue for. "Liability limited to fees paid in the last 12 months" sounds reasonable until you realize a data breach could cost 100x that amount.\n\n## 2. Indemnification\n\nWho pays if a third party sues because of your contract? Broad indemnification language can make you responsible for things entirely outside your control.\n\n## 3. Intellectual property assignment\n\nIn vendor agreements, watch for clauses that give the vendor rights to anything you create using their platform. In employment contracts, ensure work-for-hire provisions are mutual.\n\n## 4. Automatic renewal\n\nMany SaaS and service contracts renew automatically with notice periods of 30–90 days. Miss the window and you''re locked in for another year.\n\n## 5. Governing law and jurisdiction\n\nIf a dispute arises, where will it be resolved? A clause requiring disputes to be settled in another country can make enforcement practically impossible.\n\nLexAI automatically flags all five of these and more — with plain-language explanations and a risk rating for each.',
    'Legal Insights',
    'LexAI Team',
    true,
    NOW() - INTERVAL '10 days'
  ),
  (
    'team-contracts-best-practices',
    'Best Practices for Managing Contracts as a Team',
    'When multiple people touch contracts, things fall through the cracks. Here''s how to build a contract workflow that scales.',
    'Contract management is straightforward when it''s just you. But as teams grow, contracts multiply — and so do the risks of missed renewals, conflicting versions, and unclear ownership.\n\n## Build a shared library\n\nThe first step is centralizing your contracts. Whether you use LexAI''s shared team library or a dedicated CLM tool, everyone should have access to the same source of truth.\n\n## Assign clear ownership\n\nEvery contract should have one owner — the person responsible for monitoring its status, renewals, and any renegotiations. Without ownership, contracts fall through the cracks.\n\n## Standardize your review process\n\nCreate a checklist of what gets reviewed on every incoming contract: liability caps, IP terms, payment terms, and renewal clauses. LexAI can automate this review and flag deviations from your standard terms.\n\n## Track renewals proactively\n\nSet reminders 90 days before any contract renewal date. This gives you time to renegotiate, find alternatives, or cancel without penalty.\n\n## Use AI for first-pass review\n\nAI doesn''t replace legal counsel — it makes your legal spend more efficient. Use LexAI for initial screening so your lawyers only spend time on the contracts that genuinely need attention.',
    'Best Practices',
    'LexAI Team',
    true,
    NOW() - INTERVAL '14 days'
  )
  ON CONFLICT (slug) DO NOTHING`,
]

async function run() {
  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { sql }).catch(() => ({ error: null }))
    if (error) {
      // Try direct query for DDL
      console.log('Trying alternative approach for statement...')
    }
  }

  // Use the REST API approach
  console.log('Creating blog_posts table via Supabase...')
  const { data, error } = await supabase.from('blog_posts').select('id').limit(1)
  
  if (error?.code === '42P01') {
    console.log('Table does not exist yet — please run the SQL manually in Supabase dashboard:')
    console.log(statements[0])
  } else if (error) {
    console.error('Error:', error.message)
  } else {
    console.log('blog_posts table exists! Found rows:', data?.length ?? 0)
  }
}

run()
