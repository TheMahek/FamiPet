import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Icon } from '../components/shared/Icon'
import { NotificationBell } from '../components/shared/NotificationBell'
import { NotificationProvider } from '../contexts/NotificationContext'
import { useAuth } from '../hooks/useAuth'

// Parity with sidebar.js: the off-canvas state lives on `body.sidebar-open`;
// the toggle + overlay are rendered here (Vanilla appends them to <body>). The
// menu/x glyphs are stateful bundled icons — Instant CRUD via props.
//
// AppLayout also owns the two app-level concerns that used to be copied into
// every page: the ONE notification bell, and the notification state behind it
// (NotificationProvider polls, so a notification created anywhere in the app
// shows up here without a page reload). The provider is mounted only for a
// signed-in user, so a public page never polls the authenticated endpoint.

function AppShell({ showBell = false }: { showBell?: boolean }) {
  const [open, setOpen] = useState(false)

  const applyOpen = (next: boolean) => {
    setOpen(next)
    document.body.classList.toggle('sidebar-open', next)
  }

  return (
    <>
      <div className="app">
        <div id="sidebar-container">
          <Sidebar onNavigate={() => applyOpen(false)} />
        </div>

        <main className="main-content">
          <Outlet />
        </main>
      </div>

      {showBell && <NotificationBell />}

      <button
        type="button"
        className="mobile-sidebar-toggle"
        aria-label={open ? 'Close navigation' : 'Open navigation'}
        onClick={() => applyOpen(!open)}
      >
        <Icon name={open ? 'x' : 'menu'} />
      </button>

      <div className="mobile-sidebar-overlay" aria-hidden="true" onClick={() => applyOpen(false)} />
    </>
  )
}

export function AppLayout() {
  const { isAuthenticated } = useAuth()

  if (!isAuthenticated) return <AppShell />

  return (
    <NotificationProvider>
      <AppShell showBell />
    </NotificationProvider>
  )
}