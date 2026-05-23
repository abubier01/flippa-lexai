import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan } from '@/lib/plan/access'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, getClientIp, rateLimitHeaders } from '@/lib/security/rate-limit'
import { ANALYZE_TRUNCATION_CHARS } from '@/lib/llm/limits'
import { logger } from '@/lib/log/request'

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
  const rlog = logger(req, 'contracts.upload')
  let userId: string | undefined
  // release() is hoisted so the outer catch block can call it even if the
  // claim succeeded but the DB insert (or any subsequent step) threw.
  // Before the claim is made, release() is a no-op.
  let release: () => Promise<void> = async () => {}

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    const ulog = rlog.child({ userId })

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

    // Parse form data and run pre-claim validations (size cap, title, text-type)
    // BEFORE claiming a quota slot — these guards must not consume quota.
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

    if (!file && !text) {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }

    // Claim a quota slot atomically. The RPC resets the monthly counter if the
    // month rolled over, increments it if under the limit, and returns whether
    // the call is allowed. This replaces the old read-modify-write pattern
    // (audit finding #7).
    const active = await getActivePlan(user.id)
    const plan = active.tier
    const limits = PLAN_LIMITS[plan]

    const { data: claim, error: claimError } = await supabase
      .rpc('claim_monthly_contract', {
        p_limit: limits.contractsPerMonth,
      })
      .single<{ allowed: boolean; current_count: number }>()

    if (claimError) {
      ulog.error('upload.claim.failed', { err: new Error(claimError.message) })
      return NextResponse.json({ error: 'Failed to check quota' }, { status: 500 })
    }

    if (!claim?.allowed) {
      return NextResponse.json({
        error: `You've reached your monthly limit of ${limits.contractsPerMonth} contract analyses. Upgrade to Pro for unlimited analyses.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }

    // From here on, ANY failure path must release the claim.
    // Wire up the outer release() so the catch block can also call it.
    let claimReleased = false
    release = async () => {
      if (claimReleased) return
      claimReleased = true
      await supabase.rpc('release_monthly_contract').then(
        () => {},
        (err) => {
          ulog.error('upload.claim.release.failed', {
            err: err instanceof Error ? err : new Error(String(err)),
          })
        }
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
          ulog.error('upload.pdf-parse.failed', { err })
          await release()
          return NextResponse.json({
            error: 'Could not read this PDF. It may be corrupted or password-protected.',
          }, { status: 422 })
        }
        if (!rawText.trim()) {
          await release()
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
          ulog.error('upload.docx-parse.failed', { err })
          await release()
          return NextResponse.json({
            error: 'Could not read this DOCX file. It may be corrupted.',
          }, { status: 422 })
        }
        if (!rawText.trim()) {
          await release()
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
    } else {
      // text is guaranteed non-null here (the !file && !text guard above returned early)
      rawText = text!
      actualFileName = fileName || 'pasted-text.txt'
      fileSize = new Blob([text!]).size
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

    const headers: Record<string, string> = {}
    if (rawText.length > ANALYZE_TRUNCATION_CHARS) {
      headers['X-Lexai-Truncated'] = 'analysis-window-exceeded'
    }
    return NextResponse.json({ id: contract.id }, { headers })
  } catch (err) {
    rlog.error('upload.failed', { err, ...(userId ? { userId } : {}) })
    await release()
    return NextResponse.json({ error: 'Failed to upload contract' }, { status: 500 })
  }
}
