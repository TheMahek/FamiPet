import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { registerServiceWorker } from './api/push'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Web Push service worker (public/sw.js — native Push API, no Workbox).
// Registered on load, outside React, so the worker exists even before the user
// visits Settings. It is a no-op where push is impossible (no support, not a
// secure context) and never throws: `registerServiceWorker` resolves null on
// failure. The actual permission prompt is only ever requested from an
// explicit Settings action.
registerServiceWorker()
