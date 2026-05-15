'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Menu, X, Scale } from 'lucide-react'

export default function LandingNav() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 16)
    window.addEventListener('scroll', handler)
    return () => window.removeEventListener('scroll', handler)
  }, [])

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? 'bg-white/95 backdrop-blur-sm border-b border-border shadow-sm' : 'bg-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Scale className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg text-foreground">LexAI</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-8">
            <Link href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Features</Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground hover:text-foreground transition-colors">How it works</Link>
            <Link href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Pricing</Link>
            <Link href="/blog" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Blog</Link>
            <Link href="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Contact</Link>
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/demo">Try demo</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/auth/sign-up">Get started free</Link>
            </Button>
          </div>

          {/* Mobile menu button */}
          <button
            className="md:hidden p-2 rounded-md text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(!open)}
            aria-label="Toggle menu"
          >
            {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-b border-border shadow-md">
          <div className="px-4 py-4 flex flex-col gap-4">
            <Link href="#features" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Features</Link>
            <Link href="#how-it-works" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>How it works</Link>
            <Link href="#pricing" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Pricing</Link>
            <Link href="/blog" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Blog</Link>
            <Link href="/contact" className="text-sm text-muted-foreground" onClick={() => setOpen(false)}>Contact</Link>
            <div className="flex flex-col gap-2 pt-2 border-t border-border">
              <Button variant="outline" size="sm" asChild><Link href="/auth/login">Sign in</Link></Button>
              <Button variant="outline" size="sm" asChild><Link href="/demo">Try demo</Link></Button>
              <Button size="sm" asChild><Link href="/auth/sign-up">Get started free</Link></Button>
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
