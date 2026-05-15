import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { ArrowRight, BookOpen } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

export const metadata = {
  title: 'Blog — LexAI',
  description: 'Insights on contract management, legal technology, and AI-powered legal workflows.',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Product': 'bg-primary/10 text-primary',
  'Legal Insights': 'bg-chart-2/10 text-chart-2',
  'Best Practices': 'bg-chart-3/10 text-chart-3',
  'Company': 'bg-chart-5/10 text-chart-5',
}

export default async function BlogPage() {
  const supabase = await createClient()

  const { data: posts, error } = await supabase
    .from('blog_posts')
    .select('id, slug, title, excerpt, category, author_name, published_at, created_at')
    .eq('published', true)
    .order('published_at', { ascending: false })

  const tableExists = !(error?.code === '42P01')
  const blogPosts = posts ?? []

  return (
    <div className="bg-background">
      {/* Header */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-14">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-b border-border pb-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-primary text-xs font-medium border border-primary/10 mb-5">
              <BookOpen className="w-3.5 h-3.5" />
              LexAI Blog
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground text-balance">
              Insights & updates
            </h1>
          </div>
          <p className="text-muted-foreground text-base max-w-xs text-pretty leading-relaxed">
            Contract management, legal AI, and best practices for teams handling agreements at scale.
          </p>
        </div>
      </section>

      {/* Posts */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        {!tableExists ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-sm mb-4">Blog database not set up yet.</p>
            <p className="text-xs text-muted-foreground">
              Visit <code className="bg-muted px-1.5 py-0.5 rounded text-foreground">/api/admin/migrate-blog</code> (POST) to initialize the blog table.
            </p>
          </div>
        ) : blogPosts.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-muted-foreground text-sm">No posts published yet.</p>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {blogPosts.map((post, i) => {
              const date = post.published_at || post.created_at
              const colorClass = CATEGORY_COLORS[post.category] ?? 'bg-muted text-muted-foreground'
              const isFeatured = i === 0

              return (
                <Link
                  key={post.id}
                  href={`/blog/${post.slug}`}
                  className={`group flex flex-col bg-card border border-border rounded-2xl overflow-hidden hover:border-primary/30 hover:shadow-md transition-all duration-200 ${isFeatured ? 'md:col-span-2' : ''}`}
                >
                  {/* Cover placeholder with gradient */}
                  <div className={`h-48 bg-gradient-to-br from-accent to-primary/10 flex items-center justify-center relative overflow-hidden ${isFeatured ? 'md:h-64' : ''}`}>
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/20 via-accent to-transparent" />
                    <div className="relative w-12 h-12 rounded-xl bg-primary/20 border border-primary/20 flex items-center justify-center">
                      <BookOpen className="w-6 h-6 text-primary" />
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 p-6">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorClass}`}>
                        {post.category}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(date), { addSuffix: true })}
                      </span>
                    </div>

                    <h2 className={`font-bold text-foreground mb-3 text-balance group-hover:text-primary transition-colors ${isFeatured ? 'text-2xl' : 'text-lg'}`}>
                      {post.title}
                    </h2>

                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground leading-relaxed flex-1 line-clamp-3 text-pretty">
                        {post.excerpt}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-5 pt-4 border-t border-border">
                      <span className="text-xs text-muted-foreground">{post.author_name}</span>
                      <span className="text-xs font-medium text-primary flex items-center gap-1 group-hover:gap-2 transition-all">
                        Read more <ArrowRight className="w-3 h-3" />
                      </span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
