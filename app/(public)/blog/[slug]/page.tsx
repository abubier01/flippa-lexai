import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { formatDistanceToNow, format } from 'date-fns'
import type { Metadata } from 'next'

interface Props {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createClient()
  const { data: post } = await supabase
    .from('blog_posts')
    .select('title, excerpt')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  return {
    title: post ? `${post.title} — LexAI Blog` : 'Post — LexAI Blog',
    description: post?.excerpt ?? '',
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  'Product': 'bg-primary/10 text-primary',
  'Legal Insights': 'bg-chart-2/10 text-chart-2',
  'Best Practices': 'bg-chart-3/10 text-chart-3',
  'Company': 'bg-chart-5/10 text-chart-5',
}

function renderContent(content: string) {
  // Simple markdown-to-JSX: headings, bold, bullets, paragraphs
  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) { elements.push(<div key={key++} className="h-4" />); continue }

    if (trimmed.startsWith('## ')) {
      elements.push(<h2 key={key++} className="text-2xl font-bold text-foreground mt-10 mb-4">{trimmed.slice(3)}</h2>)
    } else if (trimmed.startsWith('# ')) {
      elements.push(<h1 key={key++} className="text-3xl font-bold text-foreground mt-10 mb-4">{trimmed.slice(2)}</h1>)
    } else if (trimmed.startsWith('- ')) {
      elements.push(
        <li key={key++} className="text-foreground leading-relaxed ml-4 list-disc" dangerouslySetInnerHTML={{
          __html: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        }} />
      )
    } else {
      elements.push(
        <p key={key++} className="text-foreground/80 leading-relaxed text-base" dangerouslySetInnerHTML={{
          __html: trimmed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        }} />
      )
    }
  }
  return elements
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()

  const { data: post } = await supabase
    .from('blog_posts')
    .select('*')
    .eq('slug', slug)
    .eq('published', true)
    .single()

  if (!post) notFound()

  const date = post.published_at || post.created_at
  const colorClass = CATEGORY_COLORS[post.category] ?? 'bg-muted text-muted-foreground'

  // Fetch related posts
  const { data: related } = await supabase
    .from('blog_posts')
    .select('slug, title, category, published_at, created_at')
    .eq('published', true)
    .neq('slug', slug)
    .limit(3)

  return (
    <div className="bg-background">
      {/* Article header */}
      <div className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-14 pb-10">
          <Link href="/blog" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
            <ArrowLeft className="w-4 h-4" />
            Back to blog
          </Link>

          <div className="flex items-center gap-3 mb-5">
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${colorClass}`}>
              {post.category}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(date), 'MMMM d, yyyy')} · {formatDistanceToNow(new Date(date), { addSuffix: true })}
            </span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold text-foreground text-balance mb-5 leading-tight">
            {post.title}
          </h1>

          {post.excerpt && (
            <p className="text-lg text-muted-foreground leading-relaxed text-pretty mb-6">
              {post.excerpt}
            </p>
          )}

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
              {post.author_name.split(' ').map((n: string) => n[0]).join('')}
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">{post.author_name}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Article body */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="space-y-4">
          {renderContent(post.content || '')}
        </div>
      </div>

      {/* Related posts */}
      {related && related.length > 0 && (
        <div className="border-t border-border bg-secondary/20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
            <h3 className="text-xl font-bold text-foreground mb-8">More from the blog</h3>
            <div className="grid sm:grid-cols-3 gap-6">
              {related.map(rel => {
                const rDate = rel.published_at || rel.created_at
                const rColor = CATEGORY_COLORS[rel.category] ?? 'bg-muted text-muted-foreground'
                return (
                  <Link
                    key={rel.slug}
                    href={`/blog/${rel.slug}`}
                    className="group bg-card border border-border rounded-xl p-5 hover:border-primary/30 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${rColor}`}>{rel.category}</span>
                      <span className="text-xs text-muted-foreground">{formatDistanceToNow(new Date(rDate), { addSuffix: true })}</span>
                    </div>
                    <p className="font-semibold text-foreground text-sm group-hover:text-primary transition-colors text-balance leading-snug">
                      {rel.title}
                    </p>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* CTA */}
      <div className="border-t border-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 text-center">
          <div className="w-12 h-12 rounded-xl bg-accent flex items-center justify-center mx-auto mb-5">
            <BookOpen className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-2xl font-bold text-foreground mb-3 text-balance">Analyze contracts with AI</h3>
          <p className="text-muted-foreground mb-7 text-pretty">Upload your next contract and get a full risk analysis in seconds — free.</p>
          <Link
            href="/auth/sign-up"
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Get started free
          </Link>
        </div>
      </div>
    </div>
  )
}
