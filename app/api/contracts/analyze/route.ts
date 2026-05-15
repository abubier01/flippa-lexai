import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createGroq } from '@ai-sdk/groq'
import { generateText } from 'ai'

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY })

export async function POST(req: NextRequest) {
  let contractId: string | undefined
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    contractId = body.contractId
    if (!contractId) return NextResponse.json({ error: 'Contract ID required' }, { status: 400 })


    // Fetch contract
    const { data: contract, error: fetchError } = await supabase
      .from('contracts')
      .select('*')
      .eq('id', contractId)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !contract) {
      return NextResponse.json({ error: 'Contract not found' }, { status: 404 })
    }

    // Mark as processing
    await supabase.from('contracts').update({ status: 'processing' }).eq('id', contractId)

    const contractText = contract.raw_text || ''
    const truncated = contractText.slice(0, 12000)

    const prompt = `You are an expert contract analyst. Analyze the following contract and respond with a valid JSON object only (no markdown, no code fences).

Contract:
"""
${truncated}
"""

Respond with this exact JSON structure:
{
  "summary": "2-3 sentence plain-English summary of what this contract is about and its key purpose",
  "risk_score": <integer 0-100, where 0=no risk and 100=extreme risk>,
  "key_points": ["point 1", "point 2", "point 3", "point 4", "point 5"],
  "risks": [
    {"title": "Risk title", "description": "Description of the risk", "severity": "high|medium|low"},
    {"title": "Risk title", "description": "Description", "severity": "high|medium|low"}
  ],
  "clauses": {
    "payment_terms": "extracted payment terms or 'Not specified'",
    "termination": "extracted termination terms or 'Not specified'",
    "liability": "extracted liability terms or 'Not specified'",
    "intellectual_property": "extracted IP terms or 'Not specified'",
    "governing_law": "extracted governing law or 'Not specified'",
    "dispute_resolution": "extracted dispute resolution or 'Not specified'"
  },
  "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
}`

    const { text } = await generateText({
      model: groq('llama-3.3-70b-versatile'),
      prompt,
      temperature: 0.2,
    })

    let analysis
    try {
      // Strip any accidental markdown fences
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      analysis = JSON.parse(cleaned)
    } catch {
      throw new Error('AI returned invalid JSON')
    }

    // Save analysis
    const { error: analysisError } = await supabase.from('contract_analyses').insert({
      contract_id: contractId,
      user_id: user.id,
      summary: analysis.summary || '',
      key_points: analysis.key_points || [],
      risks: analysis.risks || [],
      clauses: analysis.clauses || {},
      suggestions: analysis.suggestions || [],
    })

    if (analysisError) throw analysisError

    // Compute risk_score: prefer AI-provided value, but if 0 or missing derive from risk items
    const risks: { severity: string }[] = analysis.risks || []
    const weights: Record<string, number> = { high: 100, medium: 55, low: 20 }
    const derivedScore = risks.length > 0
      ? Math.min(100, Math.round(risks.reduce((sum, r) => sum + (weights[r.severity] ?? 20), 0) / risks.length))
      : 0
    const finalScore = analysis.risk_score && analysis.risk_score > 0
      ? Math.min(100, Math.max(0, analysis.risk_score))
      : derivedScore

    // Update contract status and risk score
    await supabase.from('contracts').update({
      status: 'completed',
      risk_score: finalScore,
      updated_at: new Date().toISOString(),
    }).eq('id', contractId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Analysis error:', err)
    if (contractId) {
      try {
        const supabase = await createClient()
        await supabase.from('contracts').update({ status: 'failed' }).eq('id', contractId)
      } catch {}
    }
    return NextResponse.json({ error: 'Analysis failed' }, { status: 500 })
  }
}
