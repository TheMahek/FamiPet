// PetGPT API layer — mirrors the latest backend contract on origin/main
// (frontend integration guide §22 of petGPT.md / petgpt-backend phases 2–7).
//
// Endpoints:
//   POST   /api/ai/conversations                create / start new conversation
//   GET    /api/ai/conversations                list the user's conversations
//   GET    /api/ai/conversations/:id            conversation + messages
//   POST   /api/ai/conversations/:id/messages   enqueue a durable generation (202)
//   DELETE /api/ai/conversations/:id            clear conversation (hard delete)
//   GET    /api/ai/jobs/:id                     durable generation job status
//   GET    /api/ai/providers                    list the user's provider configs
//   POST   /api/ai/providers                    create a provider config
//   PATCH  /api/ai/providers/:id                partial update (incl. activate)
//   DELETE /api/ai/providers/:id                delete a provider config
//   POST   /api/ai/providers/:id/test           probe a stored config (no write)
//
// Ownership is always backend-derived from the JWT; the client never sends
// ownership ids. Nothing here invents endpoints, fields, or polling behavior
// beyond what origin/main exposes.

import { apiDelete, apiGet, apiPatch, apiPost } from './client'

export type PetGPTRole = 'user' | 'assistant' | 'system'

export interface PetGPTToolCall {
  name: string
  arguments?: Record<string, unknown>
  ok: boolean
  error?: string
}

export interface PetGPTMessage {
  id: string
  role: PetGPTRole
  content: string
  createdAt: string
  toolCalls?: PetGPTToolCall[]
}

export interface PetGPTConversation {
  id: string
  title: string
  lastMessageAt: string | null
  lastMessagePreview: string
  createdAt: string
  updatedAt: string
}

export type PetGPTJobStatus = 'queued' | 'processing' | 'completed' | 'failed'

export interface PetGPTJobError {
  code: string
  message: string
}

export interface PetGPTJob {
  id: string
  status: PetGPTJobStatus
  provider: string | null
  model: string | null
  attemptCount: number
  conversationId: string
  userMessageId: string
  assistantMessageId: string | null
  error: PetGPTJobError | null
  createdAt: string
  updatedAt: string
  startedAt: string | null
  completedAt: string | null
  failedAt: string | null
}

export interface CreateConversationResult {
  success: boolean
  conversation: PetGPTConversation
}

export interface ListConversationsResult {
  success: boolean
  conversations: PetGPTConversation[]
}

export interface GetConversationResult {
  success: boolean
  conversation: PetGPTConversation
  messages: PetGPTMessage[]
}

// POST /messages: three distinct success shapes — durable 202 (in-scope),
// synchronous scope answer (out-of-scope), and an idempotent reuse.
interface AcceptedMessageResult {
  success: true
  conversationId: string
  userMessage: PetGPTMessage
  job: PetGPTJob
}
interface ScopeHandledResult {
  success: true
  scopeHandled: true
  conversationId: string
  userMessage: PetGPTMessage
  assistantMessage: PetGPTMessage
}
interface ReusedMessageResult {
  success: true
  reused: true
  conversationId: string
  userMessage: PetGPTMessage
  job: PetGPTJob
}
export type AddMessageResult = AcceptedMessageResult | ScopeHandledResult | ReusedMessageResult

export interface GetJobResult {
  success: boolean
  job: PetGPTJob
  userMessage: PetGPTMessage
  assistantMessage: PetGPTMessage | null
}

export function createConversation(title?: string): Promise<CreateConversationResult> {
  return apiPost<CreateConversationResult>('/ai/conversations', title ? { title } : undefined)
}

export function listConversations(): Promise<ListConversationsResult> {
  return apiGet<ListConversationsResult>('/ai/conversations')
}

export function getConversation(conversationId: string): Promise<GetConversationResult> {
  return apiGet<GetConversationResult>(`/ai/conversations/${conversationId}`)
}

export function addMessage(
  conversationId: string,
  content: string,
  idempotencyKey: string,
): Promise<AddMessageResult> {
  return apiPost<AddMessageResult>(`/ai/conversations/${conversationId}/messages`, {
    content,
    idempotencyKey,
  })
}

export function deleteConversation(conversationId: string): Promise<{ success: boolean }> {
  return apiDelete<{ success: boolean }>(`/ai/conversations/${conversationId}`)
}

export function getJobStatus(jobId: string): Promise<GetJobResult> {
  return apiGet<GetJobResult>(`/ai/jobs/${jobId}`)
}

// Unique per logical submission so an accidental re-send reuses the same job
// instead of duplicating a turn (backend scopes (owner, key) -> one job).
export function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

/* ---------------- PROVIDER CONFIGURATION (Phase 3) ----------------
   The backend stores the API key AES-256-GCM encrypted and NEVER returns it.
   `configured` is the only credential signal a client ever gets, so the UI can
   show "a key is saved" without ever holding, rendering, or re-sending one it
   did not just type. `apiKey` below is write-only: it is sent once on
   create/update and is never returned or cached. */

export type PetGPTProviderType = 'google' | 'openai'

// Safe response shape (backend `safeProvider`): metadata + a `configured` mask.
// `id` — not `_id` — is the field the backend exposes; `active` marks the one
// config the backend will use for this user, and `enabled` gates that further.
export interface PetGPTProvider {
  id: string
  provider: PetGPTProviderType | string
  name: string
  baseUrl: string
  model: string
  enabled: boolean
  active: boolean
  configured: boolean
  createdAt: string
  updatedAt: string
}

export interface ListProvidersResult {
  success: boolean
  providers: PetGPTProvider[]
}

export interface ProviderResult {
  success: boolean
  provider: PetGPTProvider
}

export interface DeleteProviderResult {
  success: boolean
  message: string
}

// Create/update payload. `apiKey` is required to create and must be non-empty
// to replace a stored key; OMIT it on update to keep the existing one (the
// backend never hands the old key back, so it cannot be re-sent).
export interface ProviderInput {
  provider: PetGPTProviderType | string
  name?: string
  baseUrl?: string
  model: string
  apiKey?: string
  enabled?: boolean
  active?: boolean
}

// /test never throws for a provider-side failure: it answers 200 with
// `ok:false` and a normalized `error.code` (config | timeout | http |
// malformed | unknown). Only a transport/ownership failure rejects.
export interface TestProviderResult {
  success: boolean
  ok: boolean
  provider: string
  model?: string
  latencyMs?: number
  error?: { code: string; status?: number }
}

export function listProviders(): Promise<ListProvidersResult> {
  return apiGet<ListProvidersResult>('/ai/providers')
}

export function createProvider(input: ProviderInput): Promise<ProviderResult> {
  return apiPost<ProviderResult>('/ai/providers', input)
}

export function updateProvider(id: string, input: Partial<ProviderInput>): Promise<ProviderResult> {
  return apiPatch<ProviderResult>(`/ai/providers/${id}`, input)
}

export function deleteProvider(id: string): Promise<DeleteProviderResult> {
  return apiDelete<DeleteProviderResult>(`/ai/providers/${id}`)
}

export function testProvider(id: string): Promise<TestProviderResult> {
  return apiPost<TestProviderResult>(`/ai/providers/${id}/test`)
}
