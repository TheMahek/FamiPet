/* =========================================================
   Famipet - REMINDERS PAGE (Phase 8 Pet Care Reminders)
   Pet-attached reminders, repeat rules, priorities,
   notification toggles, pending/completed/inactive sections.
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       STATE
    ===================================================== */

    let reminders = [];
    let pets = [];
    let activeFilter = "pending";
    let showingAllReminders = false;

    const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    /* =====================================================
       TYPE META (backend type -> UI label / icon / css)
    ===================================================== */

    const TYPE_META = {
        feeding:      { label: "Food",        icon: "utensils",     cls: "feeding",     color: "green" },
        exercise:     { label: "Walk",        icon: "footprints",   cls: "exercise",    color: "blue" },
        droplet:      { label: "Water",       icon: "droplets",     cls: "droplet",     color: "blue" },
        medicine:     { label: "Medicine",    icon: "pill",         cls: "medicine",    color: "pink" },
        grooming:     { label: "Grooming",    icon: "scissors",     cls: "grooming",    color: "blue" },
        bath:         { label: "Bath",        icon: "bath",         cls: "bath",        color: "purple" },
        appointment:  { label: "Vet Checkup", icon: "stethoscope",  cls: "appointment", color: "purple" },
        vaccination:  { label: "Vaccination", icon: "syringe",      cls: "vaccination", color: "green" },
        custom:       { label: "Custom",      icon: "bell",         cls: "custom",      color: "orange" }
    };

    const TYPE_ORDER = [
        "feeding", "exercise", "droplet", "medicine", "grooming",
        "bath", "appointment", "vaccination", "custom"
    ];

    /* Static fallbacks for the demo pets used in the original markup */

    const petImages = {
        Bruno: "../assets/images/dashboard/golden-retriever.png",
        Luna: "../assets/images/my-pet/cat.png",
        Coco: "../assets/images/my-pet/dog.png",
        Milo: "../assets/images/my-pet/cat.png"
    };

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const reminderList = document.getElementById("reminderList");
    const searchInput = document.getElementById("reminderSearch");
    const addReminderBtn = document.getElementById("addReminderBtn");
    const upcomingCount = document.getElementById("upcomingCount");
    const completedCount = document.getElementById("completedCount");
    const overdueCount = document.getElementById("overdueCount");
    const totalCount = document.getElementById("totalCount");
    const calendarGrid = document.getElementById("calendarGrid");
    const calendarTitle = document.getElementById("calendarTitle");
    const previousMonth = document.getElementById("previousMonth");
    const nextMonth = document.getElementById("nextMonth");
    const viewAllBtn = document.getElementById("viewAllBtn");
    const viewAllReminders = document.getElementById("viewAllReminders");

    /* =====================================================
       HELPERS
    ===================================================== */

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function escapeHTML(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function refreshIcons() {
        if (window.lucide) {
            lucide.createIcons();
        }
    }

    function todayKey() {
        return new Date().toISOString().slice(0, 10);
    }

    function utcEpoch(key) {
        const parts = String(key).split("-").map(Number);
        return Date.UTC(parts[0], parts[1] - 1, parts[2]);
    }

    function formatDate(dateKey) {
        const date = new Date(dateKey + "T00:00:00");
        return date.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
            year: "numeric"
        });
    }

    function getDaysText(dateKey) {
        const diff = Math.round((utcEpoch(dateKey) - utcEpoch(todayKey())) / 86400000);
        if (diff === 0) return "Today";
        if (diff === 1) return "Tomorrow";
        if (diff > 1) return `In ${diff} days`;
        return "Overdue";
    }

    /* Normalize backend time to HH:mm (24h) and to a display 12h label */

    function toHHmm(value) {
        const match = /^(\d{1,2}):(\d{2})\s*([AP]M)?$/i.exec(String(value || "").trim());
        if (!match) return "";
        let hour = Number(match[1]);
        const minutes = match[2];
        const modifier = match[3];
        if (modifier) {
            const ampm = modifier.toUpperCase();
            if (ampm === "PM" && hour !== 12) hour += 12;
            if (ampm === "AM" && hour === 12) hour = 0;
        }
        if (hour >= 24) return "";
        return `${pad(hour)}:${minutes}`;
    }

    function toTimeLabel(value) {
        const hhmm = toHHmm(value);
        if (!hhmm) return String(value || "");
        const parts = hhmm.split(":");
        const hour = Number(parts[0]);
        const ampm = hour >= 12 ? "PM" : "AM";
        const displayHour = hour % 12 || 12;
        return `${pad(displayHour)}:${parts[1]} ${ampm}`;
    }

    function repeatLabel(reminder) {
        switch (reminder.frequency) {
            case "once":
                return "Once";
            case "daily":
                return "Daily";
            case "interval":
                return `Every ${reminder.repeatInterval} day${reminder.repeatInterval === 1 ? "" : "s"}`;
            case "weekly": {
                const days = reminder.daysOfWeek.slice().sort((a, b) => a - b);
                return days.length
                    ? `Weekly · ${days.map(d => WEEKDAY_SHORT[d]).join(", ")}`
                    : "Weekly";
            }
            case "monthly":
                return "Monthly";
            default:
                return "Once";
        }
    }

    function petImageFor(reminder) {
        if (reminder.petImage) return reminder.petImage;
        return petImages[reminder.petName] || "../assets/images/my-pet/cat.png";
    }

    function effectiveDateKey(raw) {
        if (raw.effectiveNext) {
            return new Date(raw.effectiveNext).toISOString().slice(0, 10);
        }
        return String(raw.date || "").slice(0, 10);
    }

    /* =====================================================
       NORMALIZE BACKEND REMINDER -> UI SHAPE
    ===================================================== */

    function normalizeReminder(raw) {
        const pet = raw.pet && (raw.pet.name || raw.pet._id) ? raw.pet : null;
        const meta = TYPE_META[raw.type] || TYPE_META.custom;
        return {
            id: String(raw._id),
            petId: pet ? String(pet._id) : "",
            petName: pet ? pet.name : "No pet",
            petImage: pet && pet.images && pet.images[0] ? pet.images[0] : null,
            type: raw.type,
            typeLabel: meta.label,
            typeClass: meta.cls,
            icon: meta.icon,
            color: meta.color,
            title: raw.title || "",
            description: raw.description || "",
            dateKey: effectiveDateKey(raw),
            time: toHHmm(String(raw.time || "")),
            timeLabel: toTimeLabel(String(raw.time || "")),
            frequency: raw.frequency || "once",
            repeatInterval: Number(raw.repeatInterval) || 1,
            daysOfWeek: Array.isArray(raw.daysOfWeek) ? raw.daysOfWeek.map(Number) : [],
            priority: raw.priority || "normal",
            notificationEnabled: raw.notificationEnabled !== false,
            isCompleted: Boolean(raw.isCompleted),
            isActive: raw.isActive !== false,
            effectiveNext: raw.effectiveNext || null
        };
    }

    /* =====================================================
       LOAD PETS
    ===================================================== */

    async function loadPets() {
        try {
            const data = await FamiPetAPI.get("/pets/my");
            pets = data.pets || [];
        } catch (error) {
            pets = [];
        }
    }

    /* =====================================================
       LOAD REMINDERS (all statuses, sectioned client-side)
    ===================================================== */

    async function loadReminders() {
        try {
            const data = await FamiPetAPI.get("/reminders?filter=all");
            reminders = (data.reminders || []).map(normalizeReminder);
        } catch (error) {
            reminders = [];
        }
        renderCurrentView();
        renderCalendar();
        updateStats();
    }

    /* =====================================================
       STATS
    ===================================================== */

    function updateStats() {
        const active = reminders.filter(r => r.isActive && !r.isCompleted);
        const completed = reminders.filter(r => r.isCompleted);
        const overdue = active.filter(r => r.dateKey < todayKey());

        if (upcomingCount) upcomingCount.textContent = active.length;
        if (completedCount) completedCount.textContent = completed.length;
        if (overdueCount) overdueCount.textContent = overdue.length;
        if (totalCount) totalCount.textContent = reminders.length;
    }

    /* =====================================================
       RENDER CURRENT VIEW (search + active tab + sections)
    ===================================================== */

    function getVisibleReminders() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        if (!query) return reminders;
        return reminders.filter(r =>
            r.petName.toLowerCase().includes(query) ||
            r.typeLabel.toLowerCase().includes(query) ||
            r.title.toLowerCase().includes(query)
        );
    }

    function currentTabCount() {
        const list = getVisibleReminders();
        if (activeFilter === "completed") return list.filter(r => r.isCompleted).length;
        if (activeFilter === "inactive") return list.filter(r => !r.isActive).length;
        return list.filter(r => r.isActive && !r.isCompleted).length;
    }

    function renderCurrentView() {
        if (!reminderList) return;

        const list = getVisibleReminders();
        const today = todayKey();
        const cap = showingAllReminders ? Infinity : 4;
        const sections = [];

        if (activeFilter === "completed") {
            sections.push({ title: "Completed", icon: "circle-check", items: list.filter(r => r.isCompleted) });
        } else if (activeFilter === "inactive") {
            sections.push({ title: "Inactive", icon: "pause", items: list.filter(r => !r.isActive) });
        } else {
            const active = list.filter(r => r.isActive && !r.isCompleted);
            sections.push({ title: "Due Today", icon: "calendar-check", items: active.filter(r => r.dateKey <= today) });
            sections.push({ title: "Upcoming", icon: "calendar-days", items: active.filter(r => r.dateKey > today) });
        }

        const visibleSections = sections.filter(s => s.items.length > 0);

        if (visibleSections.length === 0) {
            reminderList.innerHTML = `
                <div class="empty-reminders">
                    <div class="empty-reminder-icon">
                        <i data-lucide="bell-off"></i>
                    </div>
                    <h3>No reminders found</h3>
                    <p>Try another search or add a new reminder.</p>
                </div>
            `;
        } else {
            reminderList.innerHTML = visibleSections
                .map(section => sectionHTML(section, cap))
                .join("");
        }

        refreshIcons();
        bindMoreButtons();
        updateViewAllButtons();
    }

    function sectionHTML(section, cap) {
        const items = section.items.slice(0, cap);
        return `
            <div class="reminder-section">
                <div class="reminder-section-header">
                    <h3>${escapeHTML(section.title)}</h3>
                    <span>${section.items.length} reminder${section.items.length === 1 ? "" : "s"}</span>
                </div>
                ${items.map(itemHTML).join("")}
            </div>
        `;
    }

    function itemHTML(reminder) {
        const stateClass = reminder.isCompleted ? "is-completed" : (!reminder.isActive ? "is-inactive" : "");
        const image = petImageFor(reminder);
        const repeat = reminder.frequency !== "once"
            ? `<span class="repeat-text"><i data-lucide="repeat"></i> ${escapeHTML(repeatLabel(reminder))}</span>`
            : "";

        return `
            <div class="reminder-item ${stateClass}" data-id="${reminder.id}">
                <div class="reminder-type ${reminder.typeClass}">
                    <i data-lucide="${reminder.icon}"></i>
                </div>
                <div class="reminder-pet-image">
                    <img src="${image}" alt="${escapeHTML(reminder.petName)}" onerror="this.style.display='none'">
                </div>
                <div class="reminder-info">
                    <h3>${escapeHTML(reminder.petName)}</h3>
                    <div class="reminder-type-line">
                        <strong class="${reminder.typeClass}-text">${escapeHTML(reminder.typeLabel)}</strong>
                        <span class="priority-pill ${reminder.priority}">${reminder.priority}</span>
                    </div>
                    <div class="reminder-meta">
                        <span><i data-lucide="calendar-days"></i> ${formatDate(reminder.dateKey)}</span>
                        <span><i data-lucide="clock"></i> ${escapeHTML(reminder.timeLabel)}</span>
                        ${repeat}
                    </div>
                </div>
                <div class="reminder-actions">
                    ${statusBadgeHTML(reminder)}
                    <button class="more-btn" type="button" data-id="${reminder.id}" aria-label="Reminder options">
                        <i data-lucide="ellipsis"></i>
                    </button>
                </div>
            </div>
        `;
    }

    function statusBadgeHTML(reminder) {
        if (reminder.isCompleted) {
            return `<span class="days-badge green-badge">Completed</span>`;
        }
        if (!reminder.isActive) {
            return `<span class="days-badge blue-badge">Paused</span>`;
        }
        const overdue = reminder.dateKey < todayKey();
        const badgeClass = overdue ? "orange-badge" : `${reminder.color}-badge`;
        return `<span class="days-badge ${badgeClass}">${getDaysText(reminder.dateKey)}</span>`;
    }

    /* =====================================================
       THREE DOT MENU
    ===================================================== */

    function bindMoreButtons() {
        document.querySelectorAll(".more-btn").forEach(button => {
            button.addEventListener("click", event => {
                event.stopPropagation();
                closeReminderMenus();
                showReminderMenu(button, String(button.dataset.id));
            });
        });
    }

    function showReminderMenu(button, id) {
        const reminder = reminders.find(item => item.id === id);
        if (!reminder) return;

        const menu = document.createElement("div");
        menu.className = "reminder-menu";

        let actionsHTML = "";
        if (reminder.isCompleted) {
            actionsHTML = `
                <button type="button" data-action="restore">
                    <i data-lucide="rotate-ccw"></i> Restore
                </button>
            `;
        } else if (!reminder.isActive) {
            actionsHTML = `
                <button type="button" data-action="activate">
                    <i data-lucide="play"></i> Activate
                </button>
            `;
        } else {
            actionsHTML = `
                <button type="button" data-action="complete">
                    <i data-lucide="circle-check"></i> Mark Completed
                </button>
            `;
        }

        menu.innerHTML = actionsHTML + `
            <button type="button" data-action="edit">
                <i data-lucide="pencil"></i> Edit Reminder
            </button>
            ${!reminder.isActive ? "" : `
            <button type="button" data-action="deactivate">
                <i data-lucide="pause"></i> Deactivate
            </button>
            `}
            <button type="button" data-action="delete" class="delete-action">
                <i data-lucide="trash-2"></i> Delete Reminder
            </button>
        `;

        document.body.appendChild(menu);

        const rect = button.getBoundingClientRect();
        menu.style.position = "fixed";
        menu.style.top = `${rect.bottom + 7}px`;
        menu.style.left = `${Math.max(10, rect.right - 180)}px`;

        refreshIcons();

        menu.querySelectorAll("button").forEach(actionButton => {
            actionButton.addEventListener("click", () => {
                const action = actionButton.dataset.action;
                if (action === "complete") completeReminder(id);
                else if (action === "edit") openReminderModal(reminder);
                else if (action === "delete") deleteReminder(id);
                else if (action === "activate" || action === "restore") activateReminder(id);
                else if (action === "deactivate") deactivateReminder(id);
                menu.remove();
            });
        });
    }

    function closeReminderMenus() {
        document.querySelectorAll(".reminder-menu").forEach(menu => menu.remove());
    }

    /* =====================================================
       REMINDER ACTIONS
    ===================================================== */

    function completeReminder(id) {
        FamiPetAPI.put(`/reminders/${id}/complete`)
            .then(() => loadReminders())
            .catch(error => alert(error.message || "Failed to complete reminder."));
    }

    function activateReminder(id) {
        FamiPetAPI.put(`/reminders/${id}/activate`)
            .then(() => loadReminders())
            .catch(error => alert(error.message || "Failed to activate reminder."));
    }

    function deactivateReminder(id) {
        FamiPetAPI.put(`/reminders/${id}/deactivate`)
            .then(() => loadReminders())
            .catch(error => alert(error.message || "Failed to deactivate reminder."));
    }

    function deleteReminder(id) {
        const reminder = reminders.find(item => item.id === id);
        if (!reminder) return;

        const confirmed = confirm(`Delete ${reminder.typeLabel} reminder for ${reminder.petName}?`);
        if (!confirmed) return;

        FamiPetAPI.del(`/reminders/${id}`)
            .then(() => loadReminders())
            .catch(error => alert(error.message || "Failed to delete reminder."));
    }

    /* =====================================================
       ADD / EDIT MODAL
    ===================================================== */

    function openReminderModal(editModel) {
        closeReminderMenus();
        if (pets.length === 0) {
            alert("Please add a pet to your family first.");
            return;
        }

        const editing = Boolean(editModel);

        const petOptions = pets.map(pet => {
            const selected = editing && editModel.petId === String(pet._id) ? "selected" : "";
            return `<option value="${escapeHTML(pet._id)}" ${selected}>${escapeHTML(pet.name)}</option>`;
        }).join("");

        const typeOptions = TYPE_ORDER.map(type => {
            const meta = TYPE_META[type];
            const selected = editing && editModel.type === type ? "selected" : "";
            return `<option value="${type}" ${selected}>${meta.label}</option>`;
        }).join("");

        const selectedDays = editing && editModel.frequency === "weekly" ? editModel.daysOfWeek.slice() : [];
        const dayChips = WEEKDAY_SHORT.map((dayName, index) => {
            const active = selectedDays.includes(index) ? "active" : "";
            return `<button type="button" class="day-chip ${active}" data-day="${index}" aria-label="${dayName}">${dayName}</button>`;
        }).join("");

        const overlay = document.createElement("div");
        overlay.className = "reminder-modal-overlay";

        overlay.innerHTML = `
            <div class="reminder-modal" role="dialog" aria-modal="true">
                <div class="reminder-modal-header">
                    <div>
                        <span class="modal-eyebrow">${editing ? "UPDATE REMINDER" : "NEW REMINDER"}</span>
                        <h2>${editing ? "Edit Reminder" : "Add Reminder"}</h2>
                    </div>
                    <button class="modal-close" type="button" aria-label="Close">
                        <i data-lucide="x"></i>
                    </button>
                </div>

                <form id="reminderForm" class="reminder-form">
                    <div class="form-group">
                        <label for="reminderPet">Pet</label>
                        <select id="reminderPet" required>
                            ${petOptions}
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="reminderType">Reminder Type</label>
                        <select id="reminderType" required>
                            <option value="">Select reminder</option>
                            ${typeOptions}
                        </select>
                    </div>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="reminderDate">Date</label>
                            <input type="date" id="reminderDate" required>
                        </div>
                        <div class="form-group">
                            <label for="reminderTime">Time</label>
                            <input type="time" id="reminderTime" required>
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="reminderFrequency">Repeat</label>
                        <select id="reminderFrequency">
                            <option value="once">Once</option>
                            <option value="daily">Every day</option>
                            <option value="interval">Every few days</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>

                        <div class="repeat-options">
                            <div class="repeat-inline repeat-row" id="intervalWrap">
                                Every
                                <input type="number" id="reminderInterval" min="1" max="365" value="1">
                                day(s)
                            </div>

                            <div class="weekday-chips" id="weeklyWrap">
                                ${dayChips}
                            </div>
                        </div>
                        <span class="form-help" id="repeatHint"></span>
                    </div>

                    <div class="form-group">
                        <label for="reminderPriority">Priority</label>
                        <select id="reminderPriority">
                            <option value="low">Low</option>
                            <option value="normal">Normal</option>
                            <option value="high">High</option>
                        </select>
                    </div>

                    <div class="form-group toggle-row">
                        <div>
                            <label>Notifications</label>
                            <span class="form-help">Receive a notification when this reminder is due.</span>
                        </div>
                        <label class="switch">
                            <input type="checkbox" id="reminderNotify" checked>
                            <span class="switch-slider"></span>
                        </label>
                    </div>

                    <div class="form-group">
                        <label for="reminderNotes">Notes</label>
                        <textarea id="reminderNotes" maxlength="1000" placeholder="Optional notes..."></textarea>
                    </div>

                    <div class="modal-actions">
                        <button type="button" class="modal-cancel">Cancel</button>
                        <button type="submit" class="modal-save">
                            <i data-lucide="check"></i>
                            ${editing ? "Save Changes" : "Add Reminder"}
                        </button>
                    </div>
                </form>
            </div>
        `;

        document.body.appendChild(overlay);
        refreshIcons();

        /* ---- populate values ---- */

        const petSelect = overlay.querySelector("#reminderPet");
        const typeSelect = overlay.querySelector("#reminderType");
        const dateInput = overlay.querySelector("#reminderDate");
        const timeInput = overlay.querySelector("#reminderTime");
        const freqSelect = overlay.querySelector("#reminderFrequency");
        const intervalInput = overlay.querySelector("#reminderInterval");
        const weeklyWrap = overlay.querySelector("#weeklyWrap");
        const prioritySelect = overlay.querySelector("#reminderPriority");
        const notifyCheckbox = overlay.querySelector("#reminderNotify");
        const notesInput = overlay.querySelector("#reminderNotes");
        const form = overlay.querySelector("#reminderForm");

        petSelect.value = editing ? editModel.petId : (pets[0] ? String(pets[0]._id) : "");
        typeSelect.value = editing ? editModel.type : "";
        dateInput.value = editing ? editModel.dateKey : "";
        timeInput.value = editing ? editModel.time : "";
        freqSelect.value = editing ? editModel.frequency : "once";
        intervalInput.value = editing && editModel.frequency === "interval" ? editModel.repeatInterval : 1;
        prioritySelect.value = editing ? editModel.priority : "normal";
        notifyCheckbox.checked = editing ? editModel.notificationEnabled : true;
        notesInput.value = editing ? editModel.description : "";

        /* ---- repeat UI ---- */

        function toggleRepeatUI() {
            const frequency = freqSelect.value;
            overlay.querySelector("#intervalWrap").hidden = frequency !== "interval";
            weeklyWrap.hidden = frequency !== "weekly";
            overlay.querySelector("#repeatHint").textContent = frequency === "interval"
                ? "Repeats every N days."
                : frequency === "weekly"
                ? "Repeats on the selected weekdays."
                : "";
        }

        toggleRepeatUI();
        freqSelect.addEventListener("change", toggleRepeatUI);

        weeklyWrap.querySelectorAll(".day-chip").forEach(chip => {
            chip.addEventListener("click", () => {
                const day = Number(chip.dataset.day);
                const index = selectedDays.indexOf(day);
                if (index === -1) {
                    selectedDays.push(day);
                    chip.classList.add("active");
                } else {
                    selectedDays.splice(index, 1);
                    chip.classList.remove("active");
                }
            });
        });

        /* ---- close behaviours ---- */

        function closeModal() {
            overlay.remove();
        }

        overlay.querySelector(".modal-close").addEventListener("click", closeModal);
        overlay.querySelector(".modal-cancel").addEventListener("click", closeModal);
        overlay.addEventListener("click", event => {
            if (event.target === overlay) closeModal();
        });

        /* ---- submit ---- */

        form.addEventListener("submit", event => {
            event.preventDefault();

            const petId = petSelect.value;
            const type = typeSelect.value;
            const date = dateInput.value;
            const time = timeInput.value;

            if (!petId) {
                alert("Please select a pet.");
                return;
            }
            if (!type) {
                alert("Please select a reminder type.");
                return;
            }
            if (!date || !time) {
                alert("Please pick a date and time.");
                return;
            }

            const frequency = freqSelect.value;
            let repeatInterval = 1;
            let daysOfWeek = [];

            if (frequency === "interval") {
                repeatInterval = parseInt(intervalInput.value, 10);
                if (!Number.isInteger(repeatInterval) || repeatInterval < 1 || repeatInterval > 365) {
                    alert("Repeat interval must be between 1 and 365 days.");
                    return;
                }
            }

            if (frequency === "weekly") {
                if (selectedDays.length === 0) {
                    alert("Pick at least one weekday.");
                    return;
                }
                daysOfWeek = selectedDays.slice().sort((a, b) => a - b);
            }

            const pet = pets.find(item => String(item._id) === petId);
            const petName = pet ? pet.name : "";
            const meta = TYPE_META[type] || TYPE_META.custom;

            const payload = {
                title: `${meta.label} reminder${petName ? ` for ${petName}` : ""}`,
                pet: petId,
                type: type,
                date: date,
                time: time,
                frequency: frequency,
                priority: prioritySelect.value,
                notificationEnabled: notifyCheckbox.checked,
                description: notesInput.value.trim().slice(0, 1000)
            };

            if (frequency === "interval") payload.repeatInterval = repeatInterval;
            if (frequency === "weekly") payload.daysOfWeek = daysOfWeek;

            const save = editing
                ? FamiPetAPI.put(`/reminders/${editModel.id}`, payload)
                : FamiPetAPI.post("/reminders", payload);

            save
                .then(() => {
                    closeModal();
                    return loadReminders();
                })
                .catch(error => {
                    alert(error.message || "Failed to save reminder.");
                });
        });
    }

    /* =====================================================
       ADD REMINDER BUTTON
    ===================================================== */

    if (addReminderBtn) {
        addReminderBtn.addEventListener("click", () => openReminderModal());
    }

    /* =====================================================
       SEARCH
    ===================================================== */

    if (searchInput) {
        searchInput.addEventListener("input", () => {
            renderCurrentView();
            renderCalendar();
        });
    }

    /* =====================================================
       FILTER TABS
    ===================================================== */

    const filterTabs = document.getElementById("reminderFilterTabs");
    if (filterTabs) {
        filterTabs.addEventListener("click", event => {
            const tab = event.target.closest(".filter-tab");
            if (!tab) return;
            filterTabs.querySelectorAll(".filter-tab").forEach(btn => btn.classList.toggle("active", btn === tab));
            activeFilter = tab.dataset.filter;
            showingAllReminders = false;
            renderCurrentView();
        });
    }

    /* =====================================================
       VIEW ALL / SHOW LESS
    ===================================================== */

    function toggleViewAll() {
        showingAllReminders = !showingAllReminders;
        renderCurrentView();
        const section = document.querySelector(".upcoming-reminders");
        if (section) {
            section.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function updateViewAllButtons() {
        const count = currentTabCount();

        if (viewAllBtn) {
            viewAllBtn.textContent = showingAllReminders ? "Show Less" : "View All";
        }

        if (viewAllReminders) {
            if (count <= 4) {
                viewAllReminders.style.display = "none";
                return;
            }
            viewAllReminders.style.display = "";
            viewAllReminders.innerHTML = showingAllReminders
                ? `Show Less <i class="fa-solid fa-arrow-up"></i>`
                : `View All Reminders <i class="fa-solid fa-arrow-right"></i>`;
        }
    }

    if (viewAllBtn) {
        viewAllBtn.addEventListener("click", event => {
            event.preventDefault();
            toggleViewAll();
        });
    }

    if (viewAllReminders) {
        viewAllReminders.addEventListener("click", event => {
            event.preventDefault();
            toggleViewAll();
        });
    }

    /* =====================================================
       CALENDAR
    ===================================================== */

    let currentCalendarDate = new Date();

    function calendarReminders() {
        const query = searchInput ? searchInput.value.toLowerCase().trim() : "";
        return reminders.filter(r => {
            if (r.isCompleted || !r.isActive) return false;
            if (!query) return true;
            return r.petName.toLowerCase().includes(query) || r.typeLabel.toLowerCase().includes(query);
        });
    }

    function renderCalendar() {
        if (!calendarGrid || !calendarTitle) return;

        calendarGrid.innerHTML = "";

        const year = currentCalendarDate.getFullYear();
        const month = currentCalendarDate.getMonth();
        const monthName = currentCalendarDate.toLocaleString("default", { month: "long" });

        calendarTitle.textContent = `${monthName} ${year}`;

        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const previousMonthDays = new Date(year, month, 0).getDate();
        const events = calendarReminders();
        const today = todayKey();

        /* Previous month cells */

        for (let i = firstDay - 1; i >= 0; i--) {
            const day = document.createElement("div");
            day.className = "calendar-day other-month";
            day.textContent = previousMonthDays - i;
            calendarGrid.appendChild(day);
        }

        /* Current month cells */

        for (let dayNumber = 1; dayNumber <= daysInMonth; dayNumber++) {
            const day = document.createElement("div");
            day.className = "calendar-day";
            day.textContent = dayNumber;

            const dateKey = `${year}-${pad(month + 1)}-${pad(dayNumber)}`;
            const matches = events.filter(event => event.dateKey === dateKey);

            if (matches.length > 0) {
                day.classList.add(`event-${matches[0].color}`);
                day.title = matches
                    .map(event => `${event.petName} - ${event.typeLabel}`)
                    .join("\n");
            }

            if (dateKey === today) {
                day.classList.add("today");
            }

            calendarGrid.appendChild(day);
        }

        /* Next month cells */

        const currentCells = calendarGrid.children.length;
        const remaining = 42 - currentCells;

        for (let i = 1; i <= remaining; i++) {
            const day = document.createElement("div");
            day.className = "calendar-day other-month";
            day.textContent = i;
            calendarGrid.appendChild(day);
        }
    }

    /* Previous / next month navigation */

    if (previousMonth) {
        previousMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
            renderCalendar();
        });
    }

    if (nextMonth) {
        nextMonth.addEventListener("click", () => {
            currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
            renderCalendar();
        });
    }

    /* =====================================================
       CLOSE MENU OUTSIDE CLICK
    ===================================================== */

    document.addEventListener("click", event => {
        if (
            !event.target.closest(".more-btn") &&
            !event.target.closest(".reminder-menu")
        ) {
            closeReminderMenus();
        }
    });

    /* =====================================================
       ESCAPE KEY
    ===================================================== */

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            closeReminderMenus();

            const modal = document.querySelector(".reminder-modal-overlay");
            if (modal) {
                modal.remove();
            }
        }
    });

    /* =====================================================
       INITIALIZE PAGE
    ===================================================== */

    loadPets();

    loadReminders();

    refreshIcons();

});