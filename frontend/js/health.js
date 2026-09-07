/* =========================================================
   Famipet HEALTH PAGE JAVASCRIPT
   Functional health records, pet switching, search,
   appointments and notifications.
   ========================================================= */

(() => {
    "use strict";

    let petsMap = {};
    let allRecords = [];
    let allVaccinations = [];
    let notifications = [];
    let selectedPet = localStorage.getItem("annSelectedHealthPet") || "";
    let showAllRecords = false;
    let showAllVaccinations = false;

    const DEFAULT_NOTIFICATIONS = [
        { id: "vaccine-due", title: "Vaccination due soon", message: "Check upcoming vaccinations.", read: false },
        { id: "health-check", title: "Health records reminder", message: "Review your pet's latest health records.", read: false },
        { id: "nutrition", title: "Wellness reminder", message: "Keep fresh water available and maintain daily exercise.", read: false }
    ];

    const $ = (id) => document.getElementById(id);

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function formatDate(dateString) {
        if (!dateString) return "\u2014";
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return dateString;
        return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    }

    function toISODate(dateString) {
        if (!dateString) return "";
        const d = new Date(dateString);
        if (Number.isNaN(d.getTime())) return "";
        return d.toISOString().split("T")[0];
    }

    function iconForRecord(type) {
        const value = (type || "").toLowerCase();
        if (value.includes("vaccination")) return "fa-syringe";
        if (value.includes("weight")) return "fa-weight-scale";
        if (value.includes("medication")) return "fa-pills";
        return "fa-stethoscope";
    }

    function vaccineDueLabel(nextDueDate) {
        if (!nextDueDate) return "";
        const d = new Date(nextDueDate);
        if (Number.isNaN(d.getTime())) return nextDueDate;
        const formatted = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
        const now = new Date();
        return d < now ? "Due: " + formatted : "Next due: " + formatted;
    }

    const elements = {
        addRecordBtn: $("addRecordBtn"),
        recordModal: $("recordModal"),
        closeRecordModal: $("closeRecordModal"),
        healthRecordForm: $("healthRecordForm"),
        petSelect: $("petSelect"),
        healthSearch: $("healthSearch"),
        currentPetName: $("currentPetName"),
        currentPetDetails: $("currentPetDetails"),
        currentPetImage: $("currentPetImage"),
        heroPetImage: $("heroPetImage"),
        vaccinationCount: $("vaccinationCount"),
        vaccinationStatus: $("vaccinationStatus"),
        recordCount: $("recordCount"),
        weightValue: $("weightValue"),
        weightStatus: $("weightStatus"),
        nextVisitValue: $("nextVisitValue"),
        nextVisitStatus: $("nextVisitStatus"),
        recordsRows: $("recordsRows"),
        viewRecordsBtn: $("viewRecordsBtn"),
        viewHealthRecordsBtn: $("viewHealthRecordsBtn"),
        viewVaccinationBtn: $("viewVaccinationBtn"),
        bookAppointmentBtn: $("bookAppointmentBtn"),
        rescheduleAppointmentBtn: $("rescheduleAppointmentBtn"),
        cancelAppointmentBtn: $("cancelAppointmentBtn"),
        notificationBtn: $("notificationBtn"),
        notificationPanel: $("notificationPanel"),
        notificationBadge: $("notificationBadge"),
        notificationSummary: $("notificationSummary"),
        notificationList: $("notificationList"),
        markNotificationsRead: $("markNotificationsRead")
    };

    /* ---------- API helpers ---------- */

    function petIdOf(record) {
        const p = record.pet;
        return typeof p === "object" && p !== null ? p._id : p;
    }

    function mapRecord(rec) {
        return {
            id: rec._id,
            date: toISODate(rec.visitDate) || toISODate(rec.createdAt) || "",
            type: rec.diagnosis || "General Checkup",
            vet: rec.doctor || rec.treatment || "Not specified",
            notes: rec.notes || "",
            _visitDate: rec.visitDate,
            _nextVisit: rec.nextVisit,
            _treatment: rec.treatment,
            _hospital: rec.hospital,
            _prescription: rec.prescription
        };
    }

    function mapVaccination(vac) {
        const done = vac.status === "Completed";
        return {
            id: vac._id,
            name: vac.vaccineName,
            due: vaccineDueLabel(vac.nextDueDate),
            status: done ? "Done" : "Upcoming",
            completed: done,
            _vaccinationDate: vac.vaccinationDate,
            _nextDueDate: vac.nextDueDate,
            _doseNumber: vac.doseNumber,
            _veterinarian: vac.veterinarian,
            _hospital: vac.hospital,
            _notes: vac.notes
        };
    }

    function getPetRecords() {
        return allRecords
            .filter(function (r) { return petIdOf(r) === selectedPet; })
            .map(mapRecord);
    }

    function getPetVaccinations() {
        return allVaccinations
            .filter(function (v) { return petIdOf(v) === selectedPet; })
            .map(mapVaccination);
    }

    async function fetchPets() {
        try {
            const res = await FamiPetAPI.get("/pets/my");
            var pets = res.pets || [];
            petsMap = {};
            var opts = [];
            pets.forEach(function (pet) {
                var sp = pet.species
                    ? pet.species.charAt(0).toUpperCase() + pet.species.slice(1)
                    : "Pet";
                petsMap[pet._id] = {
                    name: pet.name,
                    details: sp,
                    image: (pet.images && pet.images.length) ? pet.images[0] : "../assets/images/adoption/pet1.jpg"
                };
                opts.push({ id: pet._id, name: pet.name });
            });
            var sel = elements.petSelect;
            if (sel) {
                sel.innerHTML = "";
                opts.forEach(function (o) {
                    var opt = document.createElement("option");
                    opt.value = o.id;
                    opt.textContent = o.name;
                    sel.appendChild(opt);
                });
            }
            if (!selectedPet || !petsMap[selectedPet]) {
                selectedPet = opts.length ? opts[0].id : "";
            }
        } catch (err) {
            console.error("Failed to fetch pets:", err);
            alert("Could not load pets: " + (err.message || err));
        }
    }

    async function fetchHealthRecords() {
        try {
            var res = await FamiPetAPI.get("/health");
            allRecords = res.records || [];
        } catch (err) {
            console.error("Failed to fetch health records:", err);
            alert("Could not load health records: " + (err.message || err));
            allRecords = [];
        }
    }

    async function fetchVaccinations() {
        try {
            var res = await FamiPetAPI.get("/vaccinations");
            allVaccinations = res.vaccinations || [];
        } catch (err) {
            console.error("Failed to fetch vaccinations:", err);
            alert("Could not load vaccinations: " + (err.message || err));
            allVaccinations = [];
        }
    }

    /* ---------- UI render ---------- */

    function updatePet() {
        var pet = petsMap[selectedPet];
        if (!pet) return;

        elements.petSelect.value = selectedPet;
        elements.currentPetName.textContent = pet.name;
        elements.currentPetDetails.textContent = pet.details;
        elements.currentPetImage.src = pet.image;
        elements.currentPetImage.alt = pet.name;
        elements.heroPetImage.src = pet.image;
        elements.heroPetImage.alt = pet.name + " - Healthy Pet";

        var nutritionText = document.querySelector(".nutrition-info p");
        if (nutritionText) {
            nutritionText.textContent = pet.name + "'s current diet is well balanced.";
        }

        localStorage.setItem("annSelectedHealthPet", selectedPet);
    }

    function updateStats() {
        var petRecords = getPetRecords();
        var vaccinationRecords = petRecords.filter(function (r) {
            return r.type.toLowerCase().includes("vaccination");
        });

        var weightRecord = petRecords
            .filter(function (r) { return r.type.toLowerCase().includes("weight"); })
            .sort(function (a, b) { return b.date.localeCompare(a.date); })[0];

        var petVaccines = getPetVaccinations();
        elements.vaccinationCount.textContent = petVaccines.length || vaccinationRecords.length;
        elements.vaccinationStatus.textContent = "Up to date";
        elements.recordCount.textContent = petRecords.length;

        elements.weightValue.textContent = weightRecord ? "Checked" : "\u2014";
        elements.weightStatus.textContent = weightRecord
            ? formatDate(weightRecord._visitDate || weightRecord.date)
            : "No weight record";

        var futureVisits = petRecords
            .filter(function (r) { return r._nextVisit; })
            .map(function (r) { return { date: new Date(r._nextVisit), rec: r }; })
            .filter(function (v) { return !Number.isNaN(v.date.getTime()); })
            .sort(function (a, b) { return a.date - b.date; });

        if (futureVisits.length) {
            var next = futureVisits[0];
            elements.nextVisitValue.textContent = next.date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
            elements.nextVisitStatus.textContent = "Vet appointment";
        } else {
            elements.nextVisitValue.textContent = "\u2014";
            elements.nextVisitStatus.textContent = "No upcoming visits";
        }
    }

    function renderRecords() {
        var query = elements.healthSearch.value.trim().toLowerCase();
        var petRecords = getPetRecords().sort(function (a, b) { return b.date.localeCompare(a.date); });
        var filtered = petRecords.filter(function (record) {
            return (record.date + " " + record.type + " " + (record.vet || "") + " " + (record.notes || "")).toLowerCase().includes(query);
        });

        var visible = showAllRecords ? filtered : filtered.slice(0, 3);
        elements.recordsRows.innerHTML = "";

        if (!visible.length) {
            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "this pet";
            elements.recordsRows.innerHTML =
                '<div class="health-empty-state">No health records found for ' + escapeHtml(petName) + ".</div>";
        } else {
            visible.forEach(function (record) {
                var row = document.createElement("div");
                row.className = "table-row";
                row.innerHTML =
                    "<span>" + formatDate(record.date) + "</span>" +
                    '<div class="record-name">' +
                    '<div class="record-icon"><i class="fa-solid ' + iconForRecord(record.type) + '"></i></div>' +
                    "<strong>" + escapeHtml(record.type) + "</strong>" +
                    "</div>" +
                    "<span>" + escapeHtml(record.vet || "Not specified") + "</span>" +
                    '<span class="record-status">Completed</span>';
                elements.recordsRows.appendChild(row);
            });
        }

        elements.viewRecordsBtn.innerHTML = showAllRecords
            ? 'Show Less <i class="fa-solid fa-arrow-up"></i>'
            : 'View All <i class="fa-solid fa-arrow-right"></i>';
    }

    function renderVaccinations() {
        var list = document.querySelector(".vaccination-list");
        if (!list) return;

        list.innerHTML = "";
        var petVaccines = getPetVaccinations();
        var visible = petVaccines.slice(0, showAllVaccinations ? petVaccines.length : 3);

        visible.forEach(function (vaccine) {
            var item = document.createElement("div");
            item.className = "vaccine-item";
            item.innerHTML =
                '<div class="vaccine-icon ' + (vaccine.completed ? "" : "upcoming") + '">' +
                '<i class="fa-solid ' + (vaccine.completed ? "fa-shield-virus" : "fa-syringe") + '"></i>' +
                "</div>" +
                '<div class="vaccine-info">' +
                "<strong>" + escapeHtml(vaccine.name) + "</strong>" +
                "<span>" + escapeHtml(vaccine.due) + "</span>" +
                "</div>" +
                '<span class="status ' + (vaccine.completed ? "completed" : "upcoming-status") + '">' +
                (vaccine.completed ? '<i class="fa-solid fa-check"></i> Done' : escapeHtml(vaccine.status)) +
                "</span>";
            list.appendChild(item);
        });

        elements.viewVaccinationBtn.innerHTML = showAllVaccinations
            ? 'Hide Vaccination History <i class="fa-solid fa-arrow-up"></i>'
            : 'View Vaccination History <i class="fa-solid fa-arrow-right"></i>';
    }

    function renderNotifications() {
        var unread = notifications.filter(function (n) { return !n.read; }).length;
        elements.notificationBadge.textContent = unread;
        elements.notificationBadge.style.display = unread ? "flex" : "none";
        elements.notificationSummary.textContent = unread === 1 ? "1 unread" : unread + " unread";

        elements.notificationList.innerHTML = "";

        if (!notifications.length || unread === 0) {
            elements.notificationList.innerHTML = '<div class="notification-empty">You\'re all caught up!</div>';
            return;
        }

        notifications.forEach(function (notification) {
            var item = document.createElement("div");
            item.className = "notification-item " + (notification.read ? "read" : "");
            item.innerHTML =
                '<span class="notification-dot"></span>' +
                "<div>" +
                "<strong>" + escapeHtml(notification.title) + "</strong>" +
                "<p>" + escapeHtml(notification.message) + "</p>" +
                "</div>";
            elements.notificationList.appendChild(item);
        });
    }

    function addNotification(title, message) {
        notifications.unshift({ id: "notification-" + Date.now(), title: title, message: message, read: false });
        notifications = notifications.slice(0, 10);
        renderNotifications();
    }

    /* ---------- modal / CRUD ---------- */

    function openModal() {
        elements.recordModal.classList.add("open");
        var dateInput = $("recordDate");
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }
        setTimeout(function () { var el = $("recordType"); if (el) el.focus(); }, 100);
    }

    function closeModal() {
        elements.recordModal.classList.remove("open");
    }

    async function saveRecord(event) {
        event.preventDefault();

        var recordType = $("recordType").value.trim();
        var recordDate = $("recordDate").value;
        var vetName = $("vetName").value.trim();
        var notes = $("recordNotes").value.trim();

        if (!recordType || !recordDate) {
            alert("Please select a record type and date.");
            return;
        }

        var payload = { pet: selectedPet, diagnosis: recordType };
        if (recordDate) payload.visitDate = recordDate;
        if (vetName) payload.doctor = vetName;
        if (notes) payload.notes = notes;

        try {
            await FamiPetAPI.post("/health", payload);

            showAllRecords = true;
            elements.healthRecordForm.reset();
            closeModal();

            await fetchHealthRecords();
            updateStats();
            renderRecords();

            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "your pet";
            addNotification("Health record added", recordType + " was added for " + petName + ".");
        } catch (err) {
            alert("Failed to save record: " + (err.message || err));
        }
    }

    /* ---------- events ---------- */

    function setupEvents() {
        elements.addRecordBtn?.addEventListener("click", openModal);
        elements.closeRecordModal?.addEventListener("click", closeModal);
        elements.recordModal?.addEventListener("click", function (event) {
            if (event.target === elements.recordModal) closeModal();
        });
        elements.healthRecordForm?.addEventListener("submit", saveRecord);

        elements.petSelect?.addEventListener("change", function (event) {
            selectedPet = event.target.value;
            showAllRecords = false;
            updatePet();
            updateStats();
            renderRecords();
            renderVaccinations();
        });

        elements.healthSearch?.addEventListener("input", function () {
            renderRecords();
        });

        elements.viewRecordsBtn?.addEventListener("click", function () {
            showAllRecords = !showAllRecords;
            renderRecords();
        });

        elements.viewHealthRecordsBtn?.addEventListener("click", function () {
            document.querySelector(".records-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });

        elements.viewVaccinationBtn?.addEventListener("click", function () {
            showAllVaccinations = !showAllVaccinations;
            renderVaccinations();
        });

        elements.bookAppointmentBtn?.addEventListener("click", function () {
            document.querySelector(".appointment-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
        });

        elements.rescheduleAppointmentBtn?.addEventListener("click", function () {
            addNotification("Appointment rescheduled", "Your vet appointment has been rescheduled.");
        });

        elements.cancelAppointmentBtn?.addEventListener("click", function () {
            if (!confirm("Are you sure you want to cancel this appointment?")) return;
            addNotification("Appointment cancelled", "Your upcoming vet appointment has been cancelled.");
        });

        elements.notificationBtn?.addEventListener("click", function (event) {
            event.stopPropagation();
            var open = elements.notificationPanel.classList.toggle("open");
            elements.notificationBtn.setAttribute("aria-expanded", String(open));
        });

        elements.markNotificationsRead?.addEventListener("click", function () {
            notifications = notifications.map(function (n) { return { id: n.id, title: n.title, message: n.message, read: true }; });
            renderNotifications();
        });

        document.addEventListener("click", function (event) {
            if (!event.target.closest(".notification-wrapper")) {
                elements.notificationPanel?.classList.remove("open");
                elements.notificationBtn?.setAttribute("aria-expanded", "false");
            }
        });
    }

    /* ---------- init ---------- */

    async function init() {
        notifications = DEFAULT_NOTIFICATIONS.map(function (n) { return Object.assign({}, n); });

        await fetchPets();
        await Promise.all([fetchHealthRecords(), fetchVaccinations()]);

        updatePet();
        updateStats();
        renderRecords();
        renderVaccinations();
        renderNotifications();
        setupEvents();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    init();
})();
