// Phase 22 — PetGPT: a genuinely redesigned AI assistant experience for the
// React app. Replaces the legacy single-turn ask/advice UI. Built against the
// latest PetGPT contract on origin/main:
//
//   conversations (create/list/get/clear) + durable generation jobs
//   (POST messages -> 202 -> poll GET /api/ai/jobs/:id -> completed/failed),
//   scope-handled sync answers, idempotency, per-user quota, and the
//   veterinarian directory (GET /api/veterinarians).
//
// The UI renders ONLY persisted backend data. There is no fabricated reply,
// no fake polling, no client-side tool execution, and no assumption that the
// backend performed an action — the backend is the source of truth.

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addMessage,
  createConversation,
  deleteConversation,
  getConversation,
  getJobStatus,
  listConversations,
  newIdempotencyKey,
  type PetGPTConversation,
  type PetGPTJobError,
  type PetGPTMessage,
  type PetGPTRole,
} from '../../../api/petgpt'
import { getMyPets } from '../../../api/pets'
import { Icon } from '../../../components/shared/Icon'
import { useAuth } from '../../../hooks/useAuth'
import { getErrorMessage, isApiError } from '../../../lib/errors'
import { toPetView } from '../mypet/petBase'
import { QuickActions, type PetChip } from './QuickActions'
import { VeterinarianPanel } from './VeterinarianPanel'

const POLL_MS = 1200
const POLL_CAP = 300 // ~6 minutes, then the UI says the generation is still running and to refresh
const SS_ACTIVE = 'petgptActiveId'
const SS_PENDING = 'petgptPendingJob'

interface PendingJob {
  jobId: string
  conversationId: string
  userMessageId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  error: PetGPTJobError | null
  ticks: number
}

function readSS<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}
function writeSS(key: string, value: unknown): void {
  try {
    if (value === null) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* best-effort persistence */
  }
}

function fmtTime(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

function friendlyContent(m: PetGPTMessage): string {
  return m.content.trim() || '…'
}

export function PetGPTPage() {
  const { user } = useAuth()
  const [conversations, setConversations] = useState<PetGPTConversation[] | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<PetGPTMessage[]>([])
  const [convLoading, setConvLoading] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pets, setPets] = useState<PetChip[]>([])
  const [selectedPetId, setSelectedPetId] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [composer, setComposer] = useState('')
  const [pending, setPending] = useState<PendingJob | null>(null)
  const [showVets, setShowVets] = useState(false)
  const [railOpen, setRailOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [toast, setToast] = useState('')
  const [retryingId, setRetryingId] = useState<string | null>(null)

  const composerRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // ── Toast (same auto-dismiss as the rest of the app) ──────────────
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // ── Initial load: real conversations + real pets ──
  useEffect(() => {
    let cancelled = false
    Promise.all([listConversations(), getMyPets()]).then(([listRes, petsRes]) => {
      if (cancelled) return
      setConversations(listRes.conversations)
      const chips = (petsRes.pets || []).map((p) => toPetView(p)).map((p) => ({
        id: p.id,
        name: p.name,
        species: p.species,
        image: p.image,
      }))
      setPets(chips)
      setLoadFailed(false)
    }).catch(() => {
        if (cancelled) return
        setLoadFailed(true)
        setConversations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Restore session: active conversation + resume polling an in-flight job
  // (refresh is never a cancellation — the job keeps running server-side).
  useEffect(() => {
    let cancelled = false
    const restoredActive = readSS<string>(SS_ACTIVE)
    const restoredPending = readSS<PendingJob>(SS_PENDING)
    if (restoredPending && restoredPending.status !== 'completed' && restoredPending.status !== 'failed') {
      setPending(restoredPending)
    }
    if (restoredActive) {
      setActiveId(restoredActive)
      setConvLoading(true)
      getConversation(restoredActive)
        .then((res) => {
          if (!cancelled) setMessages(res.messages || [])
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setConvLoading(false)
        })
    }
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Poll a pending durable job until terminal ───────────────────────
  useEffect(() => {
    if (!pending || pending.status === 'completed' || pending.status === 'failed') return
    let cancelled = false
    let tickCount = 0
    const timer = setInterval(async () => {
      tickCount += 1
      try {
        const res = await getJobStatus(pending.jobId)
        if (cancelled) return
        const job = res.job
        if (job.status === 'completed') {
          setPending((p) => (p ? { ...p, status: 'completed' } : p))
          writeSS(SS_PENDING, null)
          if (job.conversationId === activeId || job.conversationId === pending.conversationId) {
            setMessages((prev) =>
              res.assistantMessage && !prev.some((m) => m.id === res.assistantMessage!.id)
                ? [...prev, res.assistantMessage]
                : prev,
            )
          }
          refreshListPreview()
          clearInterval(timer)
        } else if (job.status === 'failed') {
          setPending((p) => (p ? { ...p, status: 'failed', error: job.error } : p))
          writeSS(SS_PENDING, null)
          clearInterval(timer)
        } else {
          setPending((p) => (p ? { ...p, status: job.status, ticks: tickCount } : p))
          if (tickCount >= POLL_CAP) {
            clearInterval(timer)
            setToast('Generation is still running. Refresh the page to check its status.')
            writeSS(SS_PENDING, null)
          }
        }
      } catch {
        // transient — keep polling
      }
    }, POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending?.jobId, pending?.status])

  // Keep the sidebar preview in sync with the server after a reply lands.
  const refreshListPreview = () => {
    listConversations()
      .then((res) => setConversations(res.conversations))
      .catch(() => undefined)
  }

  // Auto-scroll the message area to the newest turn.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending, convLoading])

  const activeListEntry = useMemo(
    () => conversations?.find((c) => c.id === activeId) || null,
    [conversations, activeId],
  )

  const openConversation = (id: string) => {
    setShowVets(false)
    setConfirmClear(false)
    setActiveId(id)
    writeSS(SS_ACTIVE, id)
    setRailOpen(false)
    setMessages([])
    setConvLoading(true)
    getConversation(id)
      .then((res) => setMessages((res.messages || []).filter((m) => m.role !== 'system')))
      .catch(() => setToast('Could not load this conversation.'))
      .finally(() => setConvLoading(false))
  }

  const startNewChat = async () => {
    setShowVets(false)
    setConfirmClear(false)
    try {
      const res = await createConversation()
      setConversations((prev) =>
        prev ? [res.conversation, ...prev.filter((c) => c.id !== res.conversation.id)] : [res.conversation],
      )
      setActiveId(res.conversation.id)
      writeSS(SS_ACTIVE, res.conversation.id)
      setMessages([])
      setRailOpen(false)
      setComposer('')
      composerRef.current?.focus()
    } catch {
      setToast('Could not start a new conversation.')
    }
  }

  const submit = async (raw?: string) => {
    const text = (raw ?? composer).trim()
    if (!text || sending) return
    setSending(true)
    try {
      let convId = activeId
      if (!convId) {
        const created = await createConversation()
        convId = created.conversation.id
        setActiveId(convId)
        writeSS(SS_ACTIVE, convId)
        setConversations((prev) => (prev ? [created.conversation, ...prev] : [created.conversation]))
      }
      setComposer('')

      const res = await addMessage(convId, text, newIdempotencyKey())

      if ('scopeHandled' in res) {
        // Out-of-scope: the backend answered synchronously and persisted both turns.
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== res.userMessage.id),
          res.userMessage,
          res.assistantMessage,
        ])
        writeSS(SS_ACTIVE, convId)
        refreshListPreview()
      } else if ('job' in res) {
        // Durable generation — the assistant reply arrives via job polling.
        const nextPending: PendingJob = {
          jobId: res.job.id,
          conversationId: String(res.job.conversationId || convId),
          userMessageId: res.userMessage.id,
          status: res.job.status,
          error: null,
          ticks: 0,
        }
        setMessages((prev) => [...prev.filter((m) => m.id !== res.userMessage.id), res.userMessage])
        setPending((prev) => (prev && prev.jobId === nextPending.jobId ? prev : nextPending))
        writeSS(SS_PENDING, nextPending)
      }
    } catch (err) {
      if (isApiError(err) && err.isNetwork) setToast('Unable to reach the server. Please check your connection.')
      else if (isApiError(err) && err.status === 429) setToast('You have reached the rate limit. Please try again shortly.')
      else if (isApiError(err) && err.status === 404) setToast('That conversation is no longer available.')
      else setToast(getErrorMessage(err, 'Something went wrong.'))
    } finally {
      setSending(false)
    }
  }

  const retryTurn = async (userMessage: PetGPTMessage) => {
    // A retry is a NEW message → a NEW job (a reused key only returns the old
    // failed job; genuine regeneration happens through a fresh turn).
    if (!activeId || retryingId === userMessage.id) return
    setRetryingId(userMessage.id)
    setToast('Resending your question…')
    try {
      const res = await addMessage(activeId, userMessage.content, newIdempotencyKey())
      if ('scopeHandled' in res) {
        setMessages((prev) => [...prev, res.userMessage, res.assistantMessage])
        refreshListPreview()
      } else if ('job' in res) {
        setPending({
          jobId: res.job.id,
          conversationId: String(res.job.conversationId || activeId),
          userMessageId: res.userMessage.id,
          status: res.job.status,
          error: null,
          ticks: 0,
        })
        writeSS(SS_PENDING, {
          jobId: res.job.id,
          conversationId: String(res.job.conversationId || activeId),
          userMessageId: res.userMessage.id,
          status: res.job.status,
          error: null,
          ticks: 0,
        })
      }
    } catch (err) {
      const e = isApiError(err) ? err : null
      setToast(e?.isNetwork ? 'Unable to reach the server.' : e?.status === 429 ? 'Rate limit reached — try again shortly.' : getErrorMessage(err, 'Something went wrong.'))
    } finally {
      setRetryingId(null)
    }
  }

  const clearChat = async () => {
    if (!activeId) return
    try {
      await deleteConversation(activeId)
      setConversations((prev) => (prev || []).filter((c) => c.id !== activeId))
      setMessages([])
      setActiveId(null)
      setPending(null)
      writeSS(SS_ACTIVE, null)
      writeSS(SS_PENDING, null)
      setConfirmClear(false)
      setToast('Conversation cleared.')
    } catch {
      setToast('Could not clear this conversation.')
    }
  }

  const pickPrompt = (prompt: string) => {
    setShowVets(false)
    setComposer(prompt)
    composerRef.current?.focus()
  }

  const askSelectedPet = (prompt: string) => {
    pickPrompt(prompt)
  }

  const firstName = (user?.name || '').split(' ')[0]

  const showEmpty = !convLoading && messages.length === 0

  return (
    <div className="petgpt-page petgpt-root flex w-full flex-col overflow-hidden bg-canvas text-ink dark:bg-slate-950 dark:text-slate-100">
      {/* toast */}
      {toast && (
        <div className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg dark:bg-slate-800">
          {toast}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ─── Conversation rail (desktop) ─── */}
        <aside className="petgpt-rail hidden shrink-0 flex-col md:flex">
          <div className="petgpt-rail-head">
            <button
              type="button"
              onClick={startNewChat}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-dark"
            >
              <Icon name="plus" /> New chat
            </button>
          </div>
          <div className="petgpt-rail-list petgpt-scroll">
            {conversations === null ? (
              <div className="flex items-center gap-2 px-3 py-3 text-sm" style={{ color: 'var(--pg-muted)' }}>
                <Icon name="spinner" spin /> Loading chats…
              </div>
            ) : loadFailed ? (
              <div className="flex flex-col items-start gap-2 px-3 py-3 text-sm">
                <span style={{ color: 'var(--pg-muted)' }}>
                  <Icon name="triangle-exclamation" /> Couldn&apos;t load chats.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setLoadFailed(false)
                    setConversations(null)
                    listConversations()
                      .then((res) => setConversations(res.conversations))
                      .catch(() => setLoadFailed(true))
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-medium text-pink-700 hover:bg-pink-100 dark:bg-slate-800 dark:text-pink-200"
                >
                  <Icon name="rotate" /> Retry
                </button>
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-3 py-3 text-sm" style={{ color: 'var(--pg-muted)' }}>
                No conversations yet.
              </p>
            ) : (
              conversations.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => openConversation(c.id)}
                  aria-current={c.id === activeId}
                  className="petgpt-rail-item"
                  style={c.id === activeId ? undefined : { color: 'var(--pg-text)' }}
                >
                  <span className="petgpt-rail-title">{c.title || 'New conversation'}</span>
                  {c.lastMessagePreview && <span className="petgpt-rail-preview">{c.lastMessagePreview}</span>}
                </button>
              ))
            )}
          </div>
        </aside>

        {/* ─── Main chat area ─── */}
        {/* A <section>, not a <main>: AppLayout already renders the page's
            single <main> landmark, and nesting a second one is invalid. */}
        <section className="petgpt-main relative flex min-h-0 min-w-0 flex-1 flex-col">
          {/* chat header (only when a conversation is open) */}
          {activeId ? (
            <header className="petgpt-header flex items-center gap-3 px-3 py-3 md:px-5">
              <button
                type="button"
                className="rounded-lg p-2 transition hover:bg-pink-50 md:hidden"
                style={{ color: 'var(--pg-muted)' }}
                onClick={() => setRailOpen(true)}
                aria-label="Show conversations"
              >
                <Icon name="menu" />
              </button>
              <div className="flex min-w-0 items-center gap-2.5">
                <span className="petgpt-avatar">
                  <Icon name="sparkles" />
                </span>
                <div className="min-w-0">
                  <h1 className="truncate text-sm font-semibold leading-tight">{activeListEntry?.title || 'PetGPT'}</h1>
                  <p className="mt-0.5 text-xs leading-tight" style={{ color: 'var(--pg-muted)' }}>
                    {pending && (pending.status === 'queued' || pending.status === 'processing')
                      ? 'Working on your question…'
                      : 'AI pet-care assistant'}
                  </p>
                </div>
              </div>

              <div className="ml-auto flex items-center gap-1.5">
                {pending && (pending.status === 'queued' || pending.status === 'processing') && (
                  <span className="hidden items-center gap-1.5 rounded-full bg-primary-light px-2.5 py-1 text-xs font-medium text-primary-dark dark:bg-pink-950/50 dark:text-pink-200 sm:flex">
                    <Icon name="spinner" spin /> Generating…
                  </span>
                )}
                <button
                  type="button"
                  className="rounded-lg p-2 transition hover:bg-pink-50"
                  style={{ color: 'var(--pg-muted)' }}
                  aria-label="Clear conversation (delete all messages)"
                  onClick={() => setConfirmClear((v) => !v)}
                >
                  <Icon name="trash-can" />
                </button>
              </div>

              {confirmClear && (
                <div className="absolute right-3 top-14 z-20 flex items-center gap-2 rounded-2xl border border-line bg-white p-3 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                  <span className="text-sm text-ink dark:text-slate-200">Clear this chat permanently?</span>
                  <button
                    type="button"
                    onClick={clearChat}
                    className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary-dark"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-ink-light hover:bg-pink-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </header>
          ) : null}

          {/* ─── Body: chat messages or empty/welcome state ─── */}
          {convLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--pg-muted)' }}>
                <Icon name="spinner" spin /> Loading conversation…
              </div>
            </div>
          ) : showEmpty ? (
            <div className="petgpt-empty petgpt-scroll">
              <div className="petgpt-empty-inner">
                {/* greeting */}
                <div className="flex flex-col items-center text-center">
                  <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-pink-400 via-rose-400 to-orange-300 text-white shadow-lg shadow-pink-200/60 dark:shadow-pink-950/40">
                    <Icon name="sparkles" className="text-3xl" />
                  </div>
                  <h2 className="mt-5 text-2xl font-bold tracking-tight">{firstName ? `Hi ${firstName}` : 'Welcome back'}</h2>
                  <p className="mt-2 max-w-sm text-sm leading-relaxed" style={{ color: 'var(--pg-muted)' }}>
                    Meet PetGPT — your pet-care assistant, ready with your pet&apos;s records in mind.
                  </p>
                </div>

                <div className="mt-9">
                  {showVets ? (
                    <VeterinarianPanel onBack={() => setShowVets(false)} onAskVet={askSelectedPet} />
                  ) : (
                    <QuickActions
                      pets={pets}
                      selectedPetId={selectedPetId}
                      onSelectPet={(id) => setSelectedPetId(id)}
                      onAsk={askSelectedPet}
                      onFindVet={() => setShowVets(true)}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="petgpt-scroll min-h-0 flex-1 overflow-y-auto">
              <div className="petgpt-column petgpt-transcript">
                {/* early-conversation hint row */}
                <span className="petgpt-daychip">Today, {fmtTime(new Date().toISOString())}</span>

                <div className="petgpt-turns">
                  {messages.map((m) => (
                    <MessageRow
                      key={m.id}
                      role={m.role}
                      content={friendlyContent(m)}
                      time={fmtTime(m.createdAt)}
                      toolCalls={m.toolCalls}
                      onRetry={m.role === 'user' ? () => retryTurn(m) : undefined}
                      retrying={retryingId === m.id}
                      failed={!!(pending && pending.userMessageId === m.id && pending.status === 'failed')}
                    />
                  ))}

                  {pending && (pending.status === 'queued' || pending.status === 'processing') && (
                    <div className="flex items-start gap-2.5">
                      <Avatar />
                      <div className="petgpt-bubble petgpt-bubble-assistant">
                        <TypingDots />
                      </div>
                    </div>
                  )}
                </div>

                {pending && pending.status === 'failed' && (
                  <div className="mt-4 flex items-start gap-2.5">
                    <Avatar />
                    <div className="petgpt-failure petgpt-bubble rounded-tl-sm">
                      <div className="flex items-start gap-2.5">
                        <Icon name="triangle-exclamation" className="mt-0.5 shrink-0 text-base text-amber-500" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                            {pending.error ? pending.error.message : 'AI generation failed. Please try again.'}
                          </p>
                          {/* An endpoint failure is an application-configuration
                              problem, not a transient one: retrying the same
                              request against the same unreachable endpoint just
                              fails again. PetGPT's AI endpoint is set for the whole
                              deployment (there is no per-user AI setting), so there
                              is nothing for this user to change here. */}
                          {pending.error?.code === 'provider' && (
                            <p className="mt-1.5 text-xs leading-relaxed text-amber-800/90 dark:text-amber-200/80">
                              PetGPT could not reach the AI service configured for this FamiPet deployment. This is
                              an administrator configuration issue, not something you can change in your account.
                            </p>
                          )}
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                const lastUser = [...messages].reverse().find((m) => m.role === 'user')
                                if (lastUser) retryTurn(lastUser)
                              }}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm ring-1 ring-amber-200 transition hover:bg-amber-100 disabled:opacity-60 dark:bg-slate-900 dark:text-amber-200 dark:ring-slate-700"
                            >
                              <Icon name="rotate" /> Try again
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Composer ─── */}
          <div className="petgpt-composer-bar">
            <div className="petgpt-column">
              <form
                className="petgpt-composer"
                onSubmit={(e) => {
                  e.preventDefault()
                  void submit()
                }}
              >
                <textarea
                  ref={composerRef}
                  rows={1}
                  value={composer}
                  onChange={(e) => setComposer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void submit()
                    }
                  }}
                  disabled={sending}
                  placeholder="Ask about your pet's health, nutrition, care…"
                  aria-label="Message PetGPT"
                  className="disabled:opacity-60"
                />
                <button type="submit" disabled={sending || !composer.trim()} aria-label="Send message" className="petgpt-send">
                  <Icon name={sending ? 'spinner' : 'send'} spin={sending} />
                </button>
              </form>
              <p className="petgpt-disclaimer">
                PetGPT can make mistakes — important concerns should never replace professional veterinary care.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ─── Mobile conversation drawer ─── */}
      {railOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-ink/30 dark:bg-black/50" onClick={() => setRailOpen(false)} aria-hidden="true" />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col border-r border-line bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between p-3">
              <button
                type="button"
                onClick={startNewChat}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-white"
              >
                <Icon name="plus" /> New chat
              </button>
              <button
                type="button"
                onClick={() => setRailOpen(false)}
                className="ml-2 rounded-lg p-2 text-ink-light hover:bg-pink-50 dark:text-slate-400 dark:hover:bg-slate-800"
                aria-label="Close conversations"
              >
                <Icon name="x" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-3">
              {conversations === null ? (
                <p className="p-3 text-sm text-ink-light dark:text-slate-400">Loading…</p>
              ) : conversations.length === 0 ? (
                <p className="p-3 text-sm text-ink-light dark:text-slate-400">No conversations yet.</p>
              ) : (
                conversations.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={`mb-1 flex w-full flex-col gap-0.5 rounded-xl px-3 py-2.5 text-left ${
                      c.id === activeId
                        ? 'bg-pink-50 text-pink-700 dark:bg-pink-950/40 dark:text-pink-200'
                        : 'text-ink hover:bg-pink-50/60 dark:text-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className="truncate text-sm font-medium">{c.title || 'New conversation'}</span>
                    {c.lastMessagePreview && (
                      <span className="truncate text-xs text-ink-light dark:text-slate-400">{c.lastMessagePreview}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Avatar() {
  return (
    <span className="petgpt-avatar mt-0.5">
      <Icon name="sparkles" className="text-sm" />
    </span>
  )
}

function TypingDots() {
  return (
    <span className="flex items-center gap-1">
      <span className="petgpt-dot h-1.5 w-1.5 rounded-full" />
      <span className="petgpt-dot h-1.5 w-1.5 rounded-full" style={{ animationDelay: '0.15s' }} />
      <span className="petgpt-dot h-1.5 w-1.5 rounded-full" style={{ animationDelay: '0.3s' }} />
    </span>
  )
}

const TOOL_LABELS: Record<string, string> = {
  get_my_pets: 'Read my pets',
  get_pet_details: 'Read pet details',
  get_pet_health: 'Read health records',
  get_pet_vaccinations: 'Read vaccination history',
  get_pet_appointments: 'Read appointments',
  get_pet_reminders: 'Read reminders',
  create_reminder: 'Created a reminder',
  complete_reminder: 'Completed a reminder',
}

interface MessageRowProps {
  role: PetGPTRole
  content: string
  time: string
  toolCalls?: { name: string; ok: boolean; error?: string }[]
  onRetry?: () => void
  retrying?: boolean
  failed?: boolean
}

function MessageRow({ role, content, time, toolCalls, onRetry, retrying, failed }: MessageRowProps) {
  const isUser = role === 'user'

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[88%] sm:max-w-[78%]">
          {failed && (
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <Icon name="triangle-exclamation" /> Could not get a reply
            </p>
          )}
          <div className="petgpt-bubble petgpt-bubble-user">{content}</div>
          <p className="petgpt-meta text-right">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div className="max-w-[88%] sm:max-w-[78%]">
        <div className="petgpt-bubble petgpt-bubble-assistant rounded-tl-sm">
          {content ? (
            <div className="petgpt-answer">{content}</div>
          ) : (
            <p style={{ color: 'var(--pg-muted)' }}>PetGPT didn&apos;t return a reply.</p>
          )}

          {toolCalls && toolCalls.length > 0 && (
            <div className="petgpt-tools">
              {toolCalls.map((t, i) => (
                <span
                  key={`${t.name}-${i}`}
                  title={t.error || undefined}
                  className={`petgpt-tool ${t.ok ? 'petgpt-tool-ok' : 'petgpt-tool-fail'}`}
                >
                  <Icon name={t.ok ? 'circle-check' : 'circle-xmark'} className="text-[10px]" />
                  {TOOL_LABELS[t.name] || t.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <p className="petgpt-meta">
          {time}
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              className="ml-2 inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:bg-pink-50 disabled:opacity-60 dark:hover:bg-slate-800"
            >
              <Icon name={retrying ? 'spinner' : 'rotate'} spin={retrying} /> {retrying ? 'Resending…' : 'Try again'}
            </button>
          )}
        </p>
      </div>
    </div>
  )
}