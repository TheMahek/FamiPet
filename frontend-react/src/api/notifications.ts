// Notifications API — backend contract from
// backend/routes/notification.routes.js.

import { apiDelete, apiGet, apiPost, apiPut } from './client'

export interface AppNotification {
  _id: string
  title?: string
  message?: string
  isRead?: boolean
  createdAt?: string
}

export interface NotificationsResponse {
  success?: boolean
  count?: number
  notifications?: AppNotification[]
}

export function getNotifications(): Promise<NotificationsResponse> {
  return apiGet<NotificationsResponse>('/notifications')
}

export function markAllNotificationsRead(): Promise<{ success?: boolean; message?: string }> {
  return apiPut<{ success?: boolean; message?: string }>('/notifications/read-all')
}

/* ---------------- PUSH SUBSCRIPTION ----------------
   Browser Push (VAPID). Ownership always comes from the Bearer
   token — no endpoint here sends a user id. */

export interface VapidKeyResponse {
  success?: boolean
  /** false when the server has no VAPID keys configured (push off, fail-closed). */
  configured?: boolean
  publicKey?: string | null
}

export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export function getVapidPublicKey(): Promise<VapidKeyResponse> {
  return apiGet<VapidKeyResponse>('/notifications/vapid-public-key')
}

export function savePushSubscription(
  subscription: { endpoint: string; keys: PushSubscriptionKeys },
): Promise<{ success?: boolean; message?: string }> {
  return apiPost<{ success?: boolean; message?: string }>('/notifications/push-subscription', subscription)
}

export function deletePushSubscription(
  endpoint: string,
): Promise<{ success?: boolean; message?: string }> {
  return apiDelete<{ success?: boolean; message?: string }>(
    `/notifications/push-subscription?endpoint=${encodeURIComponent(endpoint)}`,
  )
}
