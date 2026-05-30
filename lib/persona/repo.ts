// lib/persona/repo.ts
//
// Service-role data access for personas / persona_versions. All functions take
// a SupabaseClient (injected by callers — see lib/supabase/service-role-core.ts).
// Callers are admin API routes that have already verified is_platform_admin.
//
// Publish is delegated to publish_persona_draft (scripts/017_admin_rpcs.sql) so
// the version_number bump + persona pointer update are atomic.

import crypto from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { PersonaSchema, type Persona } from '@/lib/prompt/persona-types'
import { canonicalSerializePersona } from '@/lib/prompt/compile'

export interface PersonaVersionRow {
  id: string
  persona_id: string
  version_number: number
  status: 'draft' | 'published'
  content: Persona
  content_hash: string
  notes: string | null
  created_at: string
  created_by: string
  published_at: string | null
  published_by: string | null
}

export class PersonaRepoError extends Error {
  constructor(
    public code:
      | 'not_found'
      | 'draft_exists'
      | 'no_draft'
      | 'validation'
      | 'db_error',
    message: string,
    public detail?: unknown,
  ) {
    super(message)
    this.name = 'PersonaRepoError'
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex')
}

const SELECT_COLS =
  'id, persona_id, version_number, status, content, content_hash, notes, created_at, created_by, published_at, published_by'

export async function loadCurrentPersonaVersion(
  client: SupabaseClient,
  personaId: string,
): Promise<PersonaVersionRow> {
  const { data: persona, error: pErr } = await client
    .from('personas')
    .select('current_version_id')
    .eq('id', personaId)
    .single()
  if (pErr || !persona) {
    throw new PersonaRepoError('not_found', `persona ${personaId} not found`, pErr)
  }
  return loadPersonaVersion(client, persona.current_version_id as string)
}

export async function loadPersonaVersion(
  client: SupabaseClient,
  id: string,
): Promise<PersonaVersionRow> {
  const { data, error } = await client
    .from('persona_versions')
    .select(SELECT_COLS)
    .eq('id', id)
    .single()
  if (error || !data) {
    throw new PersonaRepoError('not_found', `persona_version ${id} not found`, error)
  }
  return data as PersonaVersionRow
}

export async function listPersonaVersions(
  client: SupabaseClient,
  personaId: string,
): Promise<PersonaVersionRow[]> {
  const { data, error } = await client
    .from('persona_versions')
    .select(SELECT_COLS)
    .eq('persona_id', personaId)
    .order('version_number', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error) throw new PersonaRepoError('db_error', error.message, error)
  return (data ?? []) as PersonaVersionRow[]
}

export async function getDraft(
  client: SupabaseClient,
  personaId: string,
): Promise<PersonaVersionRow | null> {
  const { data, error } = await client
    .from('persona_versions')
    .select(SELECT_COLS)
    .eq('persona_id', personaId)
    .eq('status', 'draft')
    .maybeSingle()
  if (error) throw new PersonaRepoError('db_error', error.message, error)
  return (data as PersonaVersionRow | null) ?? null
}

export async function createDraft(
  client: SupabaseClient,
  personaId: string,
  userId: string,
): Promise<PersonaVersionRow> {
  const current = await loadCurrentPersonaVersion(client, personaId)

  const insertRow = {
    persona_id: personaId,
    // version_number on drafts is a placeholder until publish renumbers it.
    // Use 0 to make it visually distinct from any published series.
    version_number: 0,
    status: 'draft' as const,
    content: current.content,
    content_hash: current.content_hash,
    notes: null,
    created_by: userId,
  }

  const { data, error } = await client
    .from('persona_versions')
    .insert(insertRow)
    .select(SELECT_COLS)
    .single()

  if (error) {
    // 23505 = unique_violation. Partial-unique index enforces ≤1 draft per persona.
    if ((error as { code?: string }).code === '23505') {
      throw new PersonaRepoError(
        'draft_exists',
        `a draft already exists for persona ${personaId}`,
        error,
      )
    }
    throw new PersonaRepoError('db_error', error.message, error)
  }
  return data as PersonaVersionRow
}

export async function updateDraft(
  client: SupabaseClient,
  personaId: string,
  patch: Partial<Persona>,
  // userId reserved for future audit / last_edited_by columns; unused today.
  _userId: string,
): Promise<PersonaVersionRow> {
  const draft = await getDraft(client, personaId)
  if (!draft) {
    throw new PersonaRepoError('no_draft', `no draft for persona ${personaId}`)
  }

  // Merge — only top-level Persona fields. Arrays/strings replace wholesale; the
  // admin UI sends fully-formed key-clauses / risk-areas arrays per spec § Part 5.
  const merged: Persona = {
    ...draft.content,
    ...patch,
    // Preserve the URL-bound persona id; ignore any client attempt to rename.
    id: draft.content.id,
  }

  const parsed = PersonaSchema.safeParse(merged)
  if (!parsed.success) {
    throw new PersonaRepoError('validation', 'persona content invalid', parsed.error.flatten())
  }
  enforceContentSizeBudget(parsed.data)

  const newHash = sha256(canonicalSerializePersona(parsed.data))

  const { data, error } = await client
    .from('persona_versions')
    .update({ content: parsed.data, content_hash: newHash })
    .eq('id', draft.id)
    .select(SELECT_COLS)
    .single()

  if (error || !data) throw new PersonaRepoError('db_error', error?.message ?? 'update failed', error)
  return data as PersonaVersionRow
}

export async function deleteDraft(
  client: SupabaseClient,
  personaId: string,
): Promise<void> {
  const draft = await getDraft(client, personaId)
  if (!draft) {
    throw new PersonaRepoError('no_draft', `no draft for persona ${personaId}`)
  }
  const { error } = await client.from('persona_versions').delete().eq('id', draft.id)
  if (error) throw new PersonaRepoError('db_error', error.message, error)
}

export async function publishDraft(
  client: SupabaseClient,
  personaId: string,
  userId: string,
): Promise<PersonaVersionRow> {
  const draft = await getDraft(client, personaId)
  if (!draft) {
    throw new PersonaRepoError('no_draft', `no draft for persona ${personaId}`)
  }

  // Re-validate at publish time even if updateDraft already validated — content
  // could have been written directly via SQL between update and publish.
  const parsed = PersonaSchema.safeParse(draft.content)
  if (!parsed.success) {
    throw new PersonaRepoError('validation', 'draft content invalid', parsed.error.flatten())
  }
  if (parsed.data.id !== personaId) {
    throw new PersonaRepoError(
      'validation',
      `draft content id ${parsed.data.id} does not match persona ${personaId}`,
    )
  }
  enforceContentSizeBudget(parsed.data)

  // Recompute hash from the canonical serialization — defends against drift
  // between the writer (updateDraft) and the publish path.
  const contentHash = sha256(canonicalSerializePersona(parsed.data))

  // Write the recomputed hash before invoking the RPC. The RPC only handles
  // the atomic status / version_number / pointer flip.
  {
    const { error } = await client
      .from('persona_versions')
      .update({ content: parsed.data, content_hash: contentHash })
      .eq('id', draft.id)
    if (error) throw new PersonaRepoError('db_error', error.message, error)
  }

  const { error: rpcErr } = await client.rpc('publish_persona_draft', {
    p_persona_id: personaId,
    p_user_id: userId,
  })
  if (rpcErr) throw new PersonaRepoError('db_error', rpcErr.message, rpcErr)

  return loadPersonaVersion(client, draft.id)
}

// § Part 5 publish validation rule #5: total JSON serialization ≤ 32 KB.
function enforceContentSizeBudget(p: Persona): void {
  const bytes = Buffer.byteLength(JSON.stringify(p), 'utf8')
  if (bytes > 32 * 1024) {
    throw new PersonaRepoError(
      'validation',
      `persona content exceeds 32 KB budget (${bytes} bytes)`,
    )
  }
}
