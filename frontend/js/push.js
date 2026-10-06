/* =========================================================
   FAMIPET - PUSH NOTIFICATIONS (Phase 6)
   Device-level enable/disable + test for Web Push.
   Deliberately separate from notifications.js: the bell (in-app) and the
   device permission are independent. The `push` channel toggle in the
   preferences decides whether the backend pushes AT ALL; this module only
   manages WHICH device the current account is registered on.
   Requires a secure context (HTTPS). Never auto-prompts — all permission
   flows start from a user click.
   ========================================================= */

window.FamiPetPush = (function () {

  'use strict';

  const SERVICE_WORKER_URL = '/service-worker.js';
  const SERVICE_WORKER_SCOPE = '/';

  const SUPPORTED =
    window.isSecureContext &&
    'serviceWorker' in navigator &&
    'PushManager' in window;

  // ---------------- tiny base64url helpers ----------------
  function concatUint8(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  // The appServerKey from the server arrives as a base64url string (no padding).
  // The Push API wants a Uint8Array of the decoded raw key.
  function urlB64ToUint8Array(base64url) {
    return concatUint8(base64url);
  }

  // PushSubscription#getKey returns an ArrayBuffer → base64url (no padding).
  function arrayBufferToBase64Url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  // ---------------- state ----------------
  let mountRoot = null;
  let publicKey = null;
  let uiBusy = false;

  function uid() {
    return 'psh-' + Math.random().toString(36).slice(2, 10);
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setBusy(busy, button) {
    uiBusy = busy;
    if (!button) return;
    button.disabled = busy;
    if (busy) button.classList.add('push-btn-busy');
    else button.classList.remove('push-btn-busy');
  }

  async function fetchPublicKey() {
    if (publicKey) return publicKey;
    const data = await FamiPetAPI.get('/push/vapid-public-key', { redirectOnAuthError: false });
    if (!data.vapidConfigured || !data.vapidPublicKey) return null;
    publicKey = data.vapidPublicKey;
    return publicKey;
  }

  function formatSubscription(sub) {
    return {
      endpoint: sub.endpoint,
      expirationTime: (typeof sub.expirationTime === 'number') ? sub.expirationTime : null,
      keys: {
        p256dh: arrayBufferToBase64Url(sub.getKey('p256dh')),
        auth: arrayBufferToBase64Url(sub.getKey('auth')),
      },
    };
  }

  function buildSubscriptionPayload(sub) {
    return {
      subscription: formatSubscription(sub),
      userAgent: (navigator.userAgent || '').slice(0, 500),
    };
  }

  async function currentRegistration() {
    try {
      return await navigator.serviceWorker.getRegistration(SERVICE_WORKER_SCOPE);
    } catch (e) {
      return null;
    }
  }

  async function getOrCreateRegistration() {
    return navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: SERVICE_WORKER_SCOPE });
  }

  async function currentPushManagerSubscription() {
    const reg = await currentRegistration();
    if (!reg) return null;
    try {
      return await reg.pushManager.getSubscription();
    } catch (e) {
      return null;
    }
  }

  // ---------------- server sync ----------------
  async function registerOnServer(sub) {
    const response = await FamiPetAPI.post('/push/subscribe', buildSubscriptionPayload(sub));
    return response;
  }

  async function unregisterFromServer(endpoint) {
    await FamiPetAPI.del('/push/unsubscribe', { body: { endpoint } });
  }

  // ---------------- actions ----------------
  async function enablePush() {
    if (uiBusy) return;
    const enableButton = mountRoot && mountRoot.querySelector('[data-push-action="enable"]');

    setBusy(true, enableButton);
    render({ busy: true });

    try {
      const key = await fetchPublicKey();
      if (!key) {
        render({ notConfigured: true });
        return;
      }

      if (!('Notification' in window)) {
        render({ unsupported: true });
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission === 'denied') {
        render({ denied: true });
        return;
      }
      if (permission !== 'granted') {
        render({ promptPending: true });
        return;
      }

      const reg = await getOrCreateRegistration();
      await navigator.serviceWorker.ready;
      const applicationServerKey = urlB64ToUint8Array(key);

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey,
        });
      }

      await registerOnServer(sub);
      render({ subscribed: true });
    } catch (err) {
      console.error('[Push] enable failed:', err && err.message);
      render({ error: 'Could not enable push on this device. ' + ((err && err.message) || '') });
    } finally {
      setBusy(false, enableButton);
    }
  }

  async function disablePush() {
    if (uiBusy) return;
    const disableButton = mountRoot && mountRoot.querySelector('[data-push-action="disable"]');

    setBusy(true, disableButton);
    render({ busy: true });

    try {
      let endpoint = null;
      const reg = await currentRegistration();
      if (reg) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          endpoint = sub.endpoint;
          try { await sub.unsubscribe(); } catch (unsubErr) { /* best-effort */ }
        }
      }
      if (endpoint) {
        await unregisterFromServer(endpoint);
      }
      render({ default: true });
    } catch (err) {
      console.error('[Push] disable failed:', err && err.message);
      render({ error: 'Could not disable push. ' + ((err && err.message) || '') });
    } finally {
      setBusy(false, disableButton);
    }
  }

  async function sendTest() {
    if (uiBusy) return;
    const testButton = mountRoot && mountRoot.querySelector('[data-push-action="test"]');
    setBusy(true, testButton);

    try {
      const data = await FamiPetAPI.post('/push/test');
      render({ subscribed: true, flash: `Test push sent (${data.sent || 0} device${data.sent === 1 ? '' : 's'}).` });
    } catch (err) {
      render({ subscribed: true, error: 'Test failed: ' + ((err && err.message) || '') });
    } finally {
      setBusy(false, testButton);
    }
  }

  // ---------------- render ----------------
  function render(state) {
    if (!mountRoot) return;
    const flag =
      state.busy ? 'busy' :
      state.unsupported ? 'unsupported' :
      state.notConfigured ? 'notConfigured' :
      state.denied ? 'denied' :
      state.error ? 'error' :
      state.promptPending ? 'promptPending' :
      state.subscribed ? 'subscribed' :
      state.default ? 'default' : '';

    const statusEl = mountRoot.querySelector('[data-push-status-text]');
    const buttonsEl = mountRoot.querySelector('[data-push-actions]');

    let statusText = '';
    switch (flag) {
      case 'unsupported':
        statusText = 'Push is not available in this browser. It requires a secure (HTTPS) connection and browser support.';
        break;
      case 'notConfigured':
        statusText = 'Push is not set up on this server yet.';
        break;
      case 'denied':
        statusText = 'Notifications are blocked in your browser settings. Unblock them to enable push.';
        break;
      case 'promptPending':
        statusText = 'Notification permission was not granted. You can try again below.';
        break;
      case 'error':
        statusText = state.error || 'Something went wrong.';
        break;
      case 'busy':
        statusText = 'Working…';
        break;
      case 'subscribed':
        statusText = state.flash || 'Push is enabled on this device.';
        break;
      default:
        statusText = 'When enabled, Famipet can notify you on this device even with the page closed.';
        break;
    }

    if (statusEl) statusEl.textContent = statusText;

    if (!buttonsEl) return;

    const hasSubscribedState = flag === 'subscribed';
    const canTakeAction =
      (flag === 'default' || flag === 'promptPending' || flag === 'error') &&
      !state.defaultPromptBlocked;

    // Primary button: Enable (shown whenever we're not subscribed/denied/busy).
    let enableBtn = buttonsEl.querySelector('[data-push-action="enable"]');
    if (!enableBtn) {
      enableBtn = el('button', 'push-btn push-btn-primary', 'Enable push');
      enableBtn.type = 'button';
      enableBtn.dataset.pushAction = 'enable';
      enableBtn.addEventListener('click', enablePush);
      buttonsEl.appendChild(enableBtn);
    }
    enableBtn.style.display = hasSubscribedState ? 'none' : '';

    // Test button (subscribed only).
    let testBtn = buttonsEl.querySelector('[data-push-action="test"]');
    if (!testBtn) {
      testBtn = el('button', 'push-btn', 'Send test');
      testBtn.type = 'button';
      testBtn.dataset.pushAction = 'test';
      testBtn.addEventListener('click', sendTest);
      buttonsEl.appendChild(testBtn);
    }
    testBtn.style.display = hasSubscribedState ? '' : 'none';

    // Disable button (subscribed only).
    let disableBtn = buttonsEl.querySelector('[data-push-action="disable"]');
    if (!disableBtn) {
      disableBtn = el('button', 'push-btn push-btn-danger', 'Disable');
      disableBtn.type = 'button';
      disableBtn.dataset.pushAction = 'disable';
      disableBtn.addEventListener('click', disablePush);
      buttonsEl.appendChild(disableBtn);
    }
    disableBtn.style.display = hasSubscribedState ? '' : 'none';

    if (flag === 'busy') {
      enableBtn.disabled = true;
      testBtn.disabled = true;
      disableBtn.disabled = true;
    } else {
      enableBtn.disabled = false;
      testBtn.disabled = false;
      disableBtn.disabled = false;
    }
  }

  // ---------------- init ----------------
  async function init(container) {
    if (!container) return;
    mountRoot = container;

    if (!SUPPORTED) {
      mountRoot.innerHTML = '';
      mountRoot.appendChild(buildShell('unsupported'));
      render({ unsupported: true });
      return;
    }

    if (!FamiPetAPI.isLoggedIn()) {
      mountRoot.innerHTML = '';
      return;
    }

    mountRoot.innerHTML = '';
    mountRoot.appendChild(buildShell('busy'));
    render({ busy: true });

    try {
      const key = await fetchPublicKey();
      if (!key) {
        render({ notConfigured: true });
        return;
      }

      const localSub = await currentPushManagerSubscription();

      if ('Notification' in window && Notification.permission === 'denied') {
        render({ denied: true });
        return;
      }

      if (localSub) {
        // Already subscribed on this browser: reassert it to the server so it
        // stays in sync (and an account switch re-attributes the endpoint to
        // the currently signed-in user). Never re-prompts.
        try {
          await registerOnServer(localSub);
        } catch (reassertErr) {
          console.warn('[Push] reassert failed (non-fatal):', reassertErr.message);
        }
        render({ subscribed: true });
      } else {
        render({ default: true });
      }
    } catch (err) {
      console.error('[Push] init failed:', err && err.message);
      render({ error: 'Could not initialize push. ' + ((err && err.message) || '') });
    }
  }

  // Build the static shell; the render() pass fills in dynamic pieces.
  function buildShell(initialFlag) {
    const group = el('div', 'preferences-group push-control');
    group.dataset.pushControl = '';

    const heading = el('div', 'preferences-heading');
    heading.textContent = 'Push Notifications';
    const hint = el('p', 'preferences-subtext');
    hint.innerHTML = 'Get notified on this device even when the page is closed. Requires HTTPS.';
    group.appendChild(heading);
    group.appendChild(hint);

    const row = el('div', 'preferences-row push-status-row');

    const dot = el('span', 'push-status-dot');
    dot.dataset.pushStatusDot = '';
    row.appendChild(dot);

    const statusText = el('span', 'push-status-text');
    statusText.dataset.pushStatusText = '';
    statusText.textContent = 'Loading…';
    row.appendChild(statusText);

    const actions = el('div', 'push-actions');
    actions.dataset.pushActions = '';
    row.appendChild(actions);
    group.appendChild(row);

    return group;
  }

  return {
    init: init,
    get SUPPORTED() { return SUPPORTED; },
    urlB64ToUint8Array: urlB64ToUint8Array,
    _enable: enablePush,
    _disable: disablePush,
    _test: sendTest,
  };
})();