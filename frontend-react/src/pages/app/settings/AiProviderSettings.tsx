// AI Provider section of Settings — user-owned PetGPT provider configuration
// (backend Phase 3, controllers/provider.controller.js).
//
// Everything shown here is real backend data (AGENTS §5): the list comes from
// GET /ai/providers and nothing is inferred when the list is empty. With no
// configuration the backend silently uses its own env credentials, so the
// empty state says exactly that instead of implying PetGPT is set up.
//
// Secrets: the backend encrypts the API key and never returns it — the only
// credential signal it exposes is `configured: boolean`. So the key input is
// write-only: empty, masked, and cleared the moment a save succeeds. It is
// never read back from the server, never put in localStorage, and never sent
// on an update that did not replace it.

import { useCallback, useEffect, useState } from 'react'
import {
  createProvider,
  deleteProvider,
  listProviders,
  testProvider,
  updateProvider,
  type PetGPTProvider,
  type ProviderInput,
} from '../../../api/petgpt'
import { Icon } from '../../../components/shared/Icon'
import { getErrorMessage } from '../../../lib/errors'

// The three choices the user makes. `provider` is the backend registry key
// (ai/index.js registers "google" and "openai"); `needsBaseUrl` mirrors the
// controller's rule that baseUrl is required for OpenAI-compatible configs.
// "OpenAI" is just "OpenAI-compatible" pointed at the real OpenAI host, so
// there is no third adapter and no provider-specific branch downstream.
type Choice = 'gemini' | 'openai' | 'compatible'

const CHOICES: { value: Choice; label: string; provider: string; needsBaseUrl: boolean; hint: string; model: string; baseUrl: string }[] = [
  {
    value: 'gemini',
    label: 'Google Gemini',
    provider: 'google',
    needsBaseUrl: false,
    hint: 'Uses the native Gemini adapter.',
    model: 'gemini-2.0-flash',
    baseUrl: '',
  },
  {
    value: 'openai',
    label: 'OpenAI',
    provider: 'openai',
    needsBaseUrl: true,
    hint: 'api.openai.com. Change the base URL below to use a compatible host instead.',
    model: 'gpt-4o-mini',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    value: 'compatible',
    label: 'OpenAI-compatible endpoint',
    provider: 'openai',
    needsBaseUrl: true,
    hint: 'Any server that speaks POST {base URL}/chat/completions.',
    model: '',
    baseUrl: '',
  },
]

// A stored config maps back onto a choice. Gemini is exact; any openai config
// with the canonical OpenAI host is "OpenAI", everything else is "compatible".
function choiceOf(p: PetGPTProvider): Choice {
  if (p.provider !== 'openai') return 'gemini'
  return /(^|\.)openai\.com$/i.test(baseHost(p.baseUrl)) ? 'openai' : 'compatible'
}

function baseHost(baseUrl: string): string {
  const m = /^[a-z]+:\/\/([^/]+)/i.exec(baseUrl.trim())
  return m ? m[1] : ''
}

const CHOICE_BY_VALUE: Record<Choice, (typeof CHOICES)[number]> = {
  gemini: CHOICES[0],
  openai: CHOICES[1],
  compatible: CHOICES[2],
}

function presetFor(choice: Choice) {
  return CHOICE_BY_VALUE[choice]
}

// /test answers 200 with ok:false for provider-side problems. Map the
// normalized backend code to copy the user can act on. The backend never
// returns the key or why a key was rejected beyond its own class of error.
function testFailureText(code: string, status?: number): string {
  switch (code) {
    case 'config':
      return 'Could not read the saved credentials. The key may be wrong, or the server encryption secret is not set.'
    case 'timeout':
      return 'The provider did not answer in time. Check the base URL and try again.'
    case 'http':
      return status === 401 || status === 403
        ? 'The provider rejected the credentials (it checked them and said no). Double-check the key.'
        : `The provider returned an error${status ? ` (HTTP ${status})` : ''}.`
    case 'malformed':
      return 'The provider replied in an unexpected format. Confirm the base URL and model.'
    default:
      return 'The provider could not be reached. Check the base URL and your connection.'
  }
}

interface FormState {
  id: string | null
  choice: Choice
  name: string
  model: string
  baseUrl: string
  apiKey: string
  keyVisible: boolean
  enabled: boolean
  active: boolean
  configured: boolean
}

function blankForm(): FormState {
  return {
    id: null,
    choice: 'gemini',
    name: '',
    model: CHOICES[0].model,
    baseUrl: '',
    apiKey: '',
    keyVisible: false,
    enabled: true,
    active: true,
    configured: false,
  }
}

function formOf(p: PetGPTProvider): FormState {
  const choice = choiceOf(p)
  return {
    id: p.id,
    choice,
    name: p.name,
    model: p.model,
    baseUrl: p.baseUrl || '',
    // Never prefilled: the stored key is not retrievable. An empty field here
    // means "keep the saved key", which is the only correct reading of an
    // update that omits apiKey.
    apiKey: '',
    keyVisible: false,
    enabled: p.enabled,
    active: p.active,
    configured: p.configured,
  }
}

export function AiProviderSettings() {
  // null = first load in flight, so we can tell "not configured" from "not loaded yet".
  const [providers, setProviders] = useState<PetGPTProvider[] | null>(null)
  const [loadError, setLoadError] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [formOk, setFormOk] = useState('')
  const [busyId, setBusyId] = useState('')
  const [testResult, setTestResult] = useState<{ id: string; ok: boolean; text: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState('')

  const load = useCallback(() => {
    setLoadError('')
    listProviders()
      .then((res) => setProviders(res.providers || []))
      .catch((err) => {
        setProviders([])
        setLoadError(getErrorMessage(err, 'Could not load your AI provider settings.'))
      })
  }, [])

  useEffect(() => { load() }, [load])

  const active = (providers || []).find((p) => p.active && p.enabled) || null
  const list = providers || []

  /* ---------------- FORM ---------------- */

  const startCreate = () => {
    setFormError('')
    setFormOk('')
    setTestResult(null)
    setForm(blankForm())
  }

  const startEdit = (p: PetGPTProvider) => {
    setFormError('')
    setFormOk('')
    setTestResult(null)
    setForm(formOf(p))
  }

  const cancel = () => {
    // Dropping the form drops the typed key with it.
    setForm(null)
    setFormError('')
    setFormOk('')
  }

  const setChoice = (choice: Choice) => {
    const preset = presetFor(choice)
    setForm((f) => {
      if (!f) return f
      // Switching provider keeps what the user typed for a same-shape field and
      // re-seeds only the ones whose value belongs to the other provider.
      const sameShape = presetFor(f.choice).needsBaseUrl === preset.needsBaseUrl
      // Picking "OpenAI-compatible" while the field still holds the canonical
      // OpenAI host would silently point at OpenAI, so clear that one case.
      const staleOpenAi = choice === 'compatible' && baseHost(f.baseUrl).endsWith('openai.com')
      return {
        ...f,
        choice,
        model: sameShape ? f.model : preset.model,
        baseUrl: sameShape && !staleOpenAi ? f.baseUrl : preset.baseUrl,
      }
    })
  }

  // Only send fields the form actually owns. An empty apiKey is OMITTED on
  // update (backend keeps the stored key) and rejected as a validation error on
  // create — the backend is the authority on both, we just avoid sending noise.
  const buildPayload = (): ProviderInput => {
    const preset = presetFor(form!.choice)
    const payload: ProviderInput = {
      provider: preset.provider,
      name: form!.name.trim() || preset.label,
      model: form!.model.trim(),
      enabled: form!.enabled,
      active: form!.active,
    }
    if (preset.needsBaseUrl) payload.baseUrl = form!.baseUrl.trim()
    if (form!.apiKey.trim()) payload.apiKey = form!.apiKey.trim()
    return payload
  }

  const save = async () => {
    if (!form) return
    const creating = !form.id
    if (creating && !form.apiKey.trim()) {
      setFormError('An API key is required to add a provider.')
      return
    }
    setSaving(true)
    setFormError('')
    setFormOk('')
    setTestResult(null)
    try {
      const payload = buildPayload()
      const res = creating
        ? await createProvider(payload)
        : await updateProvider(form.id as string, payload)
      // Clear the plaintext key out of state the moment it is no longer needed.
      setForm((f) => (f ? { ...f, id: res.provider.id, apiKey: '', keyVisible: false, configured: true, active: res.provider.active, enabled: res.provider.enabled } : f))
      setFormOk(creating ? 'Provider added.' : 'Provider updated.')
      setProviders((cur) => (cur ? sortProviders(replaceProvider(cur, res.provider)) : cur))
    } catch (err) {
      setFormError(getErrorMessage(err, 'Could not save this provider.'))
    } finally {
      setSaving(false)
    }
  }

  const runTest = async (p: PetGPTProvider) => {
    setBusyId(p.id)
    setTestResult(null)
    try {
      const res = await testProvider(p.id)
      setTestResult({
        id: p.id,
        ok: res.ok,
        text: res.ok
          ? `Connected${res.latencyMs ? ` in ${res.latencyMs}ms` : ''}.`
          : testFailureText(res.error?.code || 'unknown', res.error?.status),
      })
    } catch (err) {
      setTestResult({ id: p.id, ok: false, text: getErrorMessage(err, 'Could not test this provider.') })
    } finally {
      setBusyId('')
    }
  }

  const activate = async (p: PetGPTProvider) => {
    setBusyId(p.id)
    setTestResult(null)
    try {
      const res = await updateProvider(p.id, { active: true, enabled: true })
      // The backend demotes every sibling; mirror that in one pass from the
      // authoritative response instead of trusting local state.
      setProviders((cur) =>
        cur
          ? sortProviders(
              cur.map((x) => (x.id === res.provider.id ? res.provider : x.active ? { ...x, active: false } : x)),
            )
          : cur,
      )
    } catch (err) {
      setTestResult({ id: p.id, ok: false, text: getErrorMessage(err, 'Could not activate this provider.') })
    } finally {
      setBusyId('')
    }
  }

  const remove = async (p: PetGPTProvider) => {
    if (confirmDelete !== p.id) {
      setConfirmDelete(p.id)
      return
    }
    setBusyId(p.id)
    setTestResult(null)
    try {
      await deleteProvider(p.id)
      setProviders((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur))
      if (form && form.id === p.id) cancel()
    } catch (err) {
      setTestResult({ id: p.id, ok: false, text: getErrorMessage(err, 'Could not delete this provider.') })
    } finally {
      setConfirmDelete('')
      setBusyId('')
    }
  }

  /* ---------------- RENDER ---------------- */

  const preset = form ? presetFor(form.choice) : null
  const status = loadingStatus(list, active, providers === null)

  return (
    <section className="settings-card">
      <div className="settings-card-title">
        <div className="settings-icon">
          <Icon name="sparkles" />
        </div>
        <div>
          <h2>AI Provider</h2>
          <p>Choose the model PetGPT uses for your account. Your key is encrypted and never shown again.</p>
        </div>
      </div>

      {loadError && (
        <div className="form-feedback error" role="alert">
          <Icon name="triangle-exclamation" />
          {loadError}
        </div>
      )}

      <div className={`provider-status${active ? ' on' : ''}`}>
        <Icon name={active ? 'circle-check' : 'circle-question'} />
        <span>{status}</span>
      </div>

      {providers === null ? (
        <div className="pet-empty">Loading your providers…</div>
      ) : list.length === 0 ? (
        <div className="pet-empty">
          No provider configured. PetGPT is running on the server&rsquo;s built-in AI settings, which may be
          unconfigured. Add your own provider below to choose the model and key PetGPT uses for you.
        </div>
      ) : (
        <div className="preferences-list provider-list">
          {list.map((p) => (
            <div className="preference-row" key={p.id}>
              <div className="preference-icon">
                <Icon name={p.provider === 'google' ? 'sparkles' : 'bolt'} />
              </div>
              <div className="preference-content">
                <strong>{p.name || p.provider}</strong>
                <span>
                  {p.model}
                  {p.baseUrl ? ` · ${p.baseUrl}` : ''}
                </span>
                <div className="provider-badges">
                  {p.active && p.enabled ? (
                    <span className="provider-badge on">Active</span>
                  ) : (
                    <span className="provider-badge">Not in use</span>
                  )}
                  {!p.enabled && <span className="provider-badge">Disabled</span>}
                  <span className="provider-badge">{p.configured ? 'Key saved' : 'No key'}</span>
                </div>
              </div>
              <div className="provider-actions">
                <button
                  type="button"
                  className="ghost-btn"
                  disabled={busyId === p.id}
                  onClick={() => runTest(p)}
                >
                  {busyId === p.id ? <Icon name="loading" spin /> : <Icon name="bolt" />}
                  Test
                </button>
                {!(p.active && p.enabled) && (
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={busyId === p.id}
                    onClick={() => activate(p)}
                  >
                    <Icon name="check" />
                    Use
                  </button>
                )}
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={() => startEdit(p)}
                  disabled={busyId === p.id}
                >
                  <Icon name="pen" />
                  Edit
                </button>
                <button
                  type="button"
                  className="ghost-btn danger"
                  disabled={busyId === p.id}
                  onClick={() => remove(p)}
                >
                  <Icon name="trash-2" />
                  {confirmDelete === p.id ? 'Confirm?' : 'Delete'}
                </button>
                {confirmDelete === p.id && (
                  <button
                    type="button"
                    className="ghost-btn"
                    disabled={busyId === p.id}
                    onClick={() => setConfirmDelete('')}
                  >
                    Cancel
                  </button>
                )}
              </div>
              {testResult && testResult.id === p.id && (
                <div className={`form-feedback ${testResult.ok ? 'ok' : 'error'}`} role="status">
                  <Icon name={testResult.ok ? 'circle-check' : 'triangle-exclamation'} />
                  {testResult.text}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {form && preset ? (
        <div className="provider-form">
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="aiProviderType">Provider</label>
              <div className="select-wrapper">
                <select
                  id="aiProviderType"
                  value={form.choice}
                  onChange={(e) => setChoice(e.target.value as Choice)}
                >
                  {CHOICES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <Icon name="chevron-down" />
              </div>
            </div>
            <div className="form-group">
              <label htmlFor="aiProviderModel">Model</label>
              <input
                id="aiProviderModel"
                type="text"
                value={form.model}
                placeholder={preset.model || 'e.g. llama-3.1-8b-instruct'}
                onChange={(e) => setForm({ ...form, model: e.target.value })}
              />
            </div>
          </div>

          {preset.needsBaseUrl && (
            <div className="form-group">
              <label htmlFor="aiProviderBaseUrl">Base URL</label>
              <input
                id="aiProviderBaseUrl"
                type="url"
                value={form.baseUrl}
                placeholder="https://api.example.com/v1"
                onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
              />
            </div>
          )}

          <div className="form-group">
            <label htmlFor="aiProviderName">Display name (optional)</label>
            <input
              id="aiProviderName"
              type="text"
              value={form.name}
              placeholder={preset.label}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label htmlFor="aiProviderKey">API key</label>
            <div className="password-input">
              <input
                id="aiProviderKey"
                type={form.keyVisible ? 'text' : 'password'}
                value={form.apiKey}
                autoComplete="off"
                spellCheck={false}
                placeholder={
                  form.configured
                    ? 'Saved — type a new key to replace it'
                    : 'Paste your provider API key'
                }
                onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              />
              <button
                type="button"
                className="password-eye"
                aria-label={form.keyVisible ? 'Hide API key' : 'Show API key'}
                onClick={() => setForm({ ...form, keyVisible: !form.keyVisible })}
              >
                <Icon name={form.keyVisible ? 'eye-slash' : 'eye'} />
              </button>
            </div>
            <small className="provider-hint">
              {form.configured
                ? 'The saved key cannot be read back. Leave this blank to keep it.'
                : 'Stored encrypted on the server. It is never displayed again.'}
            </small>
          </div>

          <div className="preferences-list">
            <div className="preference-row">
              <div className="preference-icon">
                <Icon name="check" />
              </div>
              <div className="preference-content">
                <strong>Enabled</strong>
                <span>A disabled provider is never used, even if it is the active one.</span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  aria-label="Enabled"
                  onChange={() => setForm({ ...form, enabled: !form.enabled })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
            <div className="preference-row">
              <div className="preference-icon">
                <Icon name="bolt" />
              </div>
              <div className="preference-content">
                <strong>Active</strong>
                <span>
                  {preset.hint} Only one provider is active; activating this one stops using the others.
                </span>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={form.active}
                  aria-label="Active"
                  onChange={() => setForm({ ...form, active: !form.active })}
                />
                <span className="toggle-slider" />
              </label>
            </div>
          </div>

          {formError && (
            <div className="form-feedback error" role="alert">
              <Icon name="triangle-exclamation" />
              {formError}
            </div>
          )}
          {formOk && (
            <div className="form-feedback ok" role="status">
              <Icon name="circle-check" />
              {formOk}
            </div>
          )}

          <div className="form-button-row provider-actions">
            <button type="button" className="ghost-btn" onClick={cancel} disabled={saving}>
              Cancel
            </button>
            <button type="button" className="purple-btn" onClick={save} disabled={saving}>
              {saving ? (
                <>
                  <Icon name="loading" spin />
                  Saving...
                </>
              ) : (
                <>
                  <Icon name="save" />
                  {form.id ? 'Save Changes' : 'Add Provider'}
                </>
              )}
            </button>
          </div>
          <small className="provider-hint">
            Test uses the saved credentials, so save a new key before testing it. Testing never starts a
            conversation and never changes which provider is active.
          </small>
        </div>
      ) : (
        <div className="form-button-row">
          <button type="button" className="purple-btn" onClick={startCreate}>
            <Icon name="plus" />
            Add Provider
          </button>
        </div>
      )}
    </section>
  )
}

// Server-created/updated providers come back already sorted by the backend, but
// a local activate demotes siblings in place; keep the list in createdAt order
// so rows do not jump around while editing.
function sortProviders(list: PetGPTProvider[]): PetGPTProvider[] {
  return [...list].sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.id.localeCompare(b.id))
}

function replaceProvider(list: PetGPTProvider[], p: PetGPTProvider): PetGPTProvider[] {
  return list.some((x) => x.id === p.id)
    ? list.map((x) => (x.id === p.id ? p : x))
    : [...list, p]
}

// One honest sentence about what PetGPT will actually do. "Configured" is only
// claimed when a stored provider is both active and enabled.
function loadingStatus(
  list: PetGPTProvider[],
  active: PetGPTProvider | null,
  loading: boolean,
): string {
  if (loading) return 'Checking your AI provider configuration…'
  if (active) {
    return `PetGPT is using your provider "${active.name || active.provider}" (${active.model}).`
  }
  if (list.length === 0) {
    return 'PetGPT is not configured on your account. It falls back to the server AI settings, which may not be set up.'
  }
  return 'No provider is active, so PetGPT falls back to the server AI settings. Pick a provider below to use your own key.'
}
