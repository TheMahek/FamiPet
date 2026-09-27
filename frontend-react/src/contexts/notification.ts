import { createContext } from 'react'
import type { AppNotification } from '../api/notifications'

export interface NotificationContextValue {
  /** null while the first load is in flight (renders a neutral placeholder). */
  notifications: AppNotification[] | null
  unreadCount: number
  /** Re-fetch now (used on mount, on an interval and on window focus). */
  refresh: () => void
  markAllRead: () => void
}

export const NotificationContext = createContext<NotificationContextValue | null>(null)
