'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Upload, FileText, CheckCircle, ArrowRight, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

type Stage = 'idle' | 'uploading' | 'processing' | 'done'

export default function DemoUploadPage() {
  const [stage, setStage] = useState<Stage>('idle')
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  function simulateUpload(name: string) {
    setFileName(name)
    setStage('uploading')
    setProgress(0)

    // Fake upload progress
    let p = 0
    const up = setInterval(() => {
      p += Math.random() * 18 + 8
      if (p >= 100) {
        p = 100
        clearInterval(up)
        setProgress(100)
        setStage('processing')

        // Fake processing
        setTimeout(() => setStage('done'), 2800)
      }
      setProgress(Math.min(p, 100))
    }, 180)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) simulateUpload(file.name)
  }, [])

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) simulateUpload(file.name)
  }

  if (stage === 'done') {
    return (
      <div className="max-w-lg mx-auto mt-12 space-y-6">
        <div className="bg-card rounded-2xl border border-border p-10 flex flex-col items-center text-center gap-5">
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Analysis Complete!</h2>
            <p className="text-sm text-muted-foreground mt-2">
              <span className="font-medium">{fileName}</span> has been analysed. In the real app, you would see the full AI risk report right now.
            </p>
          </div>
          <div className="w-full bg-primary/5 border border-primary/20 rounded-xl p-5 text-left space-y-2">
            <div className="flex items-center gap-2 text-primary">
              <Lock className="w-4 h-4" />
              <p className="text-sm font-semibold">Sign up to unlock your real analysis</p>
            </div>
            <p className="text-xs text-muted-foreground">
              Create a free account to upload your own contracts and get full AI-powered risk breakdowns, key term extraction, and clause-level chat.
            </p>
          </div>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/auth/sign-up">
                Get started free
                <ArrowRight className="w-4 h-4 ml-1.5" />
              </Link>
            </Button>
            <Button variant="outline" onClick={() => { setStage('idle'); setFileName(null); setProgress(0) }}>
              Try another
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-foreground">Upload a Contract</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Try uploading any PDF or DOCX — we&apos;ll simulate the analysis process.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-5 transition-colors ${
          isDragging ? 'border-primary bg-primary/5' : 'border-border bg-card hover:border-primary/50'
        } ${stage !== 'idle' ? 'pointer-events-none' : ''}`}
      >
        {stage === 'idle' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-accent flex items-center justify-center">
              <Upload className="w-8 h-8 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground text-lg">Drop your contract here</p>
              <p className="text-sm text-muted-foreground mt-1">or click to browse — PDF, DOCX, TXT supported</p>
            </div>
            <label className="cursor-pointer">
              <span className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors">
                <FileText className="w-4 h-4" />
                Choose file
              </span>
              <input type="file" accept=".pdf,.docx,.txt" className="sr-only" onChange={onFileSelect} />
            </label>
          </>
        )}

        {stage === 'uploading' && (
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <FileText className="w-7 h-7 text-primary" />
            </div>
            <p className="font-medium text-foreground">{fileName}</p>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Uploading...</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-primary rounded-full transition-all duration-150" style={{ width: `${progress}%` }} />
              </div>
            </div>
          </div>
        )}

        {stage === 'processing' && (
          <div className="w-full max-w-sm space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
              <div className="w-7 h-7 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            </div>
            <p className="font-semibold text-foreground">Analysing with AI...</p>
            <div className="space-y-2 text-left">
              {['Parsing document structure', 'Extracting key clauses', 'Identifying risk factors', 'Generating summary'].map((step, i) => (
                <div key={step} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-4 h-4 rounded-full border border-primary/30 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" style={{ animationDelay: `${i * 200}ms` }} />
                  </div>
                  {step}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Demo notice */}
      <div className="flex items-start gap-3 bg-accent/50 border border-border rounded-xl p-4">
        <Lock className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-medium text-foreground">Demo mode</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Uploaded files are not saved or processed in demo mode. <Link href="/auth/sign-up" className="text-primary hover:underline font-medium">Sign up free</Link> to analyse your real contracts.
          </p>
        </div>
      </div>
    </div>
  )
}
