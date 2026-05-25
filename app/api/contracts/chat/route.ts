import { after, NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createGroq } from '@ai-sdk/groq'
import { streamText } from 'ai'
import { getActivePlan } from '@/lib/plan/access'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit'
import { logger } from '@/lib/log/request'
import {
  CHAT_CONTRACT_TEXT_MAX_CHARS,
  CHAT_HISTORY_MESSAGES,
  CHAT_LLM_MAX_OUTPUT_TOKENS,
  CHAT_LLM_TEMPERATURE,
  CHAT_REPLY_MAX_CHARS,
} from '@/lib/constants/chat-limits'

// Single source of truth for the user-facing persistence-failure message.
// Surfaced from two distinct branches (insert error / placeholder missing); we
// want both to read identically so the client never branches on copy.
const SAVE_FAILED_MESSAGE = 'Failed to save message — please retry.'

export async function POST(req: NextRequest) {
  let userId: string | undefined
  const rlog = logger(req, 'contracts.chat')
  try {
    const groqApiKey = process.env.GROQ_API_KEY?.trim()
    if (!groqApiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
    }
    const groq = createGroq({ apiKey: groqApiKey })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id

    const { contractId, message } = await req.json()
    if (!contractId || !message) {
      return NextResponse.json({ error: 'contractId and message are required' }, { status: 400 })
    }

    // Fetch the user's plan first so we can gate on the rate-limit BEFORE
    // firing the 4-way DB fan-out. Every other route (analyze, upload,
    // contract-delete, account-delete) follows this pattern; chat was the
    // outlier that wasted those queries on already-throttled requests.
    const active = await getActivePlan(user.id)

    const rl = await consumeRateLimit({
      action: 'chat',
      userId: user.id,
      tier: active.tier,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many requests', limitReached: true },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const [
      contractRes,
      messageCountRes,
      analysisRes,
      historyRes,
    ] = await Promise.all([
      supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .single(),
      // Count COMPLETED assistant turns (non-empty content) — not user rows.
      // The pre-stream insert writes both a user row and an empty assistant
      // placeholder; if streamText fails, the placeholder is never filled.
      // Counting user rows would charge the quota for failed turns. Counting
      // role='assistant' AND content<>'' charges only successful replies, which
      // matches the user's mental model ("messages I got back").
      supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contract_id', contractId)
        .eq('role', 'assistant')
        .neq('content', ''),
      supabase
        .from('contract_analyses')
        .select('*')
        .eq('contract_id', contractId)
        .single(),
      // Get recent history — user turns only to prevent poisoned assistant turns
      // from being re-fed into subsequent requests.
      supabase
        .from('chat_messages')
        .select('role, content')
        .eq('contract_id', contractId)
        .eq('role', 'user')
        .order('created_at', { ascending: true })
        .limit(CHAT_HISTORY_MESSAGES),
    ])

    const contract = contractRes.data

    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

    const isOwner = contract.user_id === user.id
    if (!isOwner) {
      return NextResponse.json(
        {
          error: 'Chat is read-only for shared team contracts. Ask the contract owner to send messages.',
          kind: 'chat_readonly',
        },
        { status: 403 }
      )
    }

    const plan = active.tier
    const limits = PLAN_LIMITS[plan]

    const currentCount = messageCountRes.count || 0
    if (limits.messagesPerContract !== -1 && currentCount >= limits.messagesPerContract) {
      return NextResponse.json({ 
        error: `You've reached the ${limits.messagesPerContract} message limit for this contract. Upgrade to Pro for unlimited AI chat.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }
    const analysis = analysisRes.data
    const history = historyRes.data

    const requestId = randomUUID()
    const START = `<<<UNTRUSTED-CONTRACT-${requestId}-START>>>`
    const END = `<<<UNTRUSTED-CONTRACT-${requestId}-END>>>`

    // Shared scrub helper: strip any sentinel-shaped content from untrusted strings.
    // Why: prompt safety depends on START/END sentinel boundaries. If an attacker
    // can inject delimiter-shaped text into contract/title/history/message fields,
    // they can forge boundaries and alter model instructions.
    const SCRUB_REGEX = /<<<UNTRUSTED-CONTRACT-[a-fA-F0-9-]+-(START|END)>>>/gi
    const scrub = (s: string) => s.replace(SCRUB_REGEX, '[REDACTED-SENTINEL]')

    const rawContractText = scrub((contract.raw_text || '').slice(0, CHAT_CONTRACT_TEXT_MAX_CHARS))

    const contractContext = `
Contract Title: ${scrub(contract.title)}
File: ${scrub(contract.file_name)}
Risk Score: ${contract.risk_score}/100

${analysis ? `Summary: ${scrub(analysis.summary)}

Key Points:
${(analysis.key_points as string[]).map((p, i) => `${i + 1}. ${scrub(p)}`).join('\n')}

Identified Risks:
${(analysis.risks as { title: string; severity: string; description: string }[]).map(r => `- [${r.severity.toUpperCase()}] ${scrub(r.title)}: ${scrub(r.description)}`).join('\n')}

Key Clauses:
${Object.entries(analysis.clauses as Record<string, string>).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${scrub(String(v))}`).join('\n')}
` : '(Analysis not yet complete)'}

Contract Text:
${START}
${rawContractText}
${END}
`

    const historyMessages = (history || [])
      .map(h => `User asked: ${scrub(h.content)}`)
      .join('\n')

    // Scrub the current user message to prevent sentinel injection
    const safeMessage = scrub(message)

    const prompt = `You are a highly knowledgeable contract law assistant. Answer the user's current question clearly and in plain English. The "previous questions" list is for context only — you have not previously responded to them in this conversation.

CONTRACT CONTEXT:
${contractContext}

PREVIOUS USER QUESTIONS (for context, not a conversation history):
${historyMessages}

User: ${safeMessage}
Assistant:`

    // Pre-stream: insert user row + empty assistant placeholder so a transient
    // DB failure surfaces as 500 BEFORE any stream bytes go out (no silent loss).
    // The placeholder is filled in via UPDATE in onFinish.
    const { data: inserted, error: insertErr } = await supabase
      .from('chat_messages')
      .insert([
        { contract_id: contractId, user_id: user.id, role: 'user', content: safeMessage },
        { contract_id: contractId, user_id: user.id, role: 'assistant', content: '' },
      ])
      .select('id, role')

    if (insertErr || !inserted) {
      // Preserve the full Supabase error (code/details/hint) — the logger
      // serializes Error instances, so a synthetic new Error(insertErr.message)
      // would drop those fields. Pass the original PostgrestError as-is and
      // surface .code at the top level so log-aggregation queries can filter.
      rlog.error('chat.persist.pre_stream_failed', {
        err: insertErr ?? new Error('no rows returned'),
        code: insertErr?.code,
        userId: user.id,
      })
      return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 })
    }

    const placeholder = inserted.find(r => r.role === 'assistant')
    if (!placeholder) {
      rlog.error('chat.persist.placeholder_missing', { userId: user.id })
      return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 })
    }

    const result = streamText({
      model: groq('llama-3.3-70b-versatile'),
      prompt,
      temperature: CHAT_LLM_TEMPERATURE,
      maxOutputTokens: CHAT_LLM_MAX_OUTPUT_TOKENS,
      onFinish: async ({ text }) => {
        const reply = text.trim().slice(0, CHAT_REPLY_MAX_CHARS)
        if (!reply) return
        // Wrap in after() so the UPDATE runs to completion even if the client
        // disconnects mid-stream. On Vercel serverless, without after() the
        // function instance can be torn down before this async work finishes,
        // leaving an orphaned empty assistant placeholder behind.
        after(async () => {
          const { error: updateErr } = await supabase
            .from('chat_messages')
            .update({ content: reply })
            .eq('id', placeholder.id)
          if (updateErr) {
            // Same rationale as pre_stream_failed: preserve full PostgrestError.
            rlog.error('chat.persist.update_failed', {
              err: updateErr,
              code: updateErr.code,
              userId: user.id,
              placeholderId: placeholder.id,
            })
          }
        })
      },
    })
    return result.toTextStreamResponse()
  } catch (err) {
    rlog.error('chat.failed', { err, ...(userId ? { userId } : {}) })
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
