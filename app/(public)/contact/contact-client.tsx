'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Mail, MessageSquare, Clock, CheckCircle2, ArrowRight,
  Building2, Shield, Zap, TicketIcon
} from 'lucide-react'

const categories = [
  { value: 'general', label: 'General question' },
  { value: 'billing', label: 'Billing & payments' },
  { value: 'technical', label: 'Technical issue' },
  { value: 'feature', label: 'Feature request' },
  { value: 'bug', label: 'Bug report' },
  { value: 'other', label: 'Other' },
]

const contactCards = [
  {
    icon: Mail,
    title: 'Email support',
    description: 'For general inquiries and non-urgent issues.',
    detail: 'hello@lexai.app',
    href: 'mailto:hello@lexai.app',
  },
  {
    icon: Shield,
    title: 'Legal & privacy',
    description: 'Data requests, DPA inquiries, compliance questions.',
    detail: 'legal@lexai.app',
    href: 'mailto:legal@lexai.app',
  },
  {
    icon: Building2,
    title: 'Enterprise sales',
    description: 'Custom contracts, onboarding, and volume pricing.',
    detail: 'sales@lexai.app',
    href: 'mailto:sales@lexai.app',
  },
]

interface FormState {
  name: string
  email: string
  subject: string
  category: string
  message: string
}

export default function ContactClient() {
  const [form, setForm] = useState<FormState>({
    name: '', email: '', subject: '', category: 'general', message: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState<{ ticketNumber: number; id: string } | null>(null)
  const [error, setError] = useState('')

  function update(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
    if (error) setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    const res = await fetch('/api/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const data = await res.json()
    setSubmitting(false)

    if (!res.ok) {
      setError(data.error || 'Something went wrong. Please try again.')
      return
    }

    setSubmitted({ ticketNumber: data.ticketNumber, id: data.id })
  }

  if (submitted) {
    return (
      <div className="bg-background">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-3">Message received!</h2>
          <p className="text-muted-foreground mb-2">
            Your ticket <span className="font-semibold text-foreground">#{submitted.ticketNumber}</span> has been created.
            We typically respond within a few hours.
          </p>
          <p className="text-sm text-muted-foreground mb-8">
            Check your inbox for a confirmation — or track your ticket status below.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild>
              <Link href="/my-tickets">
                <TicketIcon className="w-4 h-4 mr-1.5" />
                View my tickets
              </Link>
            </Button>
            <Button variant="outline" onClick={() => { setSubmitted(null); setForm({ name: '', email: '', subject: '', category: 'general', message: '' }) }}>
              Submit another
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-background">
      {/* Hero */}
      <section className="border-b border-border bg-secondary/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-primary text-xs font-medium border border-primary/10 mb-6">
            <MessageSquare className="w-3.5 h-3.5" />
            Get in touch
          </div>
          <h1 className="text-4xl font-bold text-foreground mb-4 text-balance">
            How can we help?
          </h1>
          <p className="text-muted-foreground max-w-xl mx-auto text-pretty">
            Submit a ticket and our team will get back to you. You can also track the status of your open tickets anytime.
          </p>
          <div className="flex items-center justify-center gap-6 mt-6 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-primary" />
              Typical response: &lt; 4 hours
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-primary" />
              99% satisfaction rate
            </span>
          </div>
        </div>
      </section>

      {/* Contact cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid sm:grid-cols-3 gap-4 mb-14">
          {contactCards.map(card => (
            <a
              key={card.title}
              href={card.href}
              className="group bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:bg-accent/30 transition-all"
            >
              <div className="w-9 h-9 rounded-lg bg-accent flex items-center justify-center mb-3">
                <card.icon className="w-4.5 h-4.5 text-primary" />
              </div>
              <p className="font-semibold text-foreground text-sm mb-1">{card.title}</p>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{card.description}</p>
              <p className="text-xs font-medium text-primary group-hover:underline">{card.detail}</p>
            </a>
          ))}
        </div>

        {/* Main form + sidebar layout */}
        <div className="flex flex-col lg:flex-row gap-10">

          {/* Form */}
          <div className="flex-1">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-6 py-5 border-b border-border">
                <h2 className="font-semibold text-foreground">Submit a support ticket</h2>
                <p className="text-xs text-muted-foreground mt-0.5">We&apos;ll respond to your email within 24 hours.</p>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                {/* Name + Email */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name <span className="text-destructive">*</span></Label>
                    <Input
                      id="name"
                      placeholder="Jane Smith"
                      value={form.name}
                      onChange={e => update('name', e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email address <span className="text-destructive">*</span></Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="jane@company.com"
                      value={form.email}
                      onChange={e => update('email', e.target.value)}
                      required
                    />
                  </div>
                </div>

                {/* Category */}
                <div className="space-y-1.5">
                  <Label htmlFor="category">Category</Label>
                  <select
                    id="category"
                    value={form.category}
                    onChange={e => update('category', e.target.value)}
                    className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {categories.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>

                {/* Subject */}
                <div className="space-y-1.5">
                  <Label htmlFor="subject">Subject <span className="text-destructive">*</span></Label>
                  <Input
                    id="subject"
                    placeholder="Brief description of your issue"
                    value={form.subject}
                    onChange={e => update('subject', e.target.value)}
                    required
                  />
                </div>

                {/* Message */}
                <div className="space-y-1.5">
                  <Label htmlFor="message">
                    Message <span className="text-destructive">*</span>
                    <span className="text-muted-foreground font-normal ml-1">(min. 20 characters)</span>
                  </Label>
                  <Textarea
                    id="message"
                    placeholder="Describe your issue in detail — include any relevant contract IDs, error messages, or screenshots."
                    rows={6}
                    value={form.message}
                    onChange={e => update('message', e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground text-right">{form.message.length} characters</p>
                </div>

                {error && (
                  <div className="bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting ? 'Submitting…' : (
                    <>Submit ticket <ArrowRight className="w-4 h-4 ml-1.5" /></>
                  )}
                </Button>
              </form>
            </div>
          </div>

          {/* Sidebar */}
          <aside className="lg:w-72 shrink-0 space-y-4">

            {/* Response time */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-4">Response times</p>
              <div className="space-y-3">
                {[
                  { plan: 'Team plan', time: '< 2 hours', color: 'text-green-600 bg-green-50' },
                  { plan: 'Pro plan', time: '< 8 hours', color: 'text-blue-600 bg-blue-50' },
                  { plan: 'Free plan', time: '< 24 hours', color: 'text-muted-foreground bg-muted' },
                ].map(row => (
                  <div key={row.plan} className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">{row.plan}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${row.color}`}>{row.time}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Track tickets */}
            <div className="bg-accent/40 border border-primary/20 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <TicketIcon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-1">Track your tickets</p>
                  <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                    Log in to view all your support tickets, reply to threads, and track resolution status.
                  </p>
                  <Button asChild size="sm" variant="outline" className="w-full">
                    <Link href="/my-tickets">
                      <TicketIcon className="w-3.5 h-3.5 mr-1.5" />
                      My tickets
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            {/* FAQ links */}
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm font-semibold text-foreground mb-3">Before you submit</p>
              <ul className="space-y-2">
                {[
                  { label: 'How does contract analysis work?', href: '/blog' },
                  { label: 'Supported file formats', href: '/blog' },
                  { label: 'Billing & refund policy', href: '/terms' },
                  { label: 'Data processing agreement', href: '/dpa' },
                  { label: 'Privacy policy', href: '/privacy' },
                ].map(item => (
                  <li key={item.label}>
                    <Link href={item.href} className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 shrink-0" />
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Upgrade CTA */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start gap-2 mb-2">
                <Zap className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <p className="text-sm font-semibold text-foreground">Priority support</p>
              </div>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Pro and Team plan users get faster responses and a dedicated support queue.
              </p>
              <Button asChild size="sm" className="w-full">
                <Link href="/upgrade?plan=pro">Upgrade for priority support</Link>
              </Button>
            </div>

          </aside>
        </div>
      </section>
    </div>
  )
}
