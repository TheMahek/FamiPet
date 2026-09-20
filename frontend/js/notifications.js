/* =========================================================
   FAMIPET - SHARED NOTIFICATION COMPONENT (Phase 5 core)
   =========================================================
   Reusable notification building blocks for all pages and future
   phases (6 push, 7 reminders, 8 feature integration).

   Design rules:
   - OPT-IN: the component only touches elements a page explicitly
     mounts (id "notificationPreferences", [data-notification-badge],
     [data-notification-list]). It never auto-binds the existing
     per-page dropdowns, so those keep working untouched.
   - Backward compatible: every helper consumes the Phase 5 API
     shape ({ success, count, unreadCount, notifications, total,
     page, limit, totalPages }).
   - Ownership is server-enforced; the client never sends a user id.

   Consumers: window.FamiPetNotifications.{ esc, formatTime,
   getUnreadCount, getNotifications, loadList, refreshBadge,
   markRead, markAllRead, deleteNotification, renderPreferences }
   ========================================================= */

(function () {
    "use strict";

    const API = typeof FamiPetAPI !== "undefined" ? FamiPetAPI : null;

    // Mirrors backend/utils/validation.js NOTIFICATION_TYPES. Kept additive —
    // future types only get appended here, never removed.
    const NOTIFICATION_TYPES = [
        "adoption",
        "appointment",
        "vaccination",
        "health",
        "reminder",
        "system",
        "other",
    ];

    // Channels stored by the backend NotificationPreference model.
    const CHANNELS = ["inApp", "email", "push"];

    const CHANNEL_LABELS = {
        inApp: "In-App Notifications",
        email: "Email Notifications",
        push: "Push Notifications",
    };

    const CHANNEL_DESCRIPTIONS = {
        inApp: "Show notifications inside the app.",
        email: "Send updates to your email address.",
        push: "Deliver to your device (requires Phase 6 browser push).",
    };

    /* ---------------- helpers ---------------- */

    function esc(value) {
        return String(value === null || value === undefined ? "" : value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function formatTime(iso) {
        if (!iso) return "";
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return "";
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const minutes = Math.floor(diffMs / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return minutes + "m ago";
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return hours + "h ago";
        const days = Math.floor(hours / 24);
        if (days < 7) return days + "d ago";
        return date.toLocaleDateString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    }

    /* ---------------- data access ---------------- */

    async function getUnreadCount() {
        if (!API) return 0;
        try {
            const data = await API.get("/notifications/unread");
            return data && Number(data.count) >= 0 ? Number(data.count) : 0;
        } catch (e) {
            return 0;
        }
    }

    async function getNotifications(params) {
        if (!API) return { notifications: [], total: 0, page: 1, limit: 50 };
        const query = [];
        if (params) {
            if (params.page) query.push("page=" + encodeURIComponent(params.page));
            if (params.limit) query.push("limit=" + encodeURIComponent(params.limit));
            if (params.type) query.push("type=" + encodeURIComponent(params.type));
            if (params.category) query.push("category=" + encodeURIComponent(params.category));
        }
        const qs = query.length ? "?" + query.join("&") : "";
        return API.get("/notifications" + qs);
    }

    async function markRead(id) {
        if (!API || !id) return null;
        return API.put("/notifications/" + encodeURIComponent(id) + "/read", {});
    }

    async function markAllRead() {
        if (!API) return null;
        return API.put("/notifications/read-all", {});
    }

    async function deleteNotification(id) {
        if (!API || !id) return null;
        return API.del("/notifications/" + encodeURIComponent(id));
    }

    /* ---------------- badge ---------------- */

    // Sets an element's unread count. Falls back to hidden badge at 0.
    async function refreshBadge(badgeEl) {
        if (!badgeEl) return;
        const count = await getUnreadCount();
        badgeEl.textContent = count > 99 ? "99+" : String(count);
        badgeEl.style.display = count > 0 ? "" : "none";
        return count;
    }

    /* ---------------- list rendering ---------------- */

    // Renders the Phase 5 notification list into `listEl`.
    // Item clicks mark that notification read (optionally via `onRead`).
    async function loadList(listEl, opts) {
        if (!listEl) return;
        const settings = opts || {};
        const data = await getNotifications({ limit: settings.limit || 50 });
        const notes = (data && data.notifications) || [];

        listEl.innerHTML = "";

        if (!notes.length) {
            listEl.innerHTML =
                '<p class="notification-empty" style="padding:18px;text-align:center;color:#8f8f9a;font-size:14px;margin:0;">No notifications yet.</p>';
            return;
        }

        notes.forEach((note) => {
            const item = document.createElement("div");
            item.className = "notification-item" + (note.isRead ? "" : " unread");
            item.setAttribute("data-id", note._id || "");
            item.setAttribute("data-read", note.isRead ? "1" : "0");
            item.innerHTML =
                '<div class="notification-title"><strong>' +
                esc(note.title) +
                "</strong></div>" +
                '<div class="notification-message">' +
                esc(note.message || "") +
                "</div>" +
                '<div class="notification-meta">' +
                '<span class="notification-type">' +
                esc(note.category || note.type || "system") +
                "</span>" +
                '<span class="notification-time">' +
                esc(formatTime(note.createdAt)) +
                "</span></div>";
            item.addEventListener("click", async () => {
                if (item.getAttribute("data-read") === "1") return;
                try {
                    await markRead(note._id);
                    item.setAttribute("data-read", "1");
                    item.classList.remove("unread");
                    if (typeof settings.onRead === "function") settings.onRead(note);
                } catch (e) {
                    /* keep state */
                }
            });
            listEl.appendChild(item);
        });

        if (typeof settings.onLoaded === "function") settings.onLoaded(data);
        if (window.lucide) lucide.createIcons();
        return data;
    }

    /* ---------------- preferences ---------------- */

    function prefsToggleRow(icon, title, descr, name, checked, dataType) {
        const label =
            '<label class="toggle">' +
            '<input type="checkbox" data-preferences="' +
            esc(dataType) +
            '" data-pref-name="' +
            esc(name) +
            (checked ? '" checked' : '"') +
            '><span class="toggle-slider"></span></label>';
        return (
            '<div class="preference-row" data-pref-row="' +
            esc(name) +
            '">' +
            '<div class="preference-icon"><i data-lucide="' +
            esc(icon) +
            '"></i></div>' +
            '<div class="preference-content"><strong>' +
            esc(title) +
            "</strong><span>" +
            esc(descr) +
            "</span></div>" +
            label +
            "</div>"
        );
    }

    // Renders channel + per-type toggles backed by the Phase 5
    // GET/PUT /api/notifications/preferences endpoints.
    // `container` must exist; changes save immediately (no button).
    async function renderPreferences(container, opts) {
        if (!container || !API) return;
        const settings = opts || {};

        let prefs = null;
        try {
            const data = await API.get("/notifications/preferences");
            prefs = (data && data.preferences) || null;
        } catch (e) {
            container.innerHTML =
                '<p class="notification-empty" style="padding:18px;text-align:center;color:#8f8f9a;font-size:14px;margin:0;">Could not load notification preferences.</p>';
            if (typeof settings.onError === "function") settings.onError(e);
            return;
        }

        const channels = (prefs && prefs.channels) || {};
        const types = (prefs && prefs.types) || {};

        const setStatus = settings.statusEl
            ? document.getElementById(settings.statusEl)
            : null;

        const save = async (payload) => {
            try {
                const res = await API.put("/notifications/preferences", payload);
                if (setStatus) {
                    setStatus.style.color = "#38C976";
                    setStatus.textContent = "Saved";
                    setTimeout(() => { setStatus.textContent = ""; }, 1800);
                }
                if (typeof settings.onSaved === "function") settings.onSaved(res);
            } catch (e) {
                if (setStatus) {
                    setStatus.style.color = "#EF4444";
                    setStatus.textContent =
                        (e && e.data && e.data.message) ||
                        "Could not save preferences.";
                }
                if (typeof settings.onError === "function") settings.onError(e);
            }
        };

        let html = '<div class="preferences-list">';

        html += '<h4 class="preferences-heading">Delivery Channels</h4>';
        CHANNELS.forEach((channel) => {
            const enabled = channels[channel] !== false;
            const icon = channel === "email" ? "mail" : channel === "push" ? "bell" : "inbox";
            html += prefsToggleRow(
                icon,
                CHANNEL_LABELS[channel],
                CHANNEL_DESCRIPTIONS[channel],
                "channel",
                enabled,
                "channel",
            );
        });

        html += '<h4 class="preferences-heading">Notification Types</h4>';
        NOTIFICATION_TYPES.forEach((type) => {
            // Absent keys are treated as enabled (forward-compatible).
            const enabled = types[type] !== false;
            html += prefsToggleRow(
                type === "appointment"
                    ? "calendar-check"
                    : type === "adoption"
                        ? "heart"
                        : type === "vaccination"
                            ? "syringe"
                            : type === "health"
                                ? "activity"
                                : type === "reminder"
                                    ? "alarm-clock"
                                    : "bell-ring",
                type.charAt(0).toUpperCase() + type.slice(1),
                "Receive " + type + " notifications.",
                type,
                enabled,
                "type",
            );
        });

        html += "</div>";
        container.innerHTML = html;
        if (window.lucide) lucide.createIcons();

        container.querySelectorAll('input[data-preferences]').forEach((input) => {
            input.addEventListener("change", () => {
                const kind = input.getAttribute("data-preferences");
                const name = input.getAttribute("data-pref-name");
                const payload = kind === "channel"
                    ? { channels: {} }
                    : { types: {} };
                payload[kind === "channel" ? "channels" : "types"][name] = input.checked;
                save(payload);
            });
        });
    }

    /* ---------------- auto-bootstrap (opt-in mounts) ---------------- */

    function boot() {
        if (!API || !API.isLoggedIn()) return;

        const prefsMount = document.getElementById("notificationPreferences");
        if (prefsMount) {
            renderPreferences(prefsMount);
        }

        const badgeMount = document.querySelector("[data-notification-badge]");
        if (badgeMount) refreshBadge(badgeMount);

        const listMount = document.getElementById("notificationListShared");
        if (listMount) loadList(listMount);
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", boot);
    } else {
        boot();
    }

    window.FamiPetNotifications = {
        esc: esc,
        formatTime: formatTime,
        getUnreadCount: getUnreadCount,
        getNotifications: getNotifications,
        loadList: loadList,
        refreshBadge: refreshBadge,
        markRead: markRead,
        markAllRead: markAllRead,
        deleteNotification: deleteNotification,
        renderPreferences: renderPreferences,
        NOTIFICATION_TYPES: NOTIFICATION_TYPES,
    };
})();