import Link from 'next/link'
import { Scale } from 'lucide-react'

export default function LandingFooter() {
  return (
    <footer className="bg-foreground text-background py-14">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Scale className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-semibold text-background">LexAI</span>
            </Link>
            <p className="text-sm text-background/60 leading-relaxed">
              AI-powered contract intelligence for modern teams.
            </p>
          </div>

          {/* Product */}
          <div>
            <p className="text-sm font-semibold mb-4">Product</p>
            <ul className="flex flex-col gap-2.5">
              {[
                { label: 'Features', href: '/#features' },
                { label: 'Pricing', href: '/#pricing' },
              ].map(item => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm text-background/60 hover:text-background transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <p className="text-sm font-semibold mb-4">Company</p>
            <ul className="flex flex-col gap-2.5">
              {[
                { label: 'About', href: '/about' },
                { label: 'Blog', href: '/blog' },
                { label: 'Contact', href: '/contact' },
              ].map(item => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm text-background/60 hover:text-background transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal */}
          <div>
            <p className="text-sm font-semibold mb-4">Legal</p>
            <ul className="flex flex-col gap-2.5">
              {[
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Service', href: '/terms' },
                { label: 'Cookie Policy', href: '/cookies' },
                { label: 'DPA', href: '/dpa' },
              ].map(item => (
                <li key={item.label}>
                  <Link href={item.href} className="text-sm text-background/60 hover:text-background transition-colors">{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="border-t border-background/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-background/50">
            &copy; {new Date().getFullYear()} LexAI, Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
