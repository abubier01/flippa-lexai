import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'
import { getActivePlan } from '@/lib/plan/access'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, getClientIp, rateLimitHeaders } from '@/lib/security/rate-limit'
import { logger } from '@/lib/log/request'

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

    const ip = getClientIp(req)
    const limitResult = consumeRateLimit({
      key: `ai:chat:${user.id}:${ip}`,
      limit: 60,
      windowMs: 15 * 60 * 1000,
    })
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again shortly.' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    const { contractId, message } = await req.json()
    if (!contractId || !message) {
      return NextResponse.json({ error: 'contractId and message are required' }, { status: 400 })
    }

    const [
      contractRes,
      active,
      messageCountRes,
      analysisRes,
      historyRes,
    ] = await Promise.all([
      supabase
        .from('contracts')
        .select('*')
        .eq('id', contractId)
        .eq('user_id', user.id)
        .single(),
      getActivePlan(user.id),
      supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('contract_id', contractId)
        .eq('user_id', user.id)
        .eq('role', 'user'),
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
        .limit(10),
    ])

    const contract = contractRes.data

    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

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

    const rawContractText = scrub((contract.raw_text || '').slice(0, 8000))

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

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt,
      temperature: 0.3,
      maxOutputTokens: 1024,
    })

    if (typeof text !== 'string') {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

    const reply = text.trim().slice(0, 8000)
    if (!reply) {
      return NextResponse.json({ error: 'AI returned an empty response.' }, { status: 502 })
    }

    // Save both messages
    await supabase.from('chat_messages').insert([
      { contract_id: contractId, user_id: user.id, role: 'user', content: safeMessage },
      { contract_id: contractId, user_id: user.id, role: 'assistant', content: reply },
    ])

    return NextResponse.json({ reply })
  } catch (err) {
    rlog.error('chat.failed', { err, ...(userId ? { userId } : {}) })
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
