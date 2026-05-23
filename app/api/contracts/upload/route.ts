import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan } from '@/lib/plan/access'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, getClientIp, rateLimitHeaders } from '@/lib/security/rate-limit'

const MAX_FILE_BYTES = 10 * 1024 * 1024   // 10 MB — matches client validation
const MAX_TEXT_CHARS = 50_000              // ~50 KB raw text, ~12 pages of contract

// Dynamic import for server-side document parsing
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const pdfParse = (await import('pdf-parse')).default
  const data = await pdfParse(buffer)
  return data.text || ''
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  const mammoth = await import('mammoth')
  const result = await mammoth.extractRawText({ buffer })
  return result.value || ''
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const ip = getClientIp(req)
    const limitResult = consumeRateLimit({
      key: `contract:upload:${user.id}:${ip}`,
      limit: 10,
      windowMs: 60 * 60 * 1000,  // 1 hour
    })
    if (!limitResult.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads. Please try again later.' },
        { status: 429, headers: rateLimitHeaders(limitResult) }
      )
    }

    // Fetch user profile and check plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, contracts_this_month, usage_reset_at')
      .eq('id', user.id)
      .single()

    const active = await getActivePlan(user.id)
    const plan = active.tier
    const limits = PLAN_LIMITS[plan]
    let contractsThisMonth = profile?.contracts_this_month || 0
    const usageResetAt = profile?.usage_reset_at ? new Date(profile.usage_reset_at) : new Date()

    // Check if we need to reset monthly counter
    const now = new Date()
    const monthsSinceReset = (now.getFullYear() - usageResetAt.getFullYear()) * 12 + 
                             (now.getMonth() - usageResetAt.getMonth())
    if (monthsSinceReset >= 1) {
      contractsThisMonth = 0
      await supabase.from('profiles').update({
        contracts_this_month: 0,
        usage_reset_at: now.toISOString(),
      }).eq('id', user.id)
    }

    // Check contract limit
    if (limits.contractsPerMonth !== -1 && contractsThisMonth >= limits.contractsPerMonth) {
      return NextResponse.json({ 
        error: `You've reached your monthly limit of ${limits.contractsPerMonth} contract analyses. Upgrade to Pro for unlimited analyses.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }

    const formData = await req.formData()
    const title = formData.get('title') as string
    const file = formData.get('file') as File | null
    const text = formData.get('text') as string | null
    const fileName = formData.get('fileName') as string | null

    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

    if (text !== null && typeof text !== 'string') {
      return NextResponse.json({ error: 'Invalid text field' }, { status: 400 })
    }

    if (file && file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10 MB.' },
        { status: 413 }
      )
    }
    if (text && text.length > MAX_TEXT_CHARS) {
      return NextResponse.json(
        { error: `Text too long. Maximum is ${MAX_TEXT_CHARS.toLocaleString('en-US')} characters (~12 pages). For longer contracts, please upload the PDF.` },
        { status: 413 }
      )
    }

    let rawText = ''
    let actualFileName = ''
    let fileSize = 0

    if (file) {
      actualFileName = file.name
      fileSize = file.size
      const fileNameLower = file.name.toLowerCase()

      if (file.type === 'text/plain' || fileNameLower.endsWith('.txt')) {
        // Plain text files - read directly
        rawText = await file.text()
      } else if (file.type === 'application/pdf' || fileNameLower.endsWith('.pdf')) {
        // PDF files - extract text using pdf-parse
        const buffer = Buffer.from(await file.arrayBuffer())
        try {
          rawText = await extractTextFromPDF(buffer)
        } catch (err) {
          console.error('PDF parsing error:', err)
          return NextResponse.json({
            error: 'Could not read this PDF. It may be corrupted or password-protected.',
          }, { status: 422 })
        }
        if (!rawText.trim()) {
          return NextResponse.json({
            error: 'This PDF appears to be image-based or scanned. Please paste the text directly, or upload a text-based PDF.',
          }, { status: 422 })
        }
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileNameLower.endsWith('.docx')
      ) {
        // DOCX files - extract text using mammoth
        const buffer = Buffer.from(await file.arrayBuffer())
        try {
          rawText = await extractTextFromDOCX(buffer)
        } catch (err) {
          console.error('DOCX parsing error:', err)
          return NextResponse.json({
            error: 'Could not read this DOCX file. It may be corrupted.',
          }, { status: 422 })
        }
        if (!rawText.trim()) {
          return NextResponse.json({
            error: 'This DOCX appears to have no extractable text. Please paste the text directly.',
          }, { status: 422 })
        }
      } else if (fileNameLower.endsWith('.doc')) {
        // Legacy .doc files - not supported by mammoth, return message
        rawText = `[Legacy DOC file uploaded: ${file.name}]\n\nNote: Legacy .doc format is not fully supported. Please convert to .docx or paste the text directly for best results.`
      } else {
        // Unknown format
        rawText = `[File uploaded: ${file.name}]\n\nThis file type is not fully supported. Please upload PDF, DOCX, or TXT files, or paste the contract text directly.`
      }
    } else if (text) {
      rawText = text
      actualFileName = fileName || 'pasted-text.txt'
      fileSize = new Blob([text]).size
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }

    // Insert contract record
    const { data: contract, error } = await supabase
      .from('contracts')
      .insert({
        user_id: user.id,
        title,
        file_name: actualFileName,
        file_size: fileSize,
        raw_text: rawText,
        status: 'pending',
        risk_score: 0,
      })
      .select()
      .single()

    if (error) throw error

    // Increment monthly usage counter
    await supabase.from('profiles').update({
      contracts_this_month: contractsThisMonth + 1,
    }).eq('id', user.id)

    const headers: Record<string, string> = {}
    // TODO: 12000 is duplicated from analyze/route.ts:57. Extract to a shared
    // constant in lib/llm/limits.ts (e.g., ANALYZE_TRUNCATION_CHARS) so this
    // header stays in sync if the analyzer window changes. Out of scope for this
    // PR — file the cleanup as a follow-up.
    if (rawText.length > 12000) {
      headers['X-Lexai-Truncated'] = 'analysis-window-exceeded'
    }
    return NextResponse.json({ id: contract.id }, { headers })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Failed to upload contract' }, { status: 500 })
  }
}
