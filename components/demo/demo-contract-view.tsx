'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, FileText, AlertTriangle, CheckCircle,
  ChevronDown, ChevronUp, Send, Sparkles, Lock, Shield,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatDistanceToNow, format } from 'date-fns'
import type { DEMO_CONTRACTS, DEMO_ANALYSES } from '@/lib/demo-data'

type Contract = typeof DEMO_CONTRACTS[number]
type Analysis = typeof DEMO_ANALYSES[string]
type Message = { id: string; role: 'user' | 'assistant'; content: string; created_at: string }

const RISK_DEMO_REPLIES: Record<string, string> = {
  default: "That's a great question about this contract. In a full LexAI account, I would analyse the specific clause you're asking about and provide detailed guidance, suggested redlines, and comparable market standards. Sign up free to unlock the full AI chat on your own contracts.",
}

function RiskIcon({ severity }: { severity: string }) {
  if (severity === 'high') return <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
  if (severity === 'medium') return <AlertTriangle className="w-4 h-4 text-yellow-500 shrink-0" />
  return <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
}

function severityBg(s: string) {
  if (s === 'high') return 'bg-red-50 border-red-200 text-red-700'
  if (s === 'medium') return 'bg-yellow-50 border-yellow-200 text-yellow-700'
  return 'bg-green-50 border-green-200 text-green-700'
}

function RiskCard({ risk }: { risk: Analysis['risks'][number] }) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-lg border p-4 ${severityBg(risk.severity)}`}>
      <button
        className="w-full flex items-start gap-3 text-left"
        onClick={() => setOpen(o => !o)}
      >
        <RiskIcon severity={risk.severity} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{risk.title}</p>
          <p className="text-xs mt-0.5 opacity-80 line-clamp-2">{risk.description}</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 shrink-0 opacity-60" /> : <ChevronDown className="w-4 h-4 shrink-0 opacity-60" />}
      </button>
      {open && risk.clause && (
        <div className="mt-3 pt-3 border-t border-current/20">
          <p className="text-xs font-medium opacity-70 mb-1">Relevant clause</p>
          <blockquote className="text-xs italic opacity-80 border-l-2 border-current/30 pl-3">
            {risk.clause}
          </blockquote>
        </div>
      )}
    </div>
  )
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold ${
        isUser ? 'bg-primary text-primary-foreground' : 'bg-accent border border-border text-primary'
      }`}>
        {isUser ? 'A' : <Sparkles className="w-3.5 h-3.5" />}
      </div>
      <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm'
          : 'bg-card border border-border text-foreground rounded-tl-sm'
      }`}>
        {msg.content.split('\n').map((line, i) => {
          // Bold markdown
          const parts = line.split(/(\*\*[^*]+\*\*)/)
          return (
            <p key={i} className={i > 0 ? 'mt-1' : ''}>
              {parts.map((p, j) =>
                p.startsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : p
              )}
            </p>
          )
        })}
        <p className={`text-xs mt-1.5 ${isUser ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
          {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

interface Props {
  contract: Contract
  analysis: Analysis | null
  initialMessages: Message[]
}

export default function DemoContractView({ contract, analysis, initialMessages }: Props) {
  const [activeTab, setActiveTab] = useState<'summary' | 'risks' | 'chat'>('summary')
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showUpsell, setShowUpsell] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const highRisks = analysis?.risks.filter(r => r.severity === 'high') ?? []
  const medRisks = analysis?.risks.filter(r => r.severity === 'medium') ?? []
  const lowRisks = analysis?.risks.filter(r => r.severity === 'low') ?? []

  function riskColor(score: number) {
    if (score >= 70) return 'text-red-600'
    if (score >= 40) return 'text-yellow-600'
    return 'text-green-600'
  }

  async function sendMessage() {
    if (!input.trim() || sending) return
    const userMsg: Message = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: input.trim(),
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setSending(true)

    // Simulate streaming delay then show demo response + upsell
    await new Promise(r => setTimeout(r, 1200))

    const aiMsg: Message = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: RISK_DEMO_REPLIES.default,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, aiMsg])
    setSending(false)
    setShowUpsell(true)
  }

  const tabs = [
    { key: 'summary', label: 'Summary & Terms' },
    { key: 'risks', label: `Risks (${analysis?.risks.length ?? 0})` },
    { key: 'chat', label: 'AI Chat' },
  ] as const

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Back + title */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" asChild className="-ml-2 shrink-0">
          <Link href="/demo/contracts">
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold text-foreground truncate">{contract.title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {contract.file_name} · Uploaded {formatDistanceToNow(new Date(contract.created_at), { addSuffix: true })}
          </p>
        </div>
        {contract.risk_score !== null && (
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted-foreground">Risk Score</p>
            <p className={`text-2xl font-bold ${riskColor(contract.risk_score)}`}>{contract.risk_score}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === t.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Summary tab */}
      {activeTab === 'summary' && analysis && (
        <div className="space-y-6">
          {/* Risk overview chips */}
          <div className="flex flex-wrap gap-2">
            {highRisks.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700">
                <AlertTriangle className="w-3 h-3" />
                {highRisks.length} High Risk
              </span>
            )}
            {medRisks.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-yellow-50 border border-yellow-200 text-yellow-700">
                <AlertTriangle className="w-3 h-3" />
                {medRisks.length} Medium Risk
              </span>
            )}
            {lowRisks.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-green-50 border border-green-200 text-green-700">
                <CheckCircle className="w-3 h-3" />
                {lowRisks.length} Low Risk
              </span>
            )}
          </div>

          {/* Summary */}
          <div className="bg-card rounded-xl border border-border p-6 space-y-3">
            <h3 className="font-semibold text-foreground flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" />
              AI Summary
            </h3>
            <p className="text-sm text-foreground leading-relaxed">{analysis.summary}</p>
            {analysis.contract_type && (
              <p className="text-xs text-muted-foreground">Type: <span className="text-foreground font-medium">{analysis.contract_type}</span></p>
            )}
          </div>

          {/* Key terms */}
          {analysis.key_terms.length > 0 && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-semibold text-foreground flex items-center gap-2">
                <Shield className="w-4 h-4 text-primary" />
                Key Terms
              </h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {analysis.key_terms.map(({ term, value }) => (
                  <div key={term} className="bg-secondary/50 rounded-lg px-4 py-3">
                    <dt className="text-xs font-medium text-muted-foreground">{term}</dt>
                    <dd className="text-sm font-semibold text-foreground mt-0.5">{value}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {/* Parties + dates */}
          {(analysis.parties.length > 0 || analysis.effective_date) && (
            <div className="bg-card rounded-xl border border-border p-6 space-y-4">
              <h3 className="font-semibold text-foreground">Parties & Dates</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {analysis.parties.map((p, i) => (
                  <div key={i} className="bg-secondary/50 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-foreground">Party {i + 1}</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{p}</p>
                  </div>
                ))}
                {analysis.effective_date && (
                  <div className="bg-secondary/50 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-foreground">Effective Date</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{format(new Date(analysis.effective_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {analysis.expiration_date && (
                  <div className="bg-secondary/50 rounded-lg px-4 py-3">
                    <p className="text-xs text-muted-foreground">Expiration Date</p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{format(new Date(analysis.expiration_date), 'MMM d, yyyy')}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Risks tab */}
      {activeTab === 'risks' && analysis && (
        <div className="space-y-4">
          {analysis.risks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
              <p className="font-medium text-foreground">No risks detected</p>
              <p className="text-sm">This contract looks clean.</p>
            </div>
          ) : (
            <>
              {highRisks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">High Risk</p>
                  {highRisks.map((r, i) => <RiskCard key={i} risk={r} />)}
                </div>
              )}
              {medRisks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">Medium Risk</p>
                  {medRisks.map((r, i) => <RiskCard key={i} risk={r} />)}
                </div>
              )}
              {lowRisks.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mt-4">Low Risk</p>
                  {lowRisks.map((r, i) => <RiskCard key={i} risk={r} />)}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Chat tab */}
      {activeTab === 'chat' && (
        <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col" style={{ height: '520px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <div className="w-12 h-12 rounded-full bg-accent flex items-center justify-center">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <p className="font-medium text-foreground">Ask anything about this contract</p>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Try asking: "What are the biggest risks?" or "Can you suggest redline language?"
                </p>
              </div>
            )}
            {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
            {sending && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-accent border border-border flex items-center justify-center">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Upsell nudge */}
          {showUpsell && (
            <div className="px-4 py-2 bg-primary/5 border-t border-primary/10 flex items-center justify-between gap-4">
              <p className="text-xs text-muted-foreground">
                <Lock className="w-3 h-3 inline mr-1" />
                Full AI chat is available on real contracts after sign-up.
              </p>
              <Link href="/auth/sign-up" className="text-xs font-semibold text-primary hover:underline whitespace-nowrap">
                Sign up free
              </Link>
            </div>
          )}

          {/* Input */}
          <div className="border-t border-border p-3 flex gap-2">
            <input
              className="flex-1 text-sm bg-secondary/50 border border-border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-primary/20 placeholder:text-muted-foreground"
              placeholder="Ask about this contract..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={sending}
            />
            <Button size="sm" onClick={sendMessage} disabled={sending || !input.trim()} className="shrink-0">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
