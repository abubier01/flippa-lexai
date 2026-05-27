import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActivePlan } from '@/lib/plan/access'
import { PLAN_LIMITS } from '@/lib/plan-limits'
import { consumeRateLimit, rateLimitHeaders } from '@/lib/security/rate-limit'
import { ANALYZE_TRUNCATION_CHARS } from '@/lib/llm/limits'
import { logger } from '@/lib/log/request'
import { withQuotaClaim } from '@/lib/quota'
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_BYTES_LABEL } from '@/lib/constants/upload-limits'

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

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    userId = user.id
    const ulog = rlog.child({ userId })

    let active: Awaited<ReturnType<typeof getActivePlan>> = { tier: 'solo', status: 'fallback' }
    try {
      active = await getActivePlan(user.id)
    } catch (err) {
      ulog.warn('upload.plan_lookup_failed_fallback_solo', { err })
    }
    const tier = active.tier ?? 'solo'
    const rl = await consumeRateLimit({
      action: 'upload',
      userId: user.id,
      tier,
    })
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Too many uploads', limitReached: true },
        { status: 429, headers: rateLimitHeaders(rl) },
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

    if (file && file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_UPLOAD_BYTES_LABEL}.` },
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
    const plan = tier
    const limits = PLAN_LIMITS[plan]

    type UploadResult =
      | { status: 422; error: string }
      | { status: 415; error: string }
      | { id: string; truncated: boolean }

    const claimResult = await withQuotaClaim<UploadResult>(
      supabase,
      limits.contractsPerMonth,
      async () => {
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
              return {
                ok: false,
                value: {
                  status: 422 as const,
                  error: 'Could not read this PDF. It may be corrupted or password-protected.',
                },
              }
            }
            if (!rawText.trim()) {
              return {
                ok: false,
                value: {
                  status: 422 as const,
                  error: 'This PDF appears to be image-based or scanned. Please paste the text directly, or upload a text-based PDF.',
                },
              }
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
              return {
                ok: false,
                value: {
                  status: 422 as const,
                  error: 'Could not read this DOCX file. It may be corrupted.',
                },
              }
            }
            if (!rawText.trim()) {
              return {
                ok: false,
                value: {
                  status: 422 as const,
                  error: 'This DOCX appears to have no extractable text. Please paste the text directly.',
                },
              }
            }
          } else if (fileNameLower.endsWith('.doc')) {
            // Legacy .doc files - not supported by mammoth. Reject with 415
            // instead of inserting a placeholder body that downstream code
            // would analyze as if it were the real contract.
            return {
              ok: false,
              value: {
                status: 415 as const,
                error:
                  'Legacy .doc format not supported. Please save as .docx, .pdf, or paste the text directly.',
              },
            }
          } else {
            // Unknown format - reject with 415 rather than silently accepting
            // a placeholder body (audit P3 hardening).
            return {
              ok: false,
              value: {
                status: 415 as const,
                error:
                  'Unsupported file type. Please upload PDF, DOCX, or TXT, or paste the contract text directly.',
              },
            }
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

        return {
          ok: true,
          value: {
            id: contract.id,
            truncated: rawText.length > ANALYZE_TRUNCATION_CHARS,
          },
        }
      },
    )

    if (claimResult.kind === 'denied') {
      return NextResponse.json({
        error: `You've reached your monthly limit of ${limits.contractsPerMonth} contract analyses. Upgrade to Pro for unlimited analyses.`,
        limitReached: true,
        plan,
      }, { status: 403 })
    }
    if (claimResult.kind === 'claim_error') {
      ulog.error('upload.claim.failed', { err: new Error(claimResult.error) })
      return NextResponse.json({ error: 'Failed to check quota' }, { status: 500 })
    }

    const out = claimResult.result
    if ('status' in out) {
      return NextResponse.json({ error: out.error }, { status: out.status })
    }

    const headers: Record<string, string> = out.truncated
      ? { 'X-Lexai-Truncated': 'analysis-window-exceeded' }
      : {}
    return NextResponse.json({ id: out.id }, { headers })
  } catch (err) {
    rlog.error('upload.failed', { err, ...(userId ? { userId } : {}) })
    return NextResponse.json({ error: 'Failed to upload contract' }, { status: 500 })
  }
}
