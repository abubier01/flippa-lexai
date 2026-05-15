import pg from 'pg'

const { Client } = pg

const client = new Client({
  connectionString: process.env.POSTGRES_URL,
  ssl: { rejectUnauthorized: false },
})

await client.connect()

console.log('Creating blog_posts table...')

await client.query(`
  CREATE TABLE IF NOT EXISTS public.blog_posts (
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
  )
`)
console.log('Table created.')

await client.query(`ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY`)

await client.query(`
  DO $$ BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies WHERE tablename = 'blog_posts' AND policyname = 'blog_posts_public_read'
    ) THEN
      CREATE POLICY "blog_posts_public_read" ON public.blog_posts FOR SELECT USING (published = true);
    END IF;
  END $$
`)
console.log('RLS policy created.')

const posts = [
  {
    slug: 'introducing-lexai',
    title: 'Introducing LexAI: AI-Powered Contract Intelligence',
    excerpt: "We built LexAI because reading contracts is painful. Today, we're making it effortless for every team.",
    content: "Contracts are the backbone of every business relationship — yet reading, understanding, and tracking them remains one of the most time-consuming legal tasks. That's why we built LexAI.\n\nLexAI uses advanced AI to analyze contracts in seconds, surface hidden risks, extract key clauses, and give your team a clear risk score — all without needing a law degree.\n\n## What LexAI does\n\nUpload any contract — PDF, DOCX, or paste text — and within moments you will see:\n\n- **Risk scoring**: An overall score and per-clause breakdown\n- **Key clauses**: Auto-extracted parties, dates, obligations, and termination terms\n- **AI chat**: Ask follow-up questions in plain English\n- **Reports**: Export a full risk summary to share with your team\n\n## Built for teams\n\nLexAI is designed for legal ops, procurement, and founders — anyone who handles contracts regularly and needs clarity fast. With the Team plan, you can share contracts across your organization.\n\nWe are just getting started. Sign up free and analyze your first contract today.",
    category: 'Product',
    published: true,
    published_at: new Date(Date.now() - 2 * 86400000).toISOString(),
  },
  {
    slug: 'understanding-contract-risk-scores',
    title: 'How to Read Your Contract Risk Score',
    excerpt: "A risk score of 74 — is that bad? Here's exactly how LexAI calculates contract risk and what each band means for your business.",
    content: "When LexAI assigns a risk score to your contract, it is not a random number. It is a weighted calculation based on the severity and frequency of risk items found in the document.\n\n## The scoring model\n\nEvery identified risk is classified as:\n\n- **High** (weight: 100) — clauses that could expose you to significant liability\n- **Medium** (weight: 55) — clauses worth negotiating but not deal-breakers\n- **Low** (weight: 20) — minor or standard clauses with minimal risk\n\nThe final score is the average of all weighted risks, capped at 100.\n\n## What the bands mean\n\nScores 0 to 29 are Low risk. Scores 30 to 59 are Medium. Scores 60 to 79 are High. Scores 80 to 100 are Critical and legal review is strongly recommended.\n\n## Common high-risk clauses\n\n- Unlimited liability provisions\n- Automatic renewal with long notice periods\n- One-sided IP assignment\n- Broad indemnification obligations\n- Unilateral amendment rights",
    category: 'Legal Insights',
    published: true,
    published_at: new Date(Date.now() - 5 * 86400000).toISOString(),
  },
  {
    slug: 'five-contract-clauses-to-watch',
    title: '5 Contract Clauses You Should Never Ignore',
    excerpt: "These five clauses appear in almost every business contract — and most people skip right past them. Here's why that's a mistake.",
    content: "Most contract disputes do not come from the headline terms — they come from the fine print. Here are five clauses that regularly cause problems.\n\n## 1. Limitation of liability\n\nThis clause caps how much either party can sue for. A cap too low can leave you severely undercompensated.\n\n## 2. Indemnification\n\nWho pays if a third party sues? Broad indemnification language can make you responsible for things outside your control.\n\n## 3. Intellectual property assignment\n\nWatch for clauses that give a vendor rights to anything you create using their platform.\n\n## 4. Automatic renewal\n\nMany contracts renew automatically with notice periods of 30 to 90 days. Miss the window and you are locked in.\n\n## 5. Governing law and jurisdiction\n\nA clause requiring disputes to be settled in another country can make enforcement practically impossible.\n\nLexAI automatically flags all five of these and more.",
    category: 'Legal Insights',
    published: true,
    published_at: new Date(Date.now() - 10 * 86400000).toISOString(),
  },
  {
    slug: 'team-contracts-best-practices',
    title: 'Best Practices for Managing Contracts as a Team',
    excerpt: "When multiple people touch contracts, things fall through the cracks. Here's how to build a contract workflow that scales.",
    content: "Contract management is straightforward when it is just you. But as teams grow, contracts multiply — and so do the risks.\n\n## Build a shared library\n\nCentralize your contracts so everyone has access to the same source of truth.\n\n## Assign clear ownership\n\nEvery contract should have one owner responsible for monitoring renewals and renegotiations.\n\n## Standardize your review process\n\nCreate a checklist of what gets reviewed on every incoming contract: liability caps, IP terms, payment terms, and renewal clauses.\n\n## Track renewals proactively\n\nSet reminders 90 days before any renewal date to give time to renegotiate or cancel without penalty.\n\n## Use AI for first-pass review\n\nAI does not replace legal counsel — it makes your legal spend more efficient. Use LexAI for initial screening so lawyers only spend time on contracts that genuinely need attention.",
    category: 'Best Practices',
    published: true,
    published_at: new Date(Date.now() - 14 * 86400000).toISOString(),
  },
]

for (const post of posts) {
  await client.query(
    `INSERT INTO public.blog_posts (slug, title, excerpt, content, category, author_name, published, published_at)
     VALUES ($1, $2, $3, $4, $5, 'LexAI Team', $6, $7)
     ON CONFLICT (slug) DO NOTHING`,
    [post.slug, post.title, post.excerpt, post.content, post.category, post.published, post.published_at]
  )
  console.log(`Inserted: ${post.slug}`)
}

await client.end()
console.log('Done!')
