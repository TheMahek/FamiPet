// Browser Push plumbing — the only place that touches
// Notification / PushManager / ServiceWorkerRegistration.
//
// The ways push cannot work are all real and all handled here rather
// than pretended away:
//   * no browser support (Notification / PushManager missing)
//   * not a secure context (http:// on a LAN address is NOT enough —
//     service workers and push require https or localhost)
//   * permission denied (and the user is never re-prompted afterwards)
//   * the server has no VAPID keys (push is off server-side)
//
// The permission prompt is requested ONLY from an explicit user action
// (`enablePushNotifications`), never on mount.

import { getVapidPublicKey, savePushSubscription } from './notifications'

export type PushState =
  | 'unsupported' // browser has no push support
  | 'insecure' // not a secure context (LAN http, etc.)
  | 'denied' // user blocked notifications for this origin
  | 'off' // supported + permitted, but not subscribed (or server not configured)
  | 'on' // subscribed on this device

export const SW_PATH = '/sw.js'

// The VAPID public key is public by design, but it is only obtainable
// from an authenticated endpoint, so it is cached here and handed to
// the service worker (which holds no auth token).
let publicKeyCache = ''

export function isPushSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

// `window.isSecureContext` is exactly the rule the browser itself uses
// for service workers, so we ask it rather than guessing from the URL.
export function isSecureContext(): boolean {
  return typeof window !== 'undefined' && window.isSecureContext === true
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const output = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i)
  return output
}

export async function fetchVapidPublicKey(): Promise<string | null> {
  try {
    const data = await getVapidPublicKey()
    publicKeyCache = data.configured && data.publicKey ? data.publicKey : ''
    return publicKeyCache || null
  } catch {
    publicKeyCache = ''
    return null
  }
}

function postKeyTo(worker: ServiceWorker | null) {
  if (worker && publicKeyCache) {
    worker.postMessage({ type: 'FAMIPET_VAPID_PUBLIC_KEY', publicKey: publicKeyCache })
  }
}

/** Register the service worker. Idempotent; resolves null if it cannot. */
export function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return Promise.resolve(null)
  return navigator.serviceWorker
    .register(SW_PATH)
    .then((registration) => {
      postKeyTo(registration.active)
      return registration
    })
    .catch(() => null)
}

// The worker asks the (authenticated) page for what it cannot do itself.
// Two messages, both app-wide because rotation can happen on any page:
//   * FAMIPET_REQUEST_VAPID_KEY            -> the key it needs to re-subscribe
//   * FAMIPET_PUSH_SUBSCRIPTION_CHANGED    -> the fresh subscription to store
if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data
    if (!data || typeof data.type !== 'string') return

    if (data.type === 'FAMIPET_REQUEST_VAPID_KEY') {
      // The key only lives in memory for this load. Fetch it when the user
      // has not opened Settings yet, otherwise a rotation in a fresh session
      // could not re-subscribe at all.
      void (async () => {
        const key = publicKeyCache || (await fetchVapidPublicKey()) || ''
        navigator.serviceWorker.controller?.postMessage({
          type: 'FAMIPET_VAPID_PUBLIC_KEY',
          publicKey: key,
        })
      })()
      return
    }

    if (data.type === 'FAMIPET_PUSH_SUBSCRIPTION_CHANGED') {
      // The worker holds no auth token, so the page stores the rotated
      // subscription. One tab is asked, but if several answer the POST is an
      // upsert on a unique endpoint, so it stays idempotent.
      const reply = (type: string) => {
        const source = event.source
        if (source && 'postMessage' in source) source.postMessage({ type })
      }
      void (async () => {
        try {
          await savePushSubscription(data.subscription)
          reply('FAMIPET_PUSH_SUBSCRIPTION_SAVED')
        } catch {
          reply('FAMIPET_PUSH_SUBSCRIPTION_FAILED')
        }
      })()
    }
  })
}

async function activeRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isPushSupported()) return null
  if (!(await registerServiceWorker())) return null
  // `ready` waits for an ACTIVE worker, which `register` alone does not
  // guarantee on the very first load.
  try {
    return await navigator.serviceWorker.ready
  } catch {
    return null
  }
}

/** Current push state, without prompting for anything. */
export async function getPushState(): Promise<PushState> {
  if (!isPushSupported()) return 'unsupported'
  if (!isSecureContext()) return 'insecure'
  if (Notification.permission === 'denied') return 'denied'
  if (!(await fetchVapidPublicKey())) return 'off'

  try {
    const registration = await activeRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    return subscription ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

export interface PushSubscriptionPayload {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushResult {
  ok: boolean
  /** Why it failed, in user-facing terms ('' on success). */
  reason: string
  state?: PushState
  /** Present on success when a subscription was created (or removed). */
  subscription?: PushSubscriptionPayload
  /** Present on success when a subscription was removed. */
  endpoint?: string
}

/**
 * Subscribe this device. MUST be called from an explicit user action:
 * this is what requests the permission prompt.
 */
export async function enablePushNotifications(): Promise<PushResult> {
  if (!isPushSupported()) {
    return { ok: false, reason: 'This browser does not support push notifications.', state: 'unsupported' }
  }
  if (!isSecureContext()) {
    return {
      ok: false,
      reason: 'Push notifications need a secure connection (https, or localhost).',
      state: 'insecure',
    }
  }

  let permission = Notification.permission
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission()
    } catch {
      return { ok: false, reason: 'The browser blocked the permission request.' }
    }
  }
  if (permission !== 'granted') {
    // Once denied the browser will not prompt again for this origin —
    // say so instead of silently doing nothing.
    return {
      ok: false,
      reason: 'Notifications are blocked for this site. Re-enable them in your browser settings.',
      state: 'denied',
    }
  }

  const publicKey = await fetchVapidPublicKey()
  if (!publicKey) {
    return { ok: false, reason: 'Push notifications are not configured on this server.' }
  }

  try {
    const registration = await activeRegistration()
    if (!registration) return { ok: false, reason: 'The service worker could not be registered.' }

    postKeyTo(registration.active)
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })
    return { ok: true, reason: '', subscription: subscription.toJSON() as PushSubscriptionPayload }
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'Push subscription failed.' }
  }
}

/** Unsubscribe this device. Safe to call when there is no subscription. */
export async function disablePushNotifications(): Promise<PushResult> {
  if (!isPushSupported()) return { ok: true, reason: '' }
  try {
    const registration = await activeRegistration()
    const subscription = registration ? await registration.pushManager.getSubscription() : null
    if (subscription) {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      return { ok: true, reason: '', endpoint }
    }
    return { ok: true, reason: '' }
  } catch (error) {
    return { ok: false, reason: (error as Error).message || 'Could not unsubscribe.' }
  }
}
