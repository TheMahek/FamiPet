/* =========================================================
   FAMIPET - DASHBOARD DATA INTEGRATION
   Populates dashboard cards from the backend API.
   ========================================================= */

(function () {

    function esc(str) {
        return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    function fmtDate(d) {
        if (!d) return "";
        const date = new Date(d);
        if (isNaN(date)) return d;
        return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
    }

    function fmtTime(t) {
        if (!t) return "";
        if (/^\d{1,2}:\d{2}/.test(t)) {
            let [h, m] = t.split(":").map(Number);
            const ampm = h >= 12 ? "PM" : "AM";
            h = h % 12 || 12;
            return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
        }
        return t;
    }

    function petImage(pet) {
        if (pet && pet.images && pet.images.length && pet.images[0]) return pet.images[0];
        const cls = pet && pet.species === "cat" ? "cat.png" : "dog1.png";
        return `../assets/images/my-pet/${cls}`;
    }

    function breedName(pet) {
        if (!pet) return "";
        return (pet.breed && pet.breed.name) || pet.breed || "Pet";
    }

    function ageText(pet) {
        if (!pet || typeof pet.age !== "number") return "";
        return `${pet.age} ${pet.age === 1 ? "yr" : "yrs"}`;
    }

    /* =====================================================
       GREETING
    ===================================================== */
    function fillGreeting() {
        const heading = document.querySelector(".welcome-text h1");
        const user = FamiPetAPI.getUser();
        if (heading && user && user.name) {
            const first = String(user.name).trim().split(/\s+/)[0] || "";
            if (first) heading.textContent = `Good morning, ${first}! 🌸`;
        }
    }

    /* =====================================================
       PETS SECTION
    ===================================================== */
    async function loadPets() {
        try {
            const data = await FamiPetAPI.get("/pets/my");
            const pets = data.pets || [];

            const statNum = document.querySelector(".pets-card .stat-number");
            if (statNum) statNum.textContent = pets.length;

            const list = document.querySelector(".pets-list");
            if (!list) return;

            if (!pets.length) {
                list.innerHTML = `
                    <div style="padding:18px;text-align:center;color:#8f8f9a;width:100%;">
                        No pets yet.
                        <a href="mypet.html" style="color:#FF5C8A;font-weight:600;">Add your first pet →</a>
                    </div>
                `;
                return;
            }

            list.innerHTML = pets.slice(0, 3).map(pet => `
                <article class="pet-card">
                    <div class="pet-image-wrapper">
                        <img src="${esc(petImage(pet))}" alt="${esc(pet.name)}">
                    </div>
                    <div class="pet-info">
                        <h3>${esc(pet.name)}</h3>
                        <p>${esc(breedName(pet))}</p>
                        <span>${esc(ageText(pet))}</span>
                    </div>
                </article>
            `).join("");

            if (window.lucide) lucide.createIcons();
        } catch (err) {
            console.warn("Dashboard pets:", err && err.message);
        }
    }

    /* =====================================================
       STATS: ADOPTIONS / REMINDERS
    ===================================================== */
    async function loadStats() {
        try {
            const ad = await FamiPetAPI.get("/adoptions/my");
            const adNum = document.querySelector(".adoption-card .stat-number");
            if (adNum) adNum.textContent = (ad.adoptions || ad.requests || []).length;
        } catch (e) { /* keep default */ }

        try {
            const rm = await FamiPetAPI.get("/reminders");
            const rmNum = document.querySelector(".reminder-card .stat-number");
            if (rmNum) rmNum.textContent = (rm.reminders || rm.count || 0);
        } catch (e) { /* keep default */ }
    }

    /* =====================================================
       UPCOMING APPOINTMENT
    ===================================================== */
    async function loadAppointment() {
        try {
            const data = await FamiPetAPI.get("/appointments");
            const apps = data.appointments || [];

            const up = apps.filter(a => a.status === "pending" || a.status === "confirmed");
            const statNum = document.querySelector(".appointment-card .stat-number");
            if (statNum) statNum.textContent = up.length;

            const box = document.querySelector(".appointment-box");
            if (!box) return;

            if (!up.length) {
                box.innerHTML = `
                    <div class="appointment-details" style="width:100%;">
                        <span class="appointment-label" style="color:#8f8f9a;">NO UPCOMING APPOINTMENT</span>
                        <h3>You're all caught up!</h3>
                        <div class="appointment-meta"><span>Book a visit for your pet anytime.</span></div>
                    </div>
                `;
            } else {
                const a = up[0];
                const petName = (a.pet && a.pet.name) || "Your Pet";
                const ptype = String(a.type || "checkup").toUpperCase();
                const petImg = (a.pet && a.pet.images && a.pet.images[0]) || "../assets/images/my-pet/dog1.png";
                box.innerHTML = `
                    <div class="appointment-icon"><i data-lucide="stethoscope"></i></div>
                    <div class="appointment-details">
                        <span class="appointment-label">${esc(ptype)}</span>
                        <h3>${esc(petName)}</h3>
                        <div class="appointment-meta">
                            <span><i data-lucide="calendar"></i> ${esc(fmtDate(a.date))}</span>
                            <span><i data-lucide="clock"></i> ${esc(fmtTime(a.time))}</span>
                        </div>
                    </div>
                    <div class="appointment-pet"><img src="${esc(petImg)}" alt="${esc(petName)}"></div>
                `;
            }

            if (window.lucide) lucide.createIcons();
        } catch (err) {
            console.warn("Dashboard appointments:", err && err.message);
        }
    }

    /* =====================================================
       REMINDERS LIST
    ===================================================== */
    async function loadReminders() {
        try {
            const data = await FamiPetAPI.get("/reminders");
            const reminders = data.reminders || [];

            const list = document.querySelector(".reminder-list");
            if (!list) return;

            if (!reminders.length) {
                list.innerHTML = `
                    <div style="padding:18px;text-align:center;color:#8f8f9a;width:100%;">
                        No reminders scheduled.
                        <a href="reminders.html" style="color:#FF5C8A;font-weight:600;">Add one →</a>
                    </div>
                `;
                return;
            }

            const icons = ["pill", "calendar-days", "utensils"];
            const colors = ["lavender", "pink", "green"];

            list.innerHTML = reminders.slice(0, 3).map((r, i) => {
                const icon = icons[i % icons.length];
                const col = colors[i % colors.length];
                const when = `${fmtDate(r.date)}${r.time ? ", " + fmtTime(r.time) : ""}`;
                const label = r.isCompleted
                    ? '<span class="reminder-upcoming">Done</span>'
                    : `<span class="${fmtDate(r.date) === fmtDate(new Date()) ? "reminder-today" : "reminder-upcoming"}">${fmtDate(r.date) === fmtDate(new Date()) ? "Today" : "Upcoming"}</span>`;
                return `
                    <div class="reminder-item">
                        <div class="reminder-icon ${col}"><i data-lucide="${icon}"></i></div>
                        <div><h4>${esc(r.title)}</h4><p>${esc(when)}</p></div>
                        ${label}
                    </div>
                `;
            }).join("");

            if (window.lucide) lucide.createIcons();
        } catch (err) {
            console.warn("Dashboard reminders:", err && err.message);
        }
    }

    /* =====================================================
       NOTIFICATIONS + ACTIVITY
    ===================================================== */
    async function loadNotifications() {
        try {
            const data = await FamiPetAPI.get("/notifications");
            const notes = data.notifications || [];

            const count = document.querySelector(".notification-count");
            if (count) count.textContent = notes.filter(n => !n.isRead).length || "0";

            const panel = document.getElementById("notificationPanel");
            if (!panel) return;

            if (!notes.length) {
                const existing = panel.querySelector(".notification-item");
                if (existing) existing.remove();
                const empty = document.createElement("p");
                empty.style.cssText = "padding:16px;color:#8f8f9a;text-align:center;font-size:14px;";
                empty.textContent = "No notifications yet.";
                panel.appendChild(empty);
                return;
            }

            const colors = ["pink", "green", "lavender"];
            const icons = ["syringe", "check", "heart"];

            panel.querySelectorAll(".notification-item").forEach(el => el.remove());
            panel.insertAdjacentHTML("beforeend", notes.slice(0, 5).map((n, i) => `
                <div class="notification-item">
                    <div class="notification-icon ${colors[i % 3]}">
                        <i data-lucide="${icons[i % 3]}"></i>
                    </div>
                    <div>
                        <strong>${esc(n.title)}</strong>
                        <span>${esc(n.message || fmtDate(n.createdAt))}</span>
                    </div>
                </div>
            `).join(""));

            if (window.lucide) lucide.createIcons();
        } catch (err) {
            console.warn("Dashboard notifications:", err && err.message);
        }
    }

    /* =====================================================
       RECENT ACTIVITY
    ===================================================== */
    async function loadActivity() {
        const list = document.querySelector(".activity-list");
        if (!list) return;

        const items = [];

        try {
            const not = await FamiPetAPI.get("/notifications");
            (not.notifications || []).slice(0, 3).forEach(n => {
                items.push({
                    title: n.title,
                    date: fmtDate(n.createdAt),
                    icon: "bell",
                    color: "lavender",
                    status: n.isRead ? "Completed" : "New",
                    cls: n.isRead ? "completed" : "new",
                });
            });
        } catch (e) { /* ignore */ }

        try {
            const ad = await FamiPetAPI.get("/adoptions/my");
            (ad.adoptions || ad.requests || []).slice(0, 3).forEach(r => {
                items.push({
                    title: `Adoption request: ${(r.pet && r.pet.name) || "pet"} (${r.status})`,
                    date: fmtDate(r.createdAt),
                    icon: "heart",
                    color: "pink",
                    status: r.status,
                    cls: String(r.status || "").toLowerCase() === "approved" ? "completed" : "upcoming",
                });
            });
        } catch (e) { /* ignore */ }

        if (!items.length) {
            list.innerHTML = `<div style="padding:18px;text-align:center;color:#8f8f9a;width:100%;">No recent activity yet.</div>`;
            return;
        }

        list.innerHTML = items.slice(0, 3).map(it => `
            <div class="activity-item">
                <div class="activity-icon ${it.color}"><i data-lucide="${it.icon}"></i></div>
                <div><h4>${esc(it.title)}</h4><p>${esc(it.date)}</p></div>
                <span class="status ${it.cls}">${esc(it.status)}</span>
            </div>
        `).join("");

        if (window.lucide) lucide.createIcons();
    }

    /* =====================================================
       INIT
    ===================================================== */
    function init() {
        if (typeof FamiPetAPI === "undefined" || !FamiPetAPI.isLoggedIn()) return;

        fillGreeting();
        loadPets();
        loadStats();
        loadAppointment();
        loadReminders();
        loadNotifications();
        loadActivity();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

})();