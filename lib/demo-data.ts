// All mock data for the demo mode — no database reads needed

export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@lexai.app',
  full_name: 'Alex Johnson',
  plan: 'pro' as const,
  avatar_url: null,
}

export const DEMO_CONTRACTS = [
  {
    id: 'demo-1',
    title: 'SaaS Master Subscription Agreement',
    file_name: 'saas-subscription-agreement.pdf',
    status: 'completed',
    risk_score: 78,
    created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
    file_url: null,
    team_id: null,
    shared_with_team: false,
  },
  {
    id: 'demo-2',
    title: 'Employee Non-Disclosure Agreement',
    file_name: 'nda-employee-2024.pdf',
    status: 'completed',
    risk_score: 35,
    created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
    file_url: null,
    team_id: null,
    shared_with_team: false,
  },
  {
    id: 'demo-3',
    title: 'Office Space Lease — San Francisco HQ',
    file_name: 'office-lease-sf-2024.pdf',
    status: 'completed',
    risk_score: 62,
    created_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
    file_url: null,
    team_id: null,
    shared_with_team: false,
  },
  {
    id: 'demo-4',
    title: 'Vendor Services Agreement — AWS',
    file_name: 'vendor-aws-services.pdf',
    status: 'completed',
    risk_score: 21,
    created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
    file_url: null,
    team_id: null,
    shared_with_team: false,
  },
  {
    id: 'demo-5',
    title: 'Series A Investment Term Sheet',
    file_name: 'series-a-term-sheet.pdf',
    status: 'processing',
    risk_score: null,
    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    user_id: 'demo-user',
    file_url: null,
    team_id: null,
    shared_with_team: false,
  },
]

export const DEMO_ANALYSES: Record<string, {
  id: string
  contract_id: string
  summary: string
  key_terms: { term: string; value: string }[]
  risks: { severity: 'high' | 'medium' | 'low'; title: string; description: string; clause?: string }[]
  parties: string[]
  effective_date: string | null
  expiration_date: string | null
  contract_type: string
}> = {
  'demo-1': {
    id: 'analysis-1',
    contract_id: 'demo-1',
    summary: 'This SaaS Master Subscription Agreement grants the subscriber a non-exclusive, non-transferable licence to access the software platform. The agreement contains several high-risk clauses including a unilateral termination right for the vendor with only 7 days notice, automatic renewal with a 90-day cancellation window, and uncapped data processing liability for the customer. The vendor retains broad rights to modify pricing with 30 days notice. Governing law is Delaware with mandatory arbitration.',
    key_terms: [
      { term: 'Contract Term', value: '12 months, auto-renewing annually' },
      { term: 'Monthly Fee', value: '$4,200 USD (locked for Year 1)' },
      { term: 'Payment Terms', value: 'Net 30, late fee 1.5% per month' },
      { term: 'Governing Law', value: 'State of Delaware, USA' },
      { term: 'Dispute Resolution', value: 'Binding arbitration (JAMS)' },
      { term: 'Notice Period', value: '90 days prior to renewal date to cancel' },
    ],
    risks: [
      {
        severity: 'high',
        title: 'Unilateral Termination with 7-Day Notice',
        description: 'Section 12.3 allows the vendor to terminate the agreement with only 7 days written notice for any "material breach," which is defined broadly. This gives the vendor significant leverage and could disrupt business operations with minimal warning.',
        clause: '§12.3 — Vendor may terminate this Agreement upon seven (7) days written notice if Customer commits any material breach of this Agreement...',
      },
      {
        severity: 'high',
        title: 'Uncapped Data Processing Liability',
        description: 'Section 9.1 places unlimited liability on the customer for any data breaches originating from customer-side configurations or third-party integrations, even if the vendor\'s infrastructure contributed to the breach.',
        clause: '§9.1 — Customer assumes full and unlimited liability for data loss or breach arising from Customer\'s use of integration APIs or third-party connectors...',
      },
      {
        severity: 'high',
        title: 'Automatic Price Escalation Clause',
        description: 'Section 5.4 permits the vendor to increase fees by up to 15% per renewal cycle with only 30 days notice, which may not provide sufficient time to budget or negotiate.',
        clause: '§5.4 — Vendor reserves the right to adjust Subscription Fees by up to fifteen percent (15%) at each renewal term upon thirty (30) days prior notice...',
      },
      {
        severity: 'medium',
        title: '90-Day Cancellation Window',
        description: 'The agreement requires 90 days advance written notice to cancel prior to renewal. Missing this window by a single day results in an automatic 12-month renewal.',
        clause: '§4.2 — Unless Customer provides written notice of non-renewal at least ninety (90) days prior to the end of the then-current Term...',
      },
      {
        severity: 'medium',
        title: 'Broad IP Ownership Transfer',
        description: 'Section 8.2 assigns ownership of any customisations or configurations built by the vendor on behalf of the customer back to the vendor, not the customer.',
        clause: '§8.2 — Any modifications, customisations, or derivative works created by Vendor shall be and remain the sole and exclusive property of Vendor...',
      },
      {
        severity: 'low',
        title: 'Mandatory Arbitration Waiver',
        description: 'The agreement requires binding JAMS arbitration and explicitly waives the right to jury trial and class action participation. This is standard but worth noting.',
        clause: '§15.1 — All disputes shall be resolved by final and binding arbitration under JAMS rules. Each party waives their right to jury trial and to participate in class actions...',
      },
    ],
    parties: ['Acme Corp (Subscriber)', 'SaaS Solutions Inc. (Vendor)'],
    effective_date: '2024-01-15',
    expiration_date: '2025-01-14',
    contract_type: 'SaaS Subscription Agreement',
  },
  'demo-2': {
    id: 'analysis-2',
    contract_id: 'demo-2',
    summary: 'A standard employee Non-Disclosure Agreement covering proprietary business information, trade secrets, and technical data. The agreement is mutual in scope, with reasonable 2-year post-employment obligations. The definition of confidential information is appropriately scoped, and standard carve-outs exist for publicly available information. Overall this is a low-risk, industry-standard NDA.',
    key_terms: [
      { term: 'Agreement Type', value: 'Mutual NDA' },
      { term: 'Duration', value: 'Employment + 2 years post-termination' },
      { term: 'Governing Law', value: 'California, USA' },
      { term: 'Non-Compete', value: 'None (CA-compliant)' },
      { term: 'Carve-outs', value: 'Public domain, prior knowledge, independently developed' },
    ],
    risks: [
      {
        severity: 'medium',
        title: 'Vague Definition of Trade Secrets',
        description: 'Section 2.1 defines trade secrets broadly to include "any information that provides competitive advantage," which could be interpreted to cover legitimately public information if the company claims it as proprietary.',
        clause: '§2.1 — "Confidential Information" means any information that provides or could provide a competitive advantage to the Company...',
      },
      {
        severity: 'low',
        title: 'Injunctive Relief Without Bond',
        description: 'The agreement allows the company to seek injunctive relief without posting a bond, which is standard but may create imbalance if disputes arise.',
        clause: '§7.3 — Company may seek injunctive relief without posting any bond or other security...',
      },
    ],
    parties: ['Alex Johnson (Employee)', 'Acme Corp (Employer)'],
    effective_date: '2024-03-01',
    expiration_date: null,
    contract_type: 'Non-Disclosure Agreement',
  },
  'demo-3': {
    id: 'analysis-3',
    contract_id: 'demo-3',
    summary: 'A commercial office lease for 4,200 sq ft in San Francisco\'s financial district. The lease has a 5-year initial term with two 3-year renewal options. The tenant is responsible for pro-rata share of operating expenses (NNN structure) with a cap on controllable expense increases. Key risks include a personal guarantee requirement, a landlord-friendly force majeure clause, and a strict assignment restriction that could complicate future M&A activity.',
    key_terms: [
      { term: 'Lease Term', value: '5 years (Jan 2024 – Dec 2028)' },
      { term: 'Monthly Rent', value: '$42,000 (Year 1), 3% escalation annually' },
      { term: 'Space', value: '4,200 sq ft, Suite 1800' },
      { term: 'Security Deposit', value: '$126,000 (3 months)' },
      { term: 'Renewal Options', value: '2 × 3-year options at market rate' },
      { term: 'TI Allowance', value: '$75 per sq ft ($315,000 total)' },
    ],
    risks: [
      {
        severity: 'high',
        title: 'Personal Guarantee Requirement',
        description: 'Section 32 requires a personal guarantee from the CEO for the full remaining lease obligations if the company fails to pay. This creates significant personal liability exposure.',
        clause: '§32 — As a condition of this Lease, Guarantor shall execute and deliver a personal guarantee of all obligations hereunder...',
      },
      {
        severity: 'medium',
        title: 'Assignment Restriction — Requires Landlord Consent',
        description: 'Section 22.1 prohibits assignment or subletting without landlord written consent, which may not be unreasonably withheld but creates friction in M&A or restructuring scenarios.',
        clause: '§22.1 — Tenant shall not assign this Lease without prior written consent of Landlord, which shall not be unreasonably withheld...',
      },
      {
        severity: 'medium',
        title: 'Broad Force Majeure — Landlord Only',
        description: 'The force majeure clause (Section 28) applies only to the landlord\'s obligations, not the tenant\'s. The tenant remains fully liable for rent even if building access is interrupted.',
        clause: '§28 — Force majeure events shall excuse Landlord\'s performance obligations but shall not excuse or reduce Tenant\'s obligation to pay Rent...',
      },
      {
        severity: 'low',
        title: 'Holdover Rent 200% of Monthly Rent',
        description: 'If the tenant remains past the lease term without executing a renewal, holdover rent is 200% of the last month\'s rent — a strong financial incentive to renew or vacate on time.',
        clause: '§4.3 — If Tenant remains in possession after expiration, Tenant shall pay Landlord holdover rent at two hundred percent (200%) of monthly Base Rent...',
      },
    ],
    parties: ['Acme Corp (Tenant)', 'Pacific Properties LLC (Landlord)'],
    effective_date: '2024-01-01',
    expiration_date: '2028-12-31',
    contract_type: 'Commercial Office Lease',
  },
  'demo-4': {
    id: 'analysis-4',
    contract_id: 'demo-4',
    summary: 'A vendor services agreement with AWS covering cloud infrastructure, compute, storage, and managed services. The agreement reflects AWS\'s standard terms with minor negotiated amendments. Liability is capped at fees paid in the prior 12 months. Data processing terms are GDPR and CCPA compliant. This is a low-risk, standard enterprise cloud services agreement.',
    key_terms: [
      { term: 'Services', value: 'EC2, S3, RDS, CloudFront, Lambda' },
      { term: 'Estimated Annual Spend', value: '$180,000 – $240,000' },
      { term: 'Liability Cap', value: 'Fees paid in prior 12 months' },
      { term: 'Data Residency', value: 'US-East-1 (Virginia)' },
      { term: 'SLA Uptime', value: '99.99% monthly uptime commitment' },
      { term: 'Notice to Terminate', value: '30 days written notice' },
    ],
    risks: [
      {
        severity: 'low',
        title: 'Service Modification Rights',
        description: 'AWS reserves the right to modify, discontinue, or substitute services with 12 months notice. While standard for cloud providers, it could affect long-running workloads dependent on specific services.',
        clause: '§3.4 — AWS may modify or discontinue any Service Feature upon twelve (12) months prior notice...',
      },
    ],
    parties: ['Acme Corp', 'Amazon Web Services, Inc.'],
    effective_date: '2024-02-01',
    expiration_date: null,
    contract_type: 'Vendor Services Agreement',
  },
}

export const DEMO_MESSAGES: Record<string, { id: string; role: 'user' | 'assistant'; content: string; created_at: string }[]> = {
  'demo-1': [
    {
      id: 'm1',
      role: 'user',
      content: 'What are the most important risks I should be aware of in this contract?',
      created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    },
    {
      id: 'm2',
      role: 'assistant',
      content: 'The three most critical risks in this SaaS agreement are:\n\n**1. Unilateral 7-day termination (§12.3)** — The vendor can terminate with only 7 days notice for any "material breach," which is defined loosely. I\'d recommend negotiating this to at least 30 days with a cure period.\n\n**2. Uncapped data processing liability (§9.1)** — You bear unlimited liability for breaches from integrations or API usage, even if the vendor\'s infrastructure contributed. Push for a mutual liability cap tied to fees paid.\n\n**3. Automatic 15% price escalation (§5.4)** — Fees can increase 15% per renewal with only 30 days notice. Negotiate a cap of 3–5% or CPI-linked increases.\n\nWould you like suggested redline language for any of these clauses?',
      created_at: new Date(Date.now() - 59 * 60 * 1000).toISOString(),
    },
    {
      id: 'm3',
      role: 'user',
      content: 'Yes, can you suggest redline language for the termination clause?',
      created_at: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
    },
    {
      id: 'm4',
      role: 'assistant',
      content: 'Here\'s suggested redline language for Section 12.3:\n\n**Original:**\n> "Vendor may terminate this Agreement upon seven (7) days written notice if Customer commits any material breach of this Agreement."\n\n**Suggested revision:**\n> "Vendor may terminate this Agreement upon thirty (30) days prior written notice if Customer commits a material breach of this Agreement, provided that (i) Vendor has delivered written notice to Customer specifying the nature of the breach in reasonable detail, and (ii) Customer has failed to cure such breach within such thirty (30) day period. For payment failures, a ten (10) business day cure period shall apply."\n\n**Why this protects you:**\n- Extends notice to 30 days (enough time to find alternatives)\n- Requires Vendor to specify the breach (prevents pretextual termination)\n- Adds an explicit cure period (standard in commercial contracts)\n- Separate shorter cure window for payment (fair to both parties)',
      created_at: new Date(Date.now() - 57 * 60 * 1000).toISOString(),
    },
  ],
}

export const DEMO_STATS = {
  totalContracts: 5,
  completed: 4,
  highRisk: 2,
  avgRisk: 49,
  contractsThisMonth: 3,
}
