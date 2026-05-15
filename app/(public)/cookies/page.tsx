import LegalLayout from '@/components/legal/legal-layout'

export const metadata = {
  title: 'Cookie Policy — LexAI',
  description: 'How LexAI uses cookies and similar tracking technologies.',
}

const sections = [
  {
    title: '1. What are cookies?',
    content: `Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work efficiently, provide functionality, and give site owners information about how their service is used.

Similar technologies include web beacons, pixel tags, and local storage — all of which are covered by this Cookie Policy.`,
  },
  {
    title: '2. How we use cookies',
    content: `LexAI uses cookies for the following purposes:

**Strictly necessary cookies.** These cookies are essential for the Service to function. They enable core features such as authentication sessions, security tokens, and preference storage. You cannot opt out of these cookies without losing access to the Service.

**Functional cookies.** These remember your preferences such as sidebar collapsed state, theme settings, and recently viewed contracts.

**Analytics cookies.** We use privacy-respecting analytics to understand how users interact with the Service. This helps us improve features and fix bugs. We do not use Google Analytics or third-party advertising trackers.

**Security cookies.** Used to detect and prevent CSRF attacks, session hijacking, and other security threats.`,
  },
  {
    title: '3. Specific cookies we use',
    content: `**sb-auth-token** — Supabase authentication session token. Strictly necessary. Duration: session.

**sb-refresh-token** — Supabase authentication refresh token. Strictly necessary. Duration: 7 days.

**lexai-theme** — Your selected theme preference (light/dark). Functional. Duration: 1 year.

**lexai-sidebar-state** — Whether the sidebar is collapsed or expanded. Functional. Duration: 1 year.

**lexai-csrf** — Cross-site request forgery prevention token. Security. Duration: session.`,
  },
  {
    title: '4. Third-party cookies',
    content: `When you make a payment, Stripe.com may set cookies on your device for fraud prevention and security purposes. These are governed by Stripe's Privacy Policy.

We do not permit third-party advertising networks to place cookies on our Service.`,
  },
  {
    title: '5. Your choices',
    content: `**Browser controls.** Most browsers allow you to refuse cookies or delete existing ones. See your browser's help documentation for instructions. Note that disabling strictly necessary cookies will prevent you from logging in to the Service.

**Do Not Track.** Some browsers send "Do Not Track" signals. We respect this signal for analytics cookies.

**Consent management.** Where required by law (e.g., GDPR), we will present a consent banner allowing you to manage non-essential cookies.`,
  },
  {
    title: '6. Local storage',
    content: `In addition to cookies, we use HTML5 local storage to persist small pieces of UI state (such as draft content, recent searches, and display preferences) directly in your browser. This data stays on your device and is not transmitted to our servers.`,
  },
  {
    title: '7. Changes to this policy',
    content: `We may update this Cookie Policy to reflect changes in our practices or applicable law. We will notify you of material changes by updating the "Last updated" date at the top of this page.`,
  },
  {
    title: '8. Contact',
    content: `For questions about our use of cookies, contact us at privacy@lexai.app.`,
  },
]

export default function CookiesPage() {
  return (
    <LegalLayout
      title="Cookie Policy"
      description="How we use cookies and similar technologies on the LexAI platform."
      lastUpdated="April 1, 2025"
      sections={sections}
      relatedLinks={[
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Data Processing Agreement', href: '/dpa' },
      ]}
    />
  )
}
