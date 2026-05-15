import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PLAN_LIMITS, type PlanType } from '@/lib/plan-limits'

// Dynamic import for server-side document parsing
async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import('pdf-parse')).default
    const data = await pdfParse(buffer)
    return data.text || ''
  } catch (err) {
    console.error('[v0] PDF parsing error:', err)
    return ''
  }
}

async function extractTextFromDOCX(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer })
    return result.value || ''
  } catch (err) {
    console.error('[v0] DOCX parsing error:', err)
    return ''
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Fetch user profile and check plan limits
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, contracts_this_month, usage_reset_at')
      .eq('id', user.id)
      .single()

    const plan = (profile?.plan || 'free') as PlanType
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
        rawText = await extractTextFromPDF(buffer)
        if (!rawText.trim()) {
          rawText = `[PDF file uploaded: ${file.name}]\n\nThe PDF text could not be fully extracted. It may be an image-based or scanned document.`
        }
      } else if (
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        fileNameLower.endsWith('.docx')
      ) {
        // DOCX files - extract text using mammoth
        const buffer = Buffer.from(await file.arrayBuffer())
        rawText = await extractTextFromDOCX(buffer)
        if (!rawText.trim()) {
          rawText = `[DOCX file uploaded: ${file.name}]\n\nThe document text could not be fully extracted.`
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

    return NextResponse.json({ id: contract.id })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Failed to upload contract' }, { status: 500 })
  }
}
