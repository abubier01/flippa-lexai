'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Upload, FileText, X, Loader2, AlertCircle, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'sonner'

export default function UploadForm() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [textContent, setTextContent] = useState('')
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [limitReached, setLimitReached] = useState(false)
  const [activeTab, setActiveTab] = useState('file')
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (f: File) => {
    const allowed = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']
    if (!allowed.includes(f.type) && !f.name.endsWith('.txt') && !f.name.endsWith('.pdf') && !f.name.endsWith('.docx')) {
      toast.error('Only PDF, DOCX, and TXT files are supported')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('File size must be under 10 MB')
      return
    }
    setFile(f)
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ''))
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }, [title])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Please enter a contract title'); return }
    if (activeTab === 'file' && !file) { toast.error('Please select a file'); return }
    if (activeTab === 'text' && !textContent.trim()) { toast.error('Please paste contract text'); return }

    setLoading(true)
    try {
      const formData = new FormData()
      formData.append('title', title.trim())
      if (activeTab === 'file' && file) {
        formData.append('file', file)
      } else {
        formData.append('text', textContent)
        formData.append('fileName', 'pasted-text.txt')
      }

      const res = await fetch('/api/contracts/upload', { method: 'POST', body: formData })
      const data = await res.json()

      if (!res.ok) {
        if (data.limitReached) {
          setLimitReached(true)
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Upload failed')
      }

      setLoading(false)
      setAnalyzing(true)
      toast.success('Contract uploaded! Running AI analysis…')

      // Call analyze synchronously from the client so it completes before redirecting
      const analyzeRes = await fetch('/api/contracts/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: data.id }),
      })

      if (!analyzeRes.ok) {
        // Navigate anyway — the detail page will show the failed state
        console.error('[v0] Analyze failed:', await analyzeRes.text())
      }

      router.push(`/contracts/${data.id}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload failed')
      setLoading(false)
    } finally {
      setAnalyzing(false)
    }
  }

  if (limitReached) {
    return (
      <div className="bg-card rounded-xl border border-border p-8 text-center">
        <div className="w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Zap className="w-7 h-7 text-destructive" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Monthly Limit Reached</h3>
        <p className="text-muted-foreground text-sm mb-6 max-w-md mx-auto">
          You&apos;ve used all 5 contract analyses for this month on the Free plan. 
          Upgrade to Pro for unlimited analyses and AI chat.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Button asChild>
            <Link href="/settings">
              <Zap className="w-4 h-4 mr-1.5" />
              Upgrade to Pro
            </Link>
          </Button>
          <Button variant="outline" onClick={() => setLimitReached(false)}>
            Go Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Title */}
      <div className="bg-card rounded-xl border border-border p-6 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="title">Contract Title <span className="text-destructive">*</span></Label>
          <Input
            id="title"
            placeholder="e.g. Acme Corp SaaS Agreement 2025"
            value={title}
            onChange={e => setTitle(e.target.value)}
            required
          />
        </div>
      </div>

      {/* File / Text */}
      <div className="bg-card rounded-xl border border-border p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-5 w-full sm:w-auto">
            <TabsTrigger value="file" className="flex-1 sm:flex-none">Upload File</TabsTrigger>
            <TabsTrigger value="text" className="flex-1 sm:flex-none">Paste Text</TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            {!file ? (
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-primary bg-accent' : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                }`}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                onClick={() => fileRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={e => e.key === 'Enter' && fileRef.current?.click()}
                aria-label="Upload contract file"
              >
                <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm font-medium text-foreground mb-1">
                  Drop your file here or click to browse
                </p>
                <p className="text-xs text-muted-foreground">PDF, DOCX, TXT — up to 10 MB</p>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-4 p-4 rounded-xl border border-border bg-secondary/30">
                <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="text-muted-foreground hover:text-destructive p-1 rounded"
                  aria-label="Remove file"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="text">
            <div className="space-y-2">
              <Label htmlFor="text-content">Contract Text</Label>
              <Textarea
                id="text-content"
                placeholder="Paste your contract text here…"
                value={textContent}
                onChange={e => setTextContent(e.target.value)}
                rows={12}
                className="resize-none font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">{textContent.length.toLocaleString()} characters</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-border bg-accent/50">
        <AlertCircle className="w-4 h-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          Your contract is encrypted and analyzed privately. We never share or train on your data.
        </p>
      </div>

      <Button type="submit" size="lg" className="w-full h-12" disabled={loading || analyzing}>
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Uploading…
          </>
        ) : analyzing ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            AI is analyzing your contract…
          </>
        ) : (
          <>
            <Upload className="w-4 h-4 mr-2" />
            Upload & Analyze Contract
          </>
        )}
      </Button>
    </form>
  )
}
