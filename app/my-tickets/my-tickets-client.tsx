'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { formatDistanceToNow, format } from 'date-fns'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  TicketIcon, MessageSquare, Clock, CheckCircle2,
  RefreshCw, Plus, ArrowRight, Search, Mail,
  ChevronLeft, Send, Loader2, XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------- Types ----------
type Reply = {
  id: string
  author_type: 'user' | 'support'
  author_name: string
  message: string
  created_at: string
}
type Ticket = {
  id: string
  ticket_number: number
  subject: string
  category: string
  status: string
  priority: string
  message: string
  name: string
  email: string
  created_at: string
  updated_at: string
  ticket_replies?: { id: string }[] | Reply[]
}

// ---------- Helpers ----------
const statusConfig: Record<string, { label: string; dot: string; badge: string }> = {
  open:        { label: 'Open',        dot: 'bg-blue-500',   badge: 'bg-blue-50 text-blue-700 border-blue-200' },
  in_progress: { label: 'In progress', dot: 'bg-amber-500',  badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  resolved:    { label: 'Resolved',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200' },
  closed:      { label: 'Closed',      dot: 'bg-neutral-400',badge: 'bg-muted text-muted-foreground border-border' },
}
const categoryLabels: Record<string, string> = {
  general: 'General', billing: 'Billing', technical: 'Technical',
  feature: 'Feature request', bug: 'Bug report', other: 'Other',
}

// ---------- Sub-components ----------

function StatusBadge({ status }: { status: string }) {
  const cfg = statusConfig[status] ?? statusConfig.open
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

function ChatBubble({ reply, ticketName }: { reply: Reply; ticketName: string }) {
  const isSupport = reply.author_type === 'support'
  return (
    <div className={`flex gap-2.5 ${isSupport ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
        isSupport ? 'bg-primary text-primary-foreground' : 'bg-secondary text-foreground border border-border'
      }`}>
        {isSupport ? 'S' : (reply.author_name[0] ?? ticketName[0] ?? 'U').toUpperCase()}
      </div>
      {/* Bubble */}
      <div className={`flex flex-col gap-1 max-w-[78%] ${isSupport ? 'items-start' : 'items-end'}`}>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">
            {isSupport ? 'LexAI Support' : reply.author_name}
          </span>
          {isSupport && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium leading-none">Team</span>
          )}
        </div>
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words ${
          isSupport
            ? 'bg-secondary text-foreground rounded-tl-sm'
            : 'bg-primary text-primary-foreground rounded-tr-sm'
        }`}>
          {reply.message}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {format(new Date(reply.created_at), 'MMM d, h:mm a')}
        </span>
      </div>
    </div>
  )
}

// ---------- Email search form ----------
function EmailSearchForm({ onFound }: { onFound: (email: string, tickets: Ticket[]) => void }) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!email.trim()) return
    setLoading(true)
    const res = await fetch('/api/tickets/lookup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const data = await res.json()
    setLoading(false)
    if (!res.ok) { setError(data.error); return }
    onFound(email.trim().toLowerCase(), data.tickets)
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Icon */}
        <div className="w-14 h-14 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-6">
          <Search className="w-7 h-7 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-foreground text-center mb-2">Find your tickets</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Enter the email address you used when submitting a support ticket.
        </p>
        <form onSubmit={handleSearch} className="space-y-3">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="pl-9"
              required
              autoFocus
            />
          </div>
          {error && (
            <p className="text-xs text-destructive flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5" />{error}
            </p>
          )}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
            Search tickets
          </Button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Don&apos;t have a ticket?{' '}
          <Link href="/contact" className="text-primary hover:underline">Submit one here</Link>
        </p>
      </div>
    </div>
  )
}

// ---------- Ticket chat view ----------
function TicketChatView({
  ticket,
  lookupEmail,
  onBack,
}: {
  ticket: Ticket
  lookupEmail: string | null
  onBack: () => void
}) {
  const [replies, setReplies] = useState<Reply[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isClosed = ticket.status === 'closed' || ticket.status === 'resolved'
  const status = statusConfig[ticket.status] ?? statusConfig.open

  // Fetch full thread
  useEffect(() => {
    async function load() {
      setLoading(true)
      const headers: Record<string, string> = {}
      if (lookupEmail) headers['x-lookup-email'] = lookupEmail
      const res = await fetch(`/api/tickets/${ticket.id}`, { headers })
      if (res.ok) {
        const data = await res.json()
        const allReplies: Reply[] = data.ticket.ticket_replies ?? []
        // First reply = original message (treat as user bubble)
        const originalBubble: Reply = {
          id: 'original-' + ticket.id,
          author_type: 'user',
          author_name: ticket.name,
          message: ticket.message,
          created_at: ticket.created_at,
        }
        setReplies([originalBubble, ...allReplies])
      }
      setLoading(false)
    }
    load()
  }, [ticket.id, ticket.message, ticket.name, ticket.created_at, lookupEmail])

  // Scroll to bottom when replies load / new reply added
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [replies])

  async function sendReply() {
    const msg = replyText.trim()
    if (!msg || sending) return
    setSending(true)
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (lookupEmail) headers['x-lookup-email'] = lookupEmail
    const res = await fetch(`/api/tickets/${ticket.id}`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: msg, guestName: ticket.name }),
    })
    const data = await res.json()
    setSending(false)
    if (!res.ok) { toast.error(data.error); return }
    setReplies(prev => [...prev, data.reply])
    setReplyText('')
    textareaRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      sendReply()
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat header */}
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-foreground text-sm truncate">{ticket.subject}</p>
            <StatusBadge status={ticket.status} />
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
            <span>#{ticket.ticket_number}</span>
            <span>·</span>
            <span>{categoryLabels[ticket.category] ?? ticket.category}</span>
            <span>·</span>
            <span>Opened {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}</span>
          </div>
        </div>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5 space-y-5 bg-background min-h-0">
        {loading ? (
          <div className="flex items-center justify-center py-12 text-sm text-muted-foreground gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading conversation…
          </div>
        ) : (
          <>
            {replies.map(reply => (
              <ChatBubble key={reply.id} reply={reply} ticketName={ticket.name} />
            ))}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Reply input */}
      <div className="shrink-0 border-t border-border bg-card px-4 sm:px-6 py-4">
        {isClosed ? (
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
            <span>This ticket is {status.label.toLowerCase()}.</span>
            <Link href="/contact" className="ml-auto text-primary hover:underline text-xs flex items-center gap-1 shrink-0">
              New ticket <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        ) : (
          <div className="flex gap-3 items-end">
            <Textarea
              ref={textareaRef}
              rows={2}
              placeholder="Type a reply… (Ctrl+Enter to send)"
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              onKeyDown={handleKeyDown}
              className="resize-none flex-1 text-sm min-h-[60px]"
              disabled={sending}
            />
            <Button
              size="sm"
              onClick={sendReply}
              disabled={!replyText.trim() || sending}
              className="shrink-0 h-10 w-10 p-0"
              aria-label="Send reply"
            >
              {sending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Ticket list ----------
function TicketList({
  tickets,
  onSelect,
}: {
  tickets: Ticket[]
  onSelect: (ticket: Ticket) => void
}) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-12 h-12 rounded-2xl bg-accent flex items-center justify-center mx-auto mb-4">
          <TicketIcon className="w-6 h-6 text-primary" />
        </div>
        <p className="font-semibold text-foreground mb-1">No tickets found</p>
        <p className="text-sm text-muted-foreground mb-6">No support tickets are associated with this email.</p>
        <Button asChild size="sm">
          <Link href="/contact"><Plus className="w-4 h-4 mr-1.5" />New ticket</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {tickets.map(ticket => {
        const replyCount = Array.isArray(ticket.ticket_replies) ? ticket.ticket_replies.length : 0
        return (
          <button
            key={ticket.id}
            onClick={() => onSelect(ticket)}
            className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-secondary/30 transition-colors group"
          >
            <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <TicketIcon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <p className="font-semibold text-foreground text-sm truncate group-hover:text-primary transition-colors">
                    {ticket.subject}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    <span className="text-xs text-muted-foreground">#{ticket.ticket_number}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{categoryLabels[ticket.category] ?? ticket.category}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                    </span>
                    {replyCount > 0 && (
                      <>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <MessageSquare className="w-3 h-3" />
                          {replyCount}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={ticket.status} />
                  <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}

// ---------- Root component ----------
interface Props {
  initialTickets: object[]
  userId: string | null
  userEmail: string | null
  userName: string | null
}

export default function MyTicketsClient({ initialTickets, userId, userEmail, userName }: Props) {
  const [tickets, setTickets] = useState<Ticket[]>(initialTickets as Ticket[])
  const [lookupEmail, setLookupEmail] = useState<string | null>(userEmail ?? null)
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [searchMode, setSearchMode] = useState(!userId && !userEmail)

  // Stats
  const openCount = tickets.filter(t => t.status === 'open').length
  const inProgressCount = tickets.filter(t => t.status === 'in_progress').length
  const resolvedCount = tickets.filter(t => t.status === 'resolved' || t.status === 'closed').length

  function handleFound(email: string, found: Ticket[]) {
    setLookupEmail(email)
    setTickets(found)
    setSearchMode(false)
  }

  function handleReset() {
    setLookupEmail(null)
    setTickets([])
    setActiveTicket(null)
    setSearchMode(true)
  }

  // Guest: show email search
  if (searchMode) {
    return (
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <EmailSearchForm onFound={handleFound} />
      </div>
    )
  }

  // Ticket chat view
  if (activeTicket) {
    return (
      <div className="max-w-3xl mx-auto px-0 sm:px-4 lg:px-8 py-0 sm:py-6 flex flex-col" style={{ height: 'calc(100vh - 80px)' }}>
        <div className="flex-1 min-h-0 bg-card sm:rounded-2xl sm:border sm:border-border overflow-hidden flex flex-col">
          <TicketChatView
            ticket={activeTicket}
            lookupEmail={lookupEmail}
            onBack={() => setActiveTicket(null)}
          />
        </div>
      </div>
    )
  }

  // Ticket list view
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 pb-20 md:pb-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Support tickets</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {lookupEmail && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                {lookupEmail}
                {!userId && (
                  <button onClick={handleReset} className="text-primary hover:underline ml-2 text-xs">
                    Change email
                  </button>
                )}
              </span>
            )}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/contact"><Plus className="w-4 h-4 mr-1.5" />New ticket</Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[
          { label: 'Total',       count: tickets.length,   icon: TicketIcon },
          { label: 'Open',        count: openCount,         icon: MessageSquare },
          { label: 'In progress', count: inProgressCount,   icon: RefreshCw },
          { label: 'Resolved',    count: resolvedCount,     icon: CheckCircle2 },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <stat.icon className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground leading-none">{stat.count}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Ticket list */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <TicketList tickets={tickets} onSelect={setActiveTicket} />
      </div>
    </div>
  )
}
