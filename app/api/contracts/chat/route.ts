import { after, NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createGroq } from '@ai-sdk/groq'
import { streamText } from 'ai'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit'
import { log } from '@/lib/log'
import { getCurrentRunWithPersona } from '@/lib/contracts/read'
import { requireUserContext, isAuthedContext } from '@/lib/api/auth-context'
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
  try {
    const groqApiKey = process.env.GROQ_API_KEY?.trim()
    if (!groqApiKey) {
      return NextResponse.json({ error: 'GROQ_API_KEY is not configured' }, { status: 500 })
    }
    const groq = createGroq({ apiKey: groqApiKey })

    const ctx = await requireUserContext(req, { action: 'contracts.chat' })
    if (!isAuthedContext(ctx)) return ctx
    const { user, supabase, tier, log: ulog } = ctx
    userId = user.id

    const { contractId, message } = await req.json()
    if (!contractId || !message) {
      return NextResponse.json({ error: 'contractId and message are required' }, { status: 400 })
    }

    const rl = await consumeRateLimit({
      action: 'chat',
      userId: user.id,
      tier,
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
      runRes,
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
      // Consolidated read of analysis_runs joined with persona_versions.
      // Returns null when contract has no current_run_id (analysis pending).
      getCurrentRunWithPersona(contractId, supabase).catch(() => null),
      // Get recent history — user turns only to prevent poisoned assistant turns
      // from being re-fed into subsequent requests. Order DESC + limit to fetch
      // the MOST RECENT N messages, then reverse client-side to restore
      // chronological order for the prompt builder. (ASC + limit would return
      // the OLDEST N — useless for long threads.)
      supabase
        .from('chat_messages')
        .select('role, content')
        .eq('contract_id', contractId)
        .eq('role', 'user')
        .order('created_at', { ascending: false })
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

    const plan = tier
    const limits = PLAN_LIMITS[plan]

    const currentCount = messageCountRes.count || 0
    if (limits.messagesPerContract !== -1 && currentCount >= limits.messagesPerContract) {
      return NextResponse.json({ 
        error: `You've reached the ${limits.messagesPerContract} message limit for this contract. Upgrade to Pro for unlimited AI chat.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }
    // analysis_runs.output is the canonical post-Tier-1 shape. Map the
    // structured output to the legacy-compatible field set the prompt builder
    // below consumes (summary / risks / clauses) — chat doesn't need persona
    // grouping, just the prose context for the LLM.
    const runWithPersona = runRes
    const analysis = runWithPersona?.run.output
      ? {
          summary: runWithPersona.run.output.summary,
          // No key_points in the new schema — suggestions are the closest analog.
          key_points: runWithPersona.run.output.suggestions,
          risks: runWithPersona.run.output.risks.map(r => ({
            title: r.title,
            severity: r.severity,
            description: r.description,
          })),
          // Map clauses[] (keyed by key_clause_id) into a record keyed by
          // persona label for the prompt rendering below.
          clauses: Object.fromEntries(
            runWithPersona.run.output.clauses
              .filter(c => c.presence.status === 'present')
              .map(c => {
                const label =
                  runWithPersona.persona.keyClauses.find(k => k.id === c.key_clause_id)?.label ??
                  c.key_clause_id
                const presence = c.presence as { status: 'present'; quoted_text: string; concern?: string }
                return [label, presence.quoted_text + (presence.concern ? ` — ${presence.concern}` : '')]
              }),
          ),
        }
      : null
    // Reverse the DESC-fetched history into chronological order for prompt assembly.
    const history = historyRes.data ? [...historyRes.data].reverse() : null

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

    // Risk score: prefer the canonical value from the current analysis run's
    // output. Only fall back to the contracts column when no run exists yet
    // (legacy mid-migration rows; goes away once every contract has a run).
    const riskScoreForPrompt =
      runWithPersona?.run.output?.risk_score ?? contract.risk_score ?? null
    const riskScoreLine =
      riskScoreForPrompt !== null ? `Risk Score: ${riskScoreForPrompt}/100` : 'Risk Score: (not yet analyzed)'

    const contractContext = `
Contract Title: ${scrub(contract.title)}
File: ${scrub(contract.file_name)}
${riskScoreLine}

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
      ulog.error('chat.persist.pre_stream_failed', {
        err: insertErr ?? new Error('no rows returned'),
        code: insertErr?.code,
        userId: user.id,
        subsystem: 'supabase',
        op: 'chat_messages.insert',
      })
      return NextResponse.json({ error: SAVE_FAILED_MESSAGE }, { status: 500 })
    }

    const placeholder = inserted.find(r => r.role === 'assistant')
    if (!placeholder) {
      ulog.error('chat.persist.placeholder_missing', {
        err: new Error('placeholder row missing after insert'),
        userId: user.id,
        subsystem: 'supabase',
        op: 'chat_messages.insert',
      })
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
          const { data: updatedRows, error: updateErr } = await supabase
            .from('chat_messages')
            .update({ content: reply })
            .eq('id', placeholder.id)
            .select('id')
          if (updateErr) {
            // Same rationale as pre_stream_failed: preserve full PostgrestError.
            ulog.error('chat.persist.update_failed', {
              err: updateErr,
              code: updateErr.code,
              userId: user.id,
              placeholderId: placeholder.id,
              subsystem: 'supabase',
              op: 'chat_messages.update',
            })
            return
          }
          if (!updatedRows || updatedRows.length === 0) {
            // Tripwire for future RLS regressions on chat_messages.
            // Migration 012 added the UPDATE policy that prevents this.
            ulog.error('chat.persist.zero_rows', {
              userId: user.id,
              placeholderId: placeholder.id,
              subsystem: 'supabase',
              op: 'chat_messages.update',
              hint: 'check chat_messages UPDATE RLS policy',
            })
          }
        })
      },
    })
    return result.toTextStreamResponse()
  } catch (err) {
    log.error('chat.failed', {
      err,
      route: 'contracts.chat',
      subsystem: 'llm',
      provider: 'groq',
      op: 'chat',
      ...(userId ? { userId } : {}),
    })
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
