import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ThemeToggle } from './ThemeToggle'
import { Icon } from './Icon'

// Parity with the Vanilla landing header (frontend/index.html). The nav links
// anchor to on-page sections; "Home" carries the static active state exactly
// as in the original markup. `.menu-toggle` unhides at <=992px, where
// `.nav-menu` / `.nav-right` are hidden — Vanilla never gave it a handler, so
// the bar showed a hamburger that did nothing and the nav was unreachable on
// phones. It now toggles `.nav-open`, which navbar.css uses to stack the two
// groups under the bar.

const navLinks = [
  { label: 'Home', href: '#home', active: true },
  { label: 'Services', href: '#services' },
  { label: 'About', href: '#about' },
  { label: 'Why Us', href: '#why-us' },
  { label: 'Join Us', href: '#join-us' },
  { label: 'Contact', href: '#contact' },
]

export function Navbar() {
  const [open, setOpen] = useState(false)

  // Collapse the panel when the viewport grows past the breakpoint that hides
  // it, otherwise `.nav-open` stays on and the desktop bar inherits the mobile
  // wrap once the user shrinks the window again.
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 993px)')

    const sync = () => {
      if (desktop.matches) setOpen(false)
    }

    desktop.addEventListener('change', sync)
    return () => desktop.removeEventListener('change', sync)
  }, [])

  const close = () => setOpen(false)

  return (
    <header className="header">
      <div className={open ? 'container navbar nav-open' : 'container navbar'}>
        <Link to="/" className="logo" aria-label="Famipet home">
          <img src="/assets/logos/Famipet.png" alt="Famipet Logo" />
        </Link>

        <nav className="nav-menu">
          <ul className="nav-links">
            {navLinks.map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  className={link.active ? 'active' : undefined}
                  onClick={close}
                >
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="nav-right">
          <ThemeToggle />

          <Link to="/login" className="login-btn">
            Login
          </Link>

          <Link to="/signup" className="signup-btn">
            Sign Up
          </Link>
        </div>

        <button
          type="button"
          className="menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <Icon name={open ? 'x' : 'menu'} />
        </button>
      </div>
    </header>
  )
}