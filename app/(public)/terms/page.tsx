import LegalLayout from '@/components/legal/legal-layout'

export const metadata = {
  title: 'Terms of Service — LexAI',
  description: 'The terms and conditions governing your use of the LexAI platform.',
}

const sections = [
  {
    title: '1. Acceptance of terms',
    content: `By accessing or using LexAI (the "Service"), operated by LexAI, Inc. ("LexAI", "we", "us"), you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, you may not use the Service.

We reserve the right to update these Terms at any time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms.`,
  },
  {
    title: '2. Description of service',
    content: `LexAI is an AI-powered contract analysis platform that allows users to upload, analyze, and manage contracts. Features include risk scoring, clause extraction, AI-assisted chat, reporting, and team collaboration tools.

The Service is provided "as is." We make no warranty that AI analysis is legally accurate, complete, or suitable as a substitute for qualified legal advice. LexAI is a productivity tool, not a law firm.`,
  },
  {
    title: '3. Account registration',
    content: `To access the Service, you must create an account by providing accurate and complete registration information. You are responsible for:

- Maintaining the confidentiality of your account credentials
- All activities that occur under your account
- Notifying us immediately of any unauthorized use at security@lexai.app

You must be at least 18 years old to use the Service. By registering, you represent that you meet this age requirement.`,
  },
  {
    title: '4. Subscription plans and billing',
    content: `LexAI offers Free, Pro, and Team subscription tiers. Paid plans are billed in advance on a monthly basis.

**Free plan.** Includes 5 contract analyses per month and 20 AI chat messages per contract at no charge.

**Pro plan.** Includes unlimited analyses, unlimited AI chat, clause extraction, and PDF export at $29/month.

**Team plan.** Includes all Pro features plus shared team library, team analytics, and up to 10 members at $99/month.

All fees are non-refundable except where required by law. We reserve the right to change pricing with 30 days notice.`,
  },
  {
    title: '5. Acceptable use',
    content: `You agree not to use the Service to:

- Upload contracts containing personal data of third parties without proper authorization
- Attempt to reverse-engineer, decompile, or extract source code or AI model weights
- Use the Service in any way that could impair, overburden, or harm our infrastructure
- Circumvent plan limits or access controls
- Upload malicious files, malware, or content designed to harm LexAI or other users
- Violate any applicable law or regulation

We reserve the right to suspend or terminate accounts that violate these guidelines without notice.`,
  },
  {
    title: '6. Your content and data',
    content: `You retain full ownership of all contracts and content you upload to LexAI ("Your Content"). By uploading content, you grant LexAI a limited, non-exclusive license to process and analyze that content solely to provide the Service to you.

We do not use Your Content to train AI models or share it with third parties except as described in our Privacy Policy.

You are responsible for ensuring you have the right to upload any content to the Service.`,
  },
  {
    title: '7. Intellectual property',
    content: `LexAI and its licensors own all right, title, and interest in and to the Service, including all software, AI models, UI designs, trademarks, and documentation. These Terms do not grant you any rights to LexAI intellectual property except as necessary to use the Service.

The LexAI name, logo, and all related marks are trademarks of LexAI, Inc. You may not use them without our prior written consent.`,
  },
  {
    title: '8. Disclaimer of warranties',
    content: `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.

AI-GENERATED ANALYSIS IS NOT LEGAL ADVICE. LEXAI IS NOT A LAW FIRM AND NO ATTORNEY-CLIENT RELATIONSHIP IS FORMED BY USE OF THE SERVICE. ALWAYS CONSULT A QUALIFIED ATTORNEY FOR LEGAL DECISIONS.`,
  },
  {
    title: '9. Limitation of liability',
    content: `TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LEXAI SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING FROM YOUR USE OF THE SERVICE.

OUR AGGREGATE LIABILITY TO YOU FOR ANY CLAIMS ARISING FROM THESE TERMS OR THE SERVICE SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) $100.`,
  },
  {
    title: '10. Indemnification',
    content: `You agree to indemnify, defend, and hold harmless LexAI, its directors, officers, employees, and agents from any claims, damages, losses, or expenses (including reasonable legal fees) arising from: (a) your use of the Service; (b) Your Content; (c) your violation of these Terms; or (d) your violation of any third-party rights.`,
  },
  {
    title: '11. Termination',
    content: `Either party may terminate the relationship at any time. You may close your account via the Settings page. We may suspend or terminate your account immediately if you materially breach these Terms.

Upon termination, your right to access the Service ceases. We will delete your data within 30 days per our Privacy Policy, except where retention is required by law.`,
  },
  {
    title: '12. Governing law and disputes',
    content: `These Terms are governed by the laws of the State of California, without regard to conflict-of-law principles. Any disputes arising from these Terms shall be resolved through binding arbitration administered by JAMS in San Francisco, California, except that either party may seek injunctive relief in court for IP violations.`,
  },
  {
    title: '13. Contact',
    content: `Questions about these Terms? Contact us at legal@lexai.app or write to:

LexAI, Inc.
548 Market St, PMB 91776
San Francisco, CA 94104`,
  },
]

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      description="The terms and conditions that govern your use of LexAI."
      lastUpdated="April 1, 2025"
      sections={sections}
      relatedLinks={[
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Cookie Policy', href: '/cookies' },
        { label: 'Data Processing Agreement', href: '/dpa' },
      ]}
    />
  )
}
