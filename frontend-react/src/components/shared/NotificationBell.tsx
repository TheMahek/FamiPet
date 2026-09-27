// The app's ONE notification bell.
//
// Eleven pages used to render their own copy, each with its own fetch,
// its own unread count and its own panel markup. It now lives here, is
// mounted once by AppLayout, and reads the centralized
// NotificationProvider state — so the badge is correct on every page and
// a notification created anywhere in the app appears without a reload.
//
// It is fixed to the viewport rather than slotted into a page header:
// page headers are per-page (`.top-header`, `.top-bar`,
// `.page-header`) and putting the bell in each of them is exactly the
// duplication this replaces. Styles live in styles/notifications.css.

import { useEffect, useRef, useState } from 'react'
import { useNotifications } from '../../hooks/useNotifications'
import { Icon } from './Icon'

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  // click outside + Escape close (parity with the per-page panels)
  useEffect(() => {
    if (!open) return
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const unreadLabel = unreadCount === 1 ? '1 unread' : `${unreadCount} unread`

  return (
    <div className="app-notif" ref={rootRef}>
      <button
        className="app-notif-btn"
        type="button"
        aria-label={unreadCount ? `Notifications (${unreadCount} unread)` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="true"
        title="Notifications"
        onClick={() => setOpen((o) => !o)}
      >
        <Icon name="bell" />
        {unreadCount > 0 && (
          <span className="app-notif-badge" data-testid="notification-unread">
            {unreadCount}
          </span>
        )}
      </button>

      <div className={`app-notif-panel${open ? ' open' : ''}`} role="status" aria-live="polite">
        <div className="app-notif-header">
          <div>
            <strong>Notifications</strong>
            <span>{unreadLabel}</span>
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </div>

        <div className="app-notif-list">
          {notifications === null ? (
            <div className="app-notif-empty">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="app-notif-empty">You&apos;re all caught up!</div>
          ) : (
            notifications.map((n) => (
              <div className={`app-notif-item${n.isRead ? ' read' : ''}`} key={n._id}>
                <span className="app-notif-dot" />
                <div>
                  <strong>{n.title || ''}</strong>
                  <p>{n.message || ''}</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
