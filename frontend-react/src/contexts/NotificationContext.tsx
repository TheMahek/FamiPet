// Centralized notification state.
//
// Before this, eleven pages each mounted their own copy of the bell:
// eleven GET /notifications fetches on navigation, eleven unread
// counters that were only correct on the page you happened to be on,
// and a notification created by any backend action (booking an
// appointment, an adoption decision) stayed invisible until a manual
// reload. Eleven copies of the same state also drifted apart.
//
// One provider now owns the list, so:
//   * a newly created notification shows up on its own (polling), and
//     immediately on the next window focus — no page reload;
//   * read/unread state has exactly one home, and it stays
//     authoritative in MongoDB, not here.
//
// Polling, not Socket.IO/SSE: the backend emits nothing for this
// today, and a socket in the notification path is more moving parts
// than the problem needs. 60s + on focus is enough for "a reminder
// fired and I want to know".

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getNotifications, markAllNotificationsRead, type AppNotification } from '../api/notifications'
import { NotificationContext } from './notification'

const POLL_MS = 60_000

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[] | null>(null)
  // A poll still in flight when the next tick (or a focus refresh)
  // fires is skipped, so a slow request can never land out of order
  // and re-introduce a stale list.
  const inFlight = useRef(false)

  const load = useCallback(() => {
    if (inFlight.current) return
    inFlight.current = true
    getNotifications()
      .then((res) => setNotifications(res.notifications || []))
      // A failed poll keeps whatever is on screen instead of blanking the
      // inbox; a first-load failure still shows the empty state.
      .catch(() => setNotifications((list) => list ?? []))
      .finally(() => {
        inFlight.current = false
      })
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, POLL_MS)

    // Coming back to the tab is the moment a user most expects to see
    // something new, so refresh immediately rather than waiting.
    const onVisible = () => {
      if (document.visibilityState === 'visible') load()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [load])

  const markAllRead = useCallback(() => {
    // Optimistic, exactly as every page did before; the next poll
    // reconciles with the server.
    setNotifications((list) => (list || []).map((n) => ({ ...n, isRead: true })))
    markAllNotificationsRead().catch(() => {})
  }, [])

  const value = useMemo(
    () => ({
      notifications,
      unreadCount: (notifications || []).filter((n) => !n.isRead).length,
      refresh: load,
      markAllRead,
    }),
    [notifications, load, markAllRead],
  )

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>
}
