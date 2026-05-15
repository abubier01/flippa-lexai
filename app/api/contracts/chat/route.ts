import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'
import { PLAN_LIMITS, type PlanType } from '@/lib/plan-limits'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { contractId, message } = await req.json()
    if (!contractId || !message) {
      return NextResponse.json({ error: 'contractId and message are required' }, { status: 400 })
    }

    // Fetch contract + analysis
    const { data: contract } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .eq('user_id', user.id)
      .single()

    if (!contract) return NextResponse.json({ error: 'Contract not found' }, { status: 404 })

    // Fetch user profile for plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()

    const plan = (profile?.plan || 'free') as PlanType
    const limits = PLAN_LIMITS[plan]

    // Count existing messages for this contract (user messages only)
    const { count: messageCount } = await supabase
      .from('chat_messages')
      .select('*', { count: 'exact', head: true })
      .eq('contract_id', contractId)
      .eq('user_id', user.id)
      .eq('role', 'user')

    const currentCount = messageCount || 0
    if (limits.messagesPerContract !== -1 && currentCount >= limits.messagesPerContract) {
      return NextResponse.json({ 
        error: `You've reached the ${limits.messagesPerContract} message limit for this contract. Upgrade to Pro for unlimited AI chat.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }

    const { data: analysis } = await supabase
      .from('contract_analyses')
      .select('*')
      .eq('contract_id', contractId)
      .single()

    // Get recent history
    const { data: history } = await supabase
      .from('chat_messages')
      .select('role, content')
      .eq('contract_id', contractId)
      .order('created_at', { ascending: true })
      .limit(10)

    const contractContext = `
Contract Title: ${contract.title}
File: ${contract.file_name}
Risk Score: ${contract.risk_score}/100

${analysis ? `Summary: ${analysis.summary}

Key Points:
${(analysis.key_points as string[]).map((p, i) => `${i + 1}. ${p}`).join('\n')}

Identified Risks:
${(analysis.risks as { title: string; severity: string; description: string }[]).map(r => `- [${r.severity.toUpperCase()}] ${r.title}: ${r.description}`).join('\n')}

Key Clauses:
${Object.entries(analysis.clauses as Record<string, string>).map(([k, v]) => `- ${k.replace(/_/g, ' ')}: ${v}`).join('\n')}
` : '(Analysis not yet complete)'}

Contract Text:
${(contract.raw_text || '').slice(0, 8000)}
`

    const historyMessages = (history || []).map(h => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')

    const prompt = `You are a highly knowledgeable contract law assistant. Answer the user's questions about their contract clearly and in plain English. Be helpful, precise, and point out important details.

CONTRACT CONTEXT:
${contractContext}

CONVERSATION HISTORY:
${historyMessages}

User: ${message}
Assistant:`

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt,
      temperature: 0.3,
      maxTokens: 1024,
    })

    const reply = text.trim()

    // Save both messages
    await supabase.from('chat_messages').insert([
      { contract_id: contractId, user_id: user.id, role: 'user', content: message },
      { contract_id: contractId, user_id: user.id, role: 'assistant', content: reply },
    ])

    return NextResponse.json({ reply })
  } catch (err) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: 'Failed to generate response' }, { status: 500 })
  }
}
