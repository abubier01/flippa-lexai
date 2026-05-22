export type MockUser = {
  id: string
  email?: string
  user_metadata?: Record<string, unknown>
} | null

type LookupClientOptions = {
  user: MockUser
  tickets?: unknown[]
  authError?: unknown
  lookupError?: { message: string } | null
}

export function createAuthClient(options: { user: MockUser; authError?: unknown } = { user: null }) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: options.user },
        error: options.authError ?? null,
      }),
    },
  }
}

export function createLookupClient(options: LookupClientOptions) {
  return {
    ...createAuthClient({ user: options.user, authError: options.authError }),
    from: (table: string) => {
      if (table !== 'support_tickets') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        select: () => ({
          eq: () => ({
            order: async () => ({
              data: options.tickets ?? [],
              error: options.lookupError ?? null,
            }),
          }),
        }),
      }
    },
  }
}

export function createTicketServiceClient() {
  return {
    from: (table: string) => {
      if (table !== 'support_tickets') {
        throw new Error(`Unexpected table: ${table}`)
      }
      return {
        insert: () => ({
          select: () => ({
            single: async () => ({
              data: { id: 'ticket_1', ticket_number: 1001 },
              error: null,
            }),
          }),
        }),
      }
    },
  }
}
