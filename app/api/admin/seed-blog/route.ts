import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // First ensure the table has RLS disabled for service role or set up the right policy
  const posts = [
    {
      slug: 'introducing-lexai',
      title: 'Introducing LexAI: AI-Powered Contract Intelligence',
      excerpt: "We built LexAI because reading contracts is painful. Today, we're making it effortless for every team.",
      content: "Contracts are the backbone of every business relationship — yet reading, understanding, and tracking them remains one of the most time-consuming legal tasks. That's why we built LexAI.\n\nLexAI uses advanced AI to analyze contracts in seconds, surface hidden risks, extract key clauses, and give your team a clear risk score — all without needing a law degree.\n\n## What LexAI does\n\nUpload any contract — PDF, DOCX, or paste text — and within moments you will see:\n\n- **Risk scoring**: An overall score and per-clause breakdown\n- **Key clauses**: Auto-extracted parties, dates, obligations, and termination terms\n- **AI chat**: Ask follow-up questions in plain English\n- **Reports**: Export a full risk summary to share with your team\n\n## Built for teams\n\nLexAI is designed for legal ops, procurement, and founders — anyone who handles contracts regularly and needs clarity fast. With the Team plan, you can share contracts across your organization and track analytics across your whole portfolio.\n\nWe are just getting started. Sign up free and analyze your first contract today.",
      category: 'Product',
      author_name: 'LexAI Team',
      published: true,
      published_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      slug: 'understanding-contract-risk-scores',
      title: 'How to Read Your Contract Risk Score',
      excerpt: "A risk score of 74 — is that bad? Here's exactly how LexAI calculates contract risk and what each band means for your business.",
      content: "When LexAI assigns a risk score to your contract, it is not a random number. It is a weighted calculation based on the severity and frequency of risk items found in the document.\n\n## The scoring model\n\nEvery identified risk is classified as:\n\n- **High** (weight: 100) — clauses that could expose you to significant liability\n- **Medium** (weight: 55) — clauses worth negotiating but not deal-breakers\n- **Low** (weight: 20) — minor or standard clauses with minimal risk\n\nThe final score is the average of all weighted risks, capped at 100.\n\n## What the bands mean\n\nScores 0 to 29 are Low risk — review and sign. Scores 30 to 59 are Medium risk — negotiate key terms. Scores 60 to 79 are High risk — legal review recommended. Scores 80 to 100 are Critical — do not sign without counsel.\n\n## Common high-risk clauses\n\n- Unlimited liability provisions\n- Automatic renewal with long notice periods\n- One-sided IP assignment\n- Broad indemnification obligations\n- Unilateral amendment rights\n\nUnderstanding your score is the first step. LexAI's AI chat lets you drill into any clause and ask why it is risky — in plain English.",
      category: 'Legal Insights',
      author_name: 'LexAI Team',
      published: true,
      published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      slug: 'five-contract-clauses-to-watch',
      title: '5 Contract Clauses You Should Never Ignore',
      excerpt: "These five clauses appear in almost every business contract — and most people skip right past them. Here's why that's a mistake.",
      content: "Most contract disputes do not come from the headline terms — they come from the fine print. Here are five clauses that regularly cause problems for businesses.\n\n## 1. Limitation of liability\n\nThis clause caps how much either party can sue for. Liability limited to fees paid in the last 12 months sounds reasonable until a data breach costs 100x that amount.\n\n## 2. Indemnification\n\nWho pays if a third party sues because of your contract? Broad indemnification language can make you responsible for things entirely outside your control.\n\n## 3. Intellectual property assignment\n\nIn vendor agreements, watch for clauses that give the vendor rights to anything you create using their platform.\n\n## 4. Automatic renewal\n\nMany SaaS and service contracts renew automatically with notice periods of 30 to 90 days. Miss the window and you are locked in for another year.\n\n## 5. Governing law and jurisdiction\n\nIf a dispute arises, where will it be resolved? A clause requiring disputes to be settled in another country can make enforcement practically impossible.\n\nLexAI automatically flags all five of these and more — with plain-language explanations and a risk rating for each.",
      category: 'Legal Insights',
      author_name: 'LexAI Team',
      published: true,
      published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
      slug: 'team-contracts-best-practices',
      title: 'Best Practices for Managing Contracts as a Team',
      excerpt: "When multiple people touch contracts, things fall through the cracks. Here's how to build a contract workflow that scales.",
      content: "Contract management is straightforward when it is just you. But as teams grow, contracts multiply — and so do the risks of missed renewals, conflicting versions, and unclear ownership.\n\n## Build a shared library\n\nThe first step is centralizing your contracts. Whether you use LexAI's shared team library or a dedicated CLM tool, everyone should have access to the same source of truth.\n\n## Assign clear ownership\n\nEvery contract should have one owner — the person responsible for monitoring its status, renewals, and any renegotiations. Without ownership, contracts fall through the cracks.\n\n## Standardize your review process\n\nCreate a checklist of what gets reviewed on every incoming contract: liability caps, IP terms, payment terms, and renewal clauses. LexAI can automate this review and flag deviations from your standard terms.\n\n## Track renewals proactively\n\nSet reminders 90 days before any contract renewal date. This gives you time to renegotiate, find alternatives, or cancel without penalty.\n\n## Use AI for first-pass review\n\nAI does not replace legal counsel — it makes your legal spend more efficient. Use LexAI for initial screening so your lawyers only spend time on the contracts that genuinely need attention.",
      category: 'Best Practices',
      author_name: 'LexAI Team',
      published: true,
      published_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
  ]

  const { data, error } = await supabase
    .from('blog_posts')
    .upsert(posts, { onConflict: 'slug' })
    .select('id, slug')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, seeded: data?.length ?? 0 })
}
