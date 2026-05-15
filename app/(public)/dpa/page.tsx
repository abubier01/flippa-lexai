import LegalLayout from '@/components/legal/legal-layout'

export const metadata = {
  title: 'Data Processing Agreement — LexAI',
  description: 'LexAI\'s Data Processing Agreement for GDPR and enterprise compliance.',
}

const sections = [
  {
    title: 'Introduction',
    content: `This Data Processing Agreement ("DPA") forms part of the agreement between LexAI, Inc. ("LexAI") and the Customer ("Controller") for the use of the LexAI platform. This DPA reflects the parties' agreement with respect to the processing of Personal Data in accordance with applicable data protection laws, including the General Data Protection Regulation (GDPR) and the California Consumer Privacy Act (CCPA).

This DPA is incorporated by reference into LexAI's Terms of Service. Terms not defined herein have the meaning given in the Terms of Service or applicable data protection laws.`,
  },
  {
    title: '1. Definitions',
    content: `**"Personal Data"** means any information relating to an identified or identifiable natural person.

**"Processing"** means any operation performed on Personal Data, whether automated or not.

**"Controller"** means the Customer — the entity that determines the purposes and means of processing Personal Data.

**"Processor"** means LexAI — which processes Personal Data on behalf of the Controller.

**"Sub-processor"** means any third party engaged by LexAI to process Personal Data.

**"Data Subject"** means the individual to whom Personal Data relates.

**"Applicable Data Protection Law"** means GDPR, CCPA, UK GDPR, and any other applicable national or regional data protection legislation.`,
  },
  {
    title: '2. Scope and nature of processing',
    content: `LexAI processes Personal Data as a Processor on behalf of the Controller solely to provide the Service as described in the Terms of Service.

**Categories of Personal Data processed:**
- Contact information (name, email address) of account holders
- Contract documents uploaded by the Customer, which may contain personal data of third parties
- Usage logs and interaction data

**Categories of Data Subjects:**
- Customer employees and authorized users
- Third parties whose personal data appears in uploaded contracts

**Purpose of processing:**
- Operating and improving the LexAI platform
- Providing AI-powered contract analysis
- User authentication and account management
- Customer support

**Duration:** For the duration of the Customer's subscription, and as described in the retention provisions below.`,
  },
  {
    title: '3. Processor obligations',
    content: `LexAI agrees to:

**Process only on documented instructions.** LexAI will process Personal Data only in accordance with the Customer's documented instructions, including those set out in this DPA and the Terms of Service.

**Ensure confidentiality.** All authorized persons processing Personal Data are subject to binding confidentiality obligations.

**Implement appropriate security.** LexAI implements and maintains appropriate technical and organizational measures to protect Personal Data, as described in Schedule 1.

**Assist with Data Subject rights.** LexAI will promptly assist the Customer in responding to Data Subject requests to exercise rights under Applicable Data Protection Law.

**Notify of breaches.** LexAI will notify the Customer without undue delay (and in any event within 72 hours) after becoming aware of a Personal Data breach.

**Delete or return data.** Upon termination of the agreement, LexAI will delete or return all Personal Data as instructed by the Customer.

**Provide audit assistance.** LexAI will provide the Customer with all information necessary to demonstrate compliance with this DPA and allow for audits, subject to reasonable notice and confidentiality protections.`,
  },
  {
    title: '4. Sub-processors',
    content: `The Customer authorizes LexAI to engage the following sub-processors:

| Sub-processor | Purpose | Location |
|---|---|---|
| Supabase, Inc. | Database, authentication, file storage | USA (AWS us-east-1) |
| Groq, Inc. | AI model inference | USA |
| Stripe, Inc. | Payment processing | USA |
| Vercel, Inc. | Hosting and edge network | USA / Global |

LexAI will enter into data processing agreements with each sub-processor that impose data protection obligations no less protective than this DPA.

LexAI will notify the Customer at least 30 days before adding or replacing a sub-processor. The Customer may object to changes within 14 days of notification on reasonable grounds relating to data protection.`,
  },
  {
    title: '5. International data transfers',
    content: `Where the processing of Personal Data involves a transfer from the European Economic Area (EEA), UK, or Switzerland to a country without an adequacy decision, LexAI will ensure that such transfers are made pursuant to appropriate safeguards, including:

- Standard Contractual Clauses (SCCs) as approved by the European Commission
- The UK International Data Transfer Agreement (IDTA)
- Binding Corporate Rules or other approved transfer mechanisms

LexAI's sub-processors that are US-based operate under the EU-US Data Privacy Framework where applicable.`,
  },
  {
    title: '6. Security measures',
    content: `LexAI implements the following technical and organizational security measures:

**Encryption.** All data is encrypted in transit using TLS 1.2 or higher. Data at rest is encrypted using AES-256.

**Access controls.** Access to production systems is restricted to authorized personnel via multi-factor authentication. Access rights are reviewed quarterly.

**Network security.** Production infrastructure is isolated behind firewalls. Regular vulnerability scanning and penetration testing are conducted.

**Incident response.** LexAI maintains a documented incident response plan and conducts annual drills.

**Data minimization.** LexAI collects only the data necessary to provide the Service.

**Backups.** Automated daily backups with point-in-time recovery. Backups are encrypted and stored in geographically separate regions.`,
  },
  {
    title: '7. Data retention and deletion',
    content: `Personal Data is retained for the duration of the Customer's subscription. Upon account termination or written request:

- Personal Data will be deleted or anonymized within 30 days
- Backup copies will be purged within 90 days
- Anonymized, aggregated analytics data may be retained indefinitely

The Customer may export their data at any time via the LexAI export feature before account termination.`,
  },
  {
    title: '8. Data Subject rights assistance',
    content: `LexAI will assist the Customer in fulfilling Data Subject requests for:

- **Access** to Personal Data
- **Rectification** of inaccurate Personal Data
- **Erasure** of Personal Data ("right to be forgotten")
- **Restriction** of processing
- **Data portability**
- **Objection** to processing

Upon receiving a Data Subject request that relates to the Customer's data, LexAI will forward it to the Customer within 5 business days. The Controller remains responsible for responding to Data Subjects.`,
  },
  {
    title: '9. Audits and compliance',
    content: `LexAI will provide the Customer with information necessary to demonstrate compliance with this DPA, including:

- Copies of applicable sub-processor agreements (with confidential information redacted)
- Security certifications and audit reports (ISO 27001, SOC 2 Type II — upon request, subject to NDA)
- Answers to data protection questionnaires within 30 business days

On-site audits may be conducted with at least 60 days written notice, no more than once per year, during business hours, and subject to reasonable confidentiality obligations.`,
  },
  {
    title: '10. Governing law',
    content: `This DPA is governed by the laws applicable to the agreement between LexAI and the Customer. For EU Customers, GDPR requirements take precedence. For UK Customers, UK GDPR requirements take precedence.

If any provision of this DPA conflicts with Applicable Data Protection Law, the requirements of Applicable Data Protection Law shall prevail.`,
  },
  {
    title: '11. How to sign this DPA',
    content: `Enterprise customers on the Team plan who require a countersigned DPA for GDPR compliance may contact us at legal@lexai.app to request a fully executed copy.

For customers not requiring a countersigned copy, this DPA forms part of the Terms of Service and is binding upon your use of the Service.`,
  },
]

export default function DpaPage() {
  return (
    <LegalLayout
      title="Data Processing Agreement"
      description="LexAI's Data Processing Agreement (DPA) for GDPR, UK GDPR, and enterprise compliance."
      lastUpdated="April 1, 2025"
      sections={sections}
      relatedLinks={[
        { label: 'Privacy Policy', href: '/privacy' },
        { label: 'Terms of Service', href: '/terms' },
        { label: 'Cookie Policy', href: '/cookies' },
      ]}
    />
  )
}
