'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Send, Loader2, Bot, User, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { toast } from 'sonner'
import { useRateLimitCountdown } from '@/hooks/use-rate-limit-countdown'
import type { ChatMessage } from '@/lib/types'

interface Props {
  contractId: string
  initialMessages: ChatMessage[]
  readOnly?: boolean
}

const SUGGESTED_QUESTIONS = [
  'What are the main obligations of each party?',
  'What are the termination conditions?',
  'Are there any automatic renewal clauses?',
  'What happens if there is a dispute?',
]

export default function ContractChatTab({ contractId, initialMessages, readOnly = false }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [retryAfter, setRetryAfter] = useState<{ seconds: number; limit: string | null } | null>(null)
  const [quotaReached, setQuotaReached] = useState(false)
  const [quotaMessage, setQuotaMessage] = useState<string | null>(null)
  const countdown = useRateLimitCountdown(
    retryAfter?.seconds ?? 0,
    () => setRetryAfter(null),
  )
  const bottomRef = useRef<HTMLDivElement>(null)
  const localIdRef = useRef(0)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage(msg?: string) {
    if (readOnly) return
    const text = (msg ?? input).trim()
    if (!text || loading) return
    setInput('')
    setLoading(true)
    localIdRef.current += 1
    const userMsgId = `local-user-${localIdRef.current}`

    const userMsg: ChatMessage = {
      id: userMsgId,
      contract_id: contractId,
      user_id: '',
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])

    try {
      const res = await fetch('/api/contracts/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, message: text }),
      })
      if (res.status === 429) {
        const seconds = Number(res.headers.get('retry-after') ?? '0')
        const limit = res.headers.get('x-ratelimit-limit')
        setRetryAfter({ seconds, limit })
        setMessages((prev) => prev.slice(0, -1))
        setLoading(false)
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({} as { error?: string; limitReached?: boolean }))
        if (data.limitReached) {
          setQuotaReached(true)
          setQuotaMessage(data.error ?? null)
          setMessages((prev) => prev.slice(0, -1))
          setLoading(false)
          return
        }
        throw new Error(data.error || 'Failed to get response')
      }

      if (!res.body) throw new Error('No response body from chat stream')

      const assistantId = `local-assistant-${localIdRef.current}`
      const assistantMsg: ChatMessage = {
        id: `local-assistant-${localIdRef.current}`,
        contract_id: contractId,
        user_id: '',
        role: 'assistant',
        content: '',
        created_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, assistantMsg])

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let reply = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
        setMessages(prev =>
          prev.map(m => (m.id === assistantId ? { ...m, content: reply } : m)),
        )
      }
      reply += decoder.decode()

      if (!reply.trim()) {
        setMessages(prev => prev.filter(m => m.id !== assistantId))
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message')
      setMessages(prev => prev.filter(m => m.id !== userMsg.id))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden flex flex-col" style={{ height: '600px' }}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-border flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
          <Bot className="w-4 h-4 text-primary" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Contract AI Assistant</p>
          <p className="text-xs text-muted-foreground">Ask anything about this contract</p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-green-500" />
          <span className="text-xs text-muted-foreground">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {readOnly && (
          <div className="rounded-md border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
            You can view this conversation but only the contract owner can send messages.
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground mb-1">Ask me anything about this contract</p>
              <p className="text-xs text-muted-foreground">I have full context of the document and its analysis</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg mt-2">
              {SUGGESTED_QUESTIONS.map(q => (
                <button
                  key={q}
                  onClick={() => sendMessage(q)}
                  disabled={readOnly}
                  className="text-left text-xs text-muted-foreground p-3 rounded-lg border border-border hover:border-primary/30 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:border-border"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map(message => (
              <div
                key={message.id}
                className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  message.role === 'user' ? 'bg-primary' : 'bg-accent border border-primary/20'
                }`}>
                  {message.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-primary-foreground" />
                    : <Bot className="w-3.5 h-3.5 text-primary" />
                  }
                </div>
                <div className={`max-w-[75%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-sm'
                    : 'bg-secondary text-foreground rounded-tl-sm prose-ai'
                }`}>
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full bg-accent border border-primary/20 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-primary" />
                </div>
                <div className="bg-secondary rounded-2xl rounded-tl-sm px-4 py-3">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border p-4">
        {quotaReached ? (
          <div className="flex items-center justify-between gap-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <div className="flex items-center gap-3">
              <Zap className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-foreground">
                {quotaMessage ?? "You’ve reached your message limit for this contract."}
              </p>
            </div>
            <Button asChild size="sm">
              <Link href="/settings">Upgrade to Pro</Link>
            </Button>
          </div>
        ) : (
          <>
            {countdown.isActive && (
              <Alert variant="destructive" className="mb-3">
                <AlertTitle>You&apos;ve reached the chat limit</AlertTitle>
                <AlertDescription>
                  {retryAfter?.limit
                    ? `Limit: ${retryAfter.limit} messages per 15 minutes. `
                    : ''}
                  Try again in {countdown.label}.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-end gap-3">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                placeholder={readOnly ? 'Chat is read-only for shared contracts' : 'Ask about this contract…'}
                rows={1}
                className="resize-none flex-1 min-h-0 max-h-32 py-2.5"
                disabled={countdown.isActive || quotaReached || readOnly || loading}
              />
              <Button
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={() => sendMessage()}
                disabled={countdown.isActive || quotaReached || readOnly || loading || !input.trim()}
                aria-label="Send message"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Press Enter to send, Shift+Enter for new line</p>
          </>
        )}
      </div>
    </div>
  )
}
