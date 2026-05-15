import LegalLayout from '@/components/legal/legal-layout'

export const metadata = {
  title: 'Privacy Policy — LexAI',
  description: 'How LexAI collects, uses, and protects your personal data.',
}

const sections = [
  {
    title: '1. Introduction',
    content: `LexAI, Inc. ("LexAI", "we", "us", or "our") operates the LexAI platform at lexai.app (the "Service"). This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our Service.

Please read this policy carefully. By accessing or using the Service, you agree to the collection and use of information in accordance with this policy.`,
  },
  {
    title: '2. Information we collect',
    content: `We collect the following categories of information:

**Account information.** When you register, we collect your name, email address, and password hash. Passwords are never stored in plain text.

**Contract data.** When you upload or paste contracts into LexAI, those documents are stored in your account and processed by our AI. You retain full ownership of your contract data at all times.

**Usage data.** We automatically collect information about how you interact with the Service, including pages visited, features used, error logs, and timestamps.

**Payment information.** Payment card details are processed directly by Stripe, Inc. and are never stored on LexAI servers. We store only payment status and plan information.

**Communications.** If you contact our support team, we retain records of those communications.`,
  },
  {
    title: '3. How we use your information',
    content: `We use the information we collect to:

- Provide, operate, and improve the Service
- Process your contracts and generate AI-powered analysis
- Manage your account and subscription
- Send transactional emails (account confirmations, receipts, security alerts)
- Respond to support inquiries
- Monitor for and prevent fraud, abuse, and security incidents
- Comply with legal obligations

We do not sell your personal data or use your contract content to train our AI models without explicit consent.`,
  },
  {
    title: '4. Data sharing and disclosure',
    content: `We do not sell, rent, or trade your personal information. We may share data in the following limited circumstances:

**Service providers.** We share data with trusted third-party vendors who help us operate the Service, including Supabase (database and authentication), Groq (AI inference), Stripe (payments), and Vercel (hosting). Each provider is bound by data processing agreements.

**Legal requirements.** We may disclose information if required to do so by law or in response to valid legal requests (subpoenas, court orders, etc.).

**Business transfers.** In connection with a merger, acquisition, or sale of assets, user data may be transferred as part of that transaction. We will notify you before this occurs.

**With your consent.** We may share information in other ways with your explicit consent.`,
  },
  {
    title: '5. Data retention',
    content: `We retain your account data and contract data for as long as your account is active. If you delete your account, we will delete or anonymize your personal data within 30 days, except where we are required by law to retain it longer.

Anonymized, aggregated analytics data may be retained indefinitely as it cannot be used to identify you.`,
  },
  {
    title: '6. Security',
    content: `We implement industry-standard technical and organizational security measures including:

- Encryption in transit (TLS 1.2+) and at rest (AES-256)
- Row-level security at the database layer
- Regular security audits and penetration testing
- Access controls limiting data access to authorized personnel

No method of transmission over the Internet is 100% secure. While we strive to protect your data, we cannot guarantee absolute security.`,
  },
  {
    title: '7. Your rights',
    content: `Depending on your location, you may have rights under applicable data protection laws including:

- **Access**: Request a copy of the personal data we hold about you
- **Correction**: Request correction of inaccurate data
- **Deletion**: Request deletion of your personal data
- **Portability**: Receive your data in a machine-readable format
- **Objection**: Object to certain processing activities
- **Restriction**: Request restriction of processing in certain circumstances

To exercise any of these rights, contact us at privacy@lexai.app. We will respond within 30 days.`,
  },
  {
    title: '8. Cookies',
    content: `We use cookies and similar tracking technologies. For detailed information, please see our Cookie Policy.`,
  },
  {
    title: '9. Children\'s privacy',
    content: `The Service is not directed at children under the age of 16. We do not knowingly collect personal information from children. If we become aware that we have inadvertently collected data from a child under 16, we will delete it promptly.`,
  },
  {
    title: '10. International transfers',
    content: `LexAI is based in the United States. If you access the Service from outside the US, your data may be transferred to and processed in the US. We ensure appropriate safeguards are in place for international transfers, including Standard Contractual Clauses approved by the European Commission.`,
  },
  {
    title: '11. Changes to this policy',
    content: `We may update this Privacy Policy from time to time. We will notify you of material changes by posting the new policy on this page and, where appropriate, by email. Your continued use of the Service after changes take effect constitutes acceptance of the updated policy.`,
  },
  {
    title: '12. Contact us',
    content: `If you have questions about this Privacy Policy or our data practices, contact us at:

LexAI, Inc.
privacy@lexai.app
548 Market St, PMB 91776
San Francisco, CA 94104`,
  },
]

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      description="How we collect, use, and protect your personal data."
      lastUpdated="April 1, 2025"
      sections={sections}
      relatedLinks={[
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Cookie Policy', href: '/cookies' },
        { label: 'Data Processing Agreement', href: '/dpa' },
      ]}
    />
  )
}
