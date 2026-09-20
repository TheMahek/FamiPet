/* =========================================================
   Famipet HEALTH PAGE JAVASCRIPT
   Functional health records, pet switching, search,
   appointments and notifications.
   ========================================================= */

(() => {
    "use strict";

    let petsMap = {};
    let dietsMap = {};
    let allRecords = [];
    let allVaccinations = [];
    let allAppointments = [];
    let currentAppointment = null;
    let notifications = [];
    let selectedPet = localStorage.getItem("annSelectedHealthPet") || "";
    let showAllRecords = false;
    let showAllVaccinations = false;

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
        vaccineFields: $("vaccineFields"),
        recordSubmitBtn: $("recordSubmitBtn"),
        addVaccinationBtn: $("addVaccinationBtn"),
        vaccinationModal: $("vaccinationModal"),
        closeVaccinationModal: $("closeVaccinationModal"),
        vaccinationForm: $("vaccinationForm"),
        vaccinePet: $("vaccinePet"),
        rescheduleModal: $("rescheduleModal"),
        closeRescheduleModal: $("closeRescheduleModal"),
        rescheduleForm: $("rescheduleForm"),
        rescheduleDate: $("rescheduleDate"),
        rescheduleTime: $("rescheduleTime"),
        apptBody: $("apptBody"),
        appointmentEmpty: $("appointmentEmpty"),
        apptMonth: $("apptMonth"),
        apptDay: $("apptDay"),
        apptType: $("apptType"),
        apptTime: $("apptTime"),
        apptClinic: $("apptClinic"),
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
        markNotificationsRead: $("markNotificationsRead"),
        vaccMenuBtn: $("vaccMenuBtn"),
        vaccMenu: $("vaccMenu"),
        nutritionCompletion: $("nutritionCompletion"),
        nutritionCircle: $("nutritionCircle"),
        nutritionBody: $("nutritionBody"),
        nutritionTitle: $("nutritionTitle"),
        nutritionSummary: $("nutritionSummary"),
        nutritionTags: $("nutritionTags"),
        nutritionNotes: $("nutritionNotes"),
        nutritionGaps: $("nutritionGaps"),
        nutritionDisclaimer: $("nutritionDisclaimer"),
        editDietBtn: $("editDietBtn"),
        removeDietBtn: $("removeDietBtn"),
        dietModal: $("dietModal"),
        closeDietModal: $("closeDietModal"),
        cancelDietBtn: $("cancelDietBtn"),
        dietForm: $("dietForm"),
        dietModalPetName: $("dietModalPetName"),
        dietFoodType: $("dietFoodType"),
        dietBrand: $("dietBrand"),
        dietDailyPortion: $("dietDailyPortion"),
        dietActivity: $("dietActivity"),
        dietTimezone: $("dietTimezone"),
        dietAllergies: $("dietAllergies"),
        dietTreatPolicy: $("dietTreatPolicy"),
        dietNotes: $("dietNotes"),
        dietMealRows: $("dietMealRows"),
        addMealBtn: $("addMealBtn")
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
                var breedName = (pet.breed && pet.breed.name) || "";
                var ageLabel = pet.age === 1 ? "1 Year" : (pet.age + " Years");
                petsMap[pet._id] = {
                    name: pet.name,
                    details: [breedName, ageLabel].filter(Boolean).join(" • ") || sp,
                    image: (pet.images && pet.images.length) ? pet.images[0] : "../assets/images/adoption/pet1.jpg",
                    weight: pet.weight,
                    health: pet.health || "Good"
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
            var vaccineSel = $("vaccinePet");
            if (vaccineSel) {
                vaccineSel.innerHTML = "";
                opts.forEach(function (o) {
                    var opt = document.createElement("option");
                    opt.value = o.id;
                    opt.textContent = o.name;
                    vaccineSel.appendChild(opt);
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

    async function fetchAppointments() {
        try {
            var res = await FamiPetAPI.get("/appointments");
            allAppointments = res.appointments || [];
        } catch (err) {
            console.error("Failed to fetch appointments:", err);
            alert("Could not load appointments: " + (err.message || err));
            allAppointments = [];
        }
    }

    async function fetchDiets() {
        dietsMap = {};
        try {
            var res = await FamiPetAPI.get("/diet");
            (res.diets || []).forEach(function (d) {
                var petId = d.pet && typeof d.pet === "object" ? d.pet._id : d.pet;
                if (petId) dietsMap[petId] = d;
            });
        } catch (err) {
            console.error("Failed to fetch diets:", err);
            alert("Could not load diets: " + (err.message || err));
        }
    }

    function formatTime(timeStr) {
        if (!timeStr) return "\u2014";
        var parts = String(timeStr).split(":");
        var h = parseInt(parts[0], 10);
        var m = parseInt(parts[1], 10);
        if (Number.isNaN(h) || Number.isNaN(m)) return String(timeStr);
        var suffix = h >= 12 ? "PM" : "AM";
        var hr = h % 12 || 12;
        return hr + ":" + String(m).padStart(2, "0") + " " + suffix;
    }

    function pickNextAppointment(petId) {
        var now = Date.now();
        return allAppointments
            .filter(function (a) {
                return petIdOf(a) === petId && (a.status || "pending") !== "cancelled";
            })
            .map(function (a) {
                return { appt: a, ts: new Date(a.date).getTime() };
            })
            .filter(function (x) { return !Number.isNaN(x.ts); })
            .sort(function (a, b) {
                return a.ts - b.ts || String(a.appt.time || "").localeCompare(String(b.appt.time || ""));
            })
            .find(function (x) { return x.ts >= now; }) || null;
    }

    function renderAppointment() {
        var appt = pickNextAppointment(selectedPet);
        currentAppointment = appt ? appt.appt : null;

        if (elements.apptBody && elements.appointmentEmpty) {
            elements.apptBody.style.display = currentAppointment ? "" : "none";
            elements.appointmentEmpty.style.display = currentAppointment ? "none" : "";
        }

        if (currentAppointment) {
            var ad = new Date(currentAppointment.date);
            var vet = currentAppointment.veterinarian || {};
            var type = String(currentAppointment.type || "checkup")
                .replace(/-|_/g, " ");
            type = type.charAt(0).toUpperCase() + type.slice(1);
            elements.apptMonth.textContent = ad.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
            elements.apptDay.textContent = ad.getDate();
            elements.apptType.textContent = type;
            elements.apptTime.textContent = formatTime(currentAppointment.time);
            elements.apptClinic.textContent = vet.clinic || vet.name || "Veterinary Clinic";
        }
    }

    /* ---------- UI render ---------- */

    function escAttr(value) {
        return escapeHtml(value == null ? "" : String(value));
    }

    function mealCountOf(diet) {
        return (diet && diet.meals || []).filter(function (m) { return m && m.isActive !== false; }).length || 0;
    }

    function renderNutrition() {
        var diet = dietsMap[selectedPet];
        var guidance = diet && diet.guidance ? diet.guidance : null;
        var pct = guidance && isFinite(guidance.completion) ? guidance.completion : 0;

        if (elements.nutritionCompletion) {
            elements.nutritionCompletion.textContent = pct + "%";
        }
        if (elements.nutritionCircle) {
            var deg = Math.max(0, Math.min(360, Math.round(pct * 3.6)));
            elements.nutritionCircle.style.background =
                "conic-gradient(var(--mint) 0deg " + deg + "deg, #e8f1ee " + deg + "deg 360deg)";
        }

        if (!elements.nutritionTitle || !elements.nutritionBody) return;

        if (!diet) {
            elements.nutritionTitle.textContent = "No Diet Profile";
            elements.nutritionSummary.textContent =
                "No diet profile yet for this pet. Add food type, portion and meal times — feeding reminders follow the schedule.";
            elements.nutritionTags.innerHTML = "";
            elements.nutritionNotes.innerHTML = "";
            elements.nutritionGaps.style.display = "none";
            elements.nutritionDisclaimer.textContent = guidance ? guidance.disclaimer : "";
            elements.removeDietBtn.style.display = "none";
            return;
        }

        elements.nutritionTitle.textContent = "Daily Nutrition";

        var parts = [];
        if (diet.foodType) parts.push(diet.foodType.charAt(0).toUpperCase() + diet.foodType.slice(1));
        if (diet.dailyPortionGrams) parts.push(diet.dailyPortionGrams + " g/day");
        var meals = (diet.meals || []).filter(function (m) { return m && m.isActive !== false; });
        if (meals.length) parts.push(meals.length === 1 ? "1 meal time" : meals.length + " meal times");
        elements.nutritionSummary.textContent = parts.length
            ? parts.join(" • ") + "."
            : "Food, portion and meal times recorded below.";

        var tags = [];
        if (diet.foodType) tags.push("Diet: " + diet.foodType);
        if (diet.brand) tags.push(escAttr(diet.brand));
        if (diet.dailyPortionGrams) tags.push(diet.dailyPortionGrams + " g/day");
        if (diet.activityLevel) tags.push(diet.activityLevel + " activity");
        (diet.allergies || []).forEach(function (a) { tags.push(escAttr(a) + " \u00d7 allergy"); });
        meals.forEach(function (m) { tags.push(formatTime(m.time)); });
        if (!diet.foodType && !diet.brand && !diet.dailyPortionGrams && !tags.length) tags.push("Not set");
        elements.nutritionTags.innerHTML = tags.map(function (t) {
            return "<span>" + t + "</span>";
        }).join("");

        var notes = guidance && Array.isArray(guidance.notes) ? guidance.notes : [];
        elements.nutritionNotes.innerHTML = notes.map(function (n) {
            return "<li>" + escAttr(n) + "</li>";
        }).join("");

        var gaps = guidance && Array.isArray(guidance.gaps) ? guidance.gaps : [];
        if (gaps.length) {
            elements.nutritionGaps.style.display = "";
            elements.nutritionGaps.textContent = "Note: " + gaps.join(" ");
        } else {
            elements.nutritionGaps.style.display = "none";
        }

        elements.nutritionDisclaimer.textContent = guidance ? guidance.disclaimer : "";
        elements.removeDietBtn.style.display = "";
    }

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

        var healthText = String(pet.health || "Good").toLowerCase();
        var cardStrong = document.querySelector(".health-floating-card strong");
        if (cardStrong) {
            if (/poor/.test(healthText)) {
                cardStrong.textContent = "Poor Health";
            } else if (/needs|attention|sick|checkup/.test(healthText)) {
                cardStrong.textContent = "Needs Attention";
            } else {
                cardStrong.textContent = "Good Health";
            }
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

        var pet = petsMap[selectedPet];
        var petVaccines = getPetVaccinations();

        var vaccineTotal = petVaccines.length || vaccinationRecords.length;
        elements.vaccinationCount.textContent = vaccineTotal;
        elements.vaccinationStatus.textContent = vaccineTotal > 0
            ? (petVaccines.some(function (v) { return !v.completed; }) ? "Upcoming due" : "Up to date")
            : "No vaccinations";

        elements.recordCount.textContent = petRecords.length;

        var weightKg = pet && Number(pet.weight) > 0 ? Number(pet.weight) : 0;
        elements.weightValue.textContent = weightKg
            ? (Number.isInteger(weightKg) ? weightKg : weightKg.toFixed(1)) + " kg"
            : "\u2014";
        elements.weightStatus.textContent = weightKg
            ? (weightRecord ? "Last checked " + formatDate(weightRecord._visitDate || weightRecord.date) : "Recorded weight")
            : "No weight record";

        var futureVisits = petRecords
            .filter(function (r) { return r._nextVisit; })
            .map(function (r) { return { date: new Date(r._nextVisit), rec: r }; })
            .filter(function (v) { return !Number.isNaN(v.date.getTime()); })
            .sort(function (a, b) { return a.date - b.date; });

        var nextAppt = pickNextAppointment(selectedPet);

        if (nextAppt) {
            var ad = new Date(nextAppt.appt.date);
            elements.nextVisitValue.textContent = ad.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
            elements.nextVisitStatus.textContent = "Vet appointment";
        } else if (futureVisits.length) {
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

        if (!petVaccines.length) {
            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "this pet";
            list.innerHTML = '<div class="health-empty-state">No vaccinations recorded for ' + escapeHtml(petName) + ".</div>";
        }

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
            item.setAttribute("data-id", notification.id || "");
            item.innerHTML =
                '<span class="notification-dot"></span>' +
                "<div>" +
                "<strong>" + escapeHtml(notification.title) + "</strong>" +
                "<p>" + escapeHtml(notification.message) + "</p>" +
                "</div>";
            elements.notificationList.appendChild(item);

            item.addEventListener("click", async function () {
                var id = notification.id;
                if (!id || /^notification-/.test(String(id))) return;
                if (notification.read) return;
                try {
                    await FamiPetAPI.put("/notifications/" + encodeURIComponent(id) + "/read", {});
                    notification.read = true;
                    renderNotifications();
                } catch (e) { /* keep state */ }
            });
        });
    }

    async function fetchNotifications() {
        try {
            const data = await FamiPetAPI.get("/notifications");
            notifications = (data.notifications || []).map(function (n) {
                return {
                    id: n._id,
                    title: n.title || "",
                    message: n.message || "",
                    read: Boolean(n.isRead)
                };
            });
        } catch (e) {
            notifications = [];
        }
    }

    function addNotification(title, message) {
        notifications.unshift({ id: "notification-" + Date.now(), title: title, message: message, read: false });
        notifications = notifications.slice(0, 10);
        renderNotifications();
    }

    /* ---------- modal / CRUD ---------- */

    function openModal() {
        var typeSel = $("recordType");
        if (typeSel) typeSel.value = "";
        syncRecordTypeFields();
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

    function syncRecordTypeFields() {
        var isVaccination = (($("recordType") || {}).value || "").toLowerCase() === "vaccination";
        if (elements.vaccineFields) {
            elements.vaccineFields.style.display = isVaccination ? "" : "none";
        }
        if (elements.recordSubmitBtn) {
            elements.recordSubmitBtn.textContent = isVaccination ? "Save Vaccination" : "Save Health Record";
        }
        var vn = $("recordVaccineName");
        if (vn) vn.required = isVaccination;
        var nd = $("recordNextDueDate");
        if (nd) nd.required = isVaccination;
    }

    async function saveRecord(event) {
        event.preventDefault();

        var recordType = $("recordType").value.trim();
        var recordDate = $("recordDate").value;
        var vetName = $("vetName").value.trim();
        var notes = $("recordNotes").value.trim();
        var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "your pet";

        if (!recordType || !recordDate) {
            alert("Please select a record type and date.");
            return;
        }

        var isVaccination = recordType.toLowerCase() === "vaccination";

        try {
            if (isVaccination) {
                var vaccineName = $("recordVaccineName").value.trim();
                var nextDueDate = $("recordNextDueDate").value;
                if (!vaccineName || !nextDueDate) {
                    alert("Please enter the vaccine name and next due date.");
                    return;
                }
                var vPayload = { pet: selectedPet, vaccineName: vaccineName, vaccinationDate: recordDate, nextDueDate: nextDueDate };
                if (vetName) vPayload.veterinarian = vetName;
                if (notes) vPayload.notes = notes;
                await FamiPetAPI.post("/vaccinations", vPayload);

                showAllVaccinations = true;
                elements.healthRecordForm.reset();
                closeModal();

                await fetchVaccinations();
                updateStats();
                renderVaccinations();

                addNotification("Vaccination added", vaccineName + " was recorded for " + petName + ".");
            } else {
                var payload = { pet: selectedPet, diagnosis: recordType };
                if (recordDate) payload.visitDate = recordDate;
                if (vetName) payload.doctor = vetName;
                if (notes) payload.notes = notes;

                await FamiPetAPI.post("/health", payload);

                showAllRecords = true;
                elements.healthRecordForm.reset();
                closeModal();

                await fetchHealthRecords();
                updateStats();
                renderRecords();

                addNotification("Health record added", recordType + " was added for " + petName + ".");
            }
        } catch (err) {
            alert("Failed to save record: " + (err.message || err));
        }
    }

    /* ---------- vaccination modal ---------- */

    function toggleVaccMenu(forceOpen) {
        var menu = elements.vaccMenu;
        var btn = elements.vaccMenuBtn;

        if (!menu || !btn) return;

        var open = forceOpen !== undefined
            ? Boolean(forceOpen)
            : !menu.classList.contains("open");

        menu.classList.toggle("open", open);
        btn.setAttribute("aria-expanded", String(open));

        if (!open) {
            menu.classList.remove("open-up");
            return;
        }

        /* Keep the menu inside the viewport: flip it above the
           button when it would otherwise be cut off at the bottom. */
        menu.classList.remove("open-up");

        var menuRect = menu.getBoundingClientRect();
        var btnRect = btn.getBoundingClientRect();

        if (
            menuRect.bottom > window.innerHeight - 8 &&
            btnRect.top - menuRect.height - 8 >= 0
        ) {
            menu.classList.add("open-up");
        }
    }

    function openVaccinationModal() {
        elements.vaccinationModal.classList.add("open");
        var dateInput = $("vaccinationDate");
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }
        var petSel = $("vaccinePet");
        if (petSel && petSel.value !== selectedPet) {
            for (var i = 0; i < petSel.options.length; i++) {
                if (petSel.options[i].value === selectedPet) {
                    petSel.selectedIndex = i;
                    break;
                }
            }
        }
    }

    function closeVaccinationModal() {
        elements.vaccinationModal.classList.remove("open");
    }

    async function saveVaccination(event) {
        event.preventDefault();

        var pet = $("vaccinePet").value;
        var vaccineName = $("vaccineName").value.trim();
        var vaccinationDate = $("vaccinationDate").value;
        var nextDueDate = $("vaccinationNextDue").value;
        var vet = $("vaccinationVet").value.trim();
        var notes = $("vaccinationNotes").value.trim();
        var doseNumber = parseInt($("doseNumber").value || "1", 10) || 1;

        if (!pet || !vaccineName || !vaccinationDate || !nextDueDate) {
            alert("Please fill vaccine name, vaccination date and next due date.");
            return;
        }

        var payload = { pet: pet, vaccineName: vaccineName, vaccinationDate: vaccinationDate, nextDueDate: nextDueDate, doseNumber: doseNumber };
        if (vet) payload.veterinarian = vet;
        if (notes) payload.notes = notes;

        try {
            await FamiPetAPI.post("/vaccinations", payload);

            elements.vaccinationForm.reset();
            closeVaccinationModal();

            await fetchVaccinations();
            updateStats();
            renderVaccinations();

            var petName = petsMap[pet] ? petsMap[pet].name : "your pet";
            addNotification("Vaccination added", vaccineName + " was recorded for " + petName + ".");
        } catch (err) {
            alert("Failed to save vaccination: " + (err.message || err));
        }
    }

    /* ---------- reschedule modal ---------- */

    function openRescheduleModal() {
        if (!currentAppointment) return;
        elements.rescheduleModal.classList.add("open");
        var d = new Date(currentAppointment.date);
        var dateInput = $("rescheduleDate");
        if (dateInput) dateInput.value = d.toISOString().split("T")[0];
        var timeInput = $("rescheduleTime");
        if (timeInput) timeInput.value = currentAppointment.time || "";
    }

    function closeRescheduleModal() {
        elements.rescheduleModal.classList.remove("open");
    }

    async function saveReschedule(event) {
        event.preventDefault();
        if (!currentAppointment) return;

        var newDate = $("rescheduleDate").value;
        var newTime = $("rescheduleTime").value;
        if (!newDate || !newTime) {
            alert("Please pick a new date and time.");
            return;
        }

        try {
            await FamiPetAPI.put("/appointments/" + currentAppointment._id, { date: newDate, time: newTime });

            closeRescheduleModal();
            await fetchAppointments();
            renderAppointment();
            updateStats();

            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "your pet";
            addNotification("Appointment rescheduled", "Your vet appointment for " + petName + " has been rescheduled.");
        } catch (err) {
            alert("Failed to reschedule: " + (err.message || err));
        }
    }

    async function cancelAppointment() {
        if (!currentAppointment) return;
        if (!confirm("Are you sure you want to cancel this appointment?")) return;

        try {
            await FamiPetAPI.del("/appointments/" + currentAppointment._id);

            await fetchAppointments();
            renderAppointment();
            updateStats();

            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "your pet";
            addNotification("Appointment cancelled", "Your upcoming vet appointment for " + petName + " has been cancelled.");
        } catch (err) {
            alert("Failed to cancel appointment: " + (err.message || err));
        }
    }

    /* ---------- diet & nutrition modal ---------- */

    function closeDietModal() {
        elements.dietModal?.classList.remove("open");
    }

    function mealRowTemplate(meal) {
        var row = document.createElement("div");
        row.className = "meal-row";
        if (meal && meal._id) row.setAttribute("data-id", meal._id);

        var label = document.createElement("input");
        label.type = "text";
        label.className = "meal-label";
        label.placeholder = "e.g. Breakfast";
        label.maxLength = 40;
        label.value = meal && meal.label ? meal.label : "";
        row.appendChild(label);

        var time = document.createElement("input");
        time.type = "time";
        time.className = "meal-time";
        time.value = meal && meal.time ? meal.time : "";
        row.appendChild(time);

        var portion = document.createElement("input");
        portion.type = "number";
        portion.className = "meal-portion";
        portion.placeholder = "g";
        portion.min = "0";
        portion.max = "20000";
        portion.step = "1";
        if (meal && meal.portionGrams !== undefined && meal.portionGrams !== null) {
            portion.value = meal.portionGrams;
        }
        row.appendChild(portion);

        var remove = document.createElement("button");
        remove.type = "button";
        remove.className = "remove-meal-btn";
        remove.setAttribute("aria-label", "Remove meal time");
        remove.innerHTML = "&times;";
        remove.addEventListener("click", function () { row.remove(); });
        row.appendChild(remove);

        return row;
    }

    function renderMealRows(meals) {
        if (!elements.dietMealRows) return;
        elements.dietMealRows.innerHTML = "";
        (meals || []).forEach(function (meal) {
            elements.dietMealRows.appendChild(mealRowTemplate(meal));
        });
    }

    function openDietModal() {
        var diet = dietsMap[selectedPet];
        var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "this pet";
        if (elements.dietModalPetName) elements.dietModalPetName.textContent = petName;

        elements.dietFoodType.value = diet && diet.foodType ? diet.foodType : "";
        elements.dietBrand.value = diet && diet.brand ? diet.brand : "";
        elements.dietDailyPortion.value = diet && diet.dailyPortionGrams ? diet.dailyPortionGrams : "";
        elements.dietActivity.value = diet && diet.activityLevel ? diet.activityLevel : "";
        elements.dietTimezone.value = diet && diet.timezone && diet.timezone !== "UTC" ? diet.timezone : "";
        elements.dietAllergies.value = diet && diet.allergies ? diet.allergies.join(", ") : "";
        elements.dietTreatPolicy.value = diet && diet.treatPolicy ? diet.treatPolicy : "";
        elements.dietNotes.value = diet && diet.notes ? diet.notes : "";

        renderMealRows((diet && diet.meals || []).filter(function (m) { return m.isActive !== false; }));
        if (!elements.dietMealRows.children.length) renderMealRows([null]);

        elements.dietModal?.classList.add("open");
        setTimeout(function () { elements.dietFoodType?.focus(); }, 100);
    }

    function addMealRow() {
        if (!elements.dietMealRows) return;
        if (elements.dietMealRows.children.length >= 8) {
            alert("You can set at most 8 meal times.");
            return;
        }
        elements.dietMealRows.appendChild(mealRowTemplate(null));
    }

    function dietPayload() {
        var meals = [];
        Array.from(elements.dietMealRows.children).forEach(function (row) {
            var time = (row.querySelector(".meal-time") || {}).value || "";
            if (!time) return;
            var m = {
                label: (row.querySelector(".meal-label") || {}).value || "",
                time: time
            };
            var portion = (row.querySelector(".meal-portion") || {}).value;
            if (portion === "" || portion === null || portion === undefined) {
                m.portionGrams = undefined;
            } else {
                m.portionGrams = Number(portion);
            }
            var rowId = row.getAttribute("data-id");
            if (rowId) m._id = rowId;
            meals.push(m);
        });

        var payload = { meals: meals };
        if (elements.dietFoodType.value) payload.foodType = elements.dietFoodType.value;
        if (elements.dietBrand.value.trim()) payload.brand = elements.dietBrand.value.trim();
        if (elements.dietDailyPortion.value) payload.dailyPortionGrams = Number(elements.dietDailyPortion.value);
        if (elements.dietActivity.value) payload.activityLevel = elements.dietActivity.value;
        if (elements.dietTimezone.value.trim()) payload.timezone = elements.dietTimezone.value.trim();
        var allergies = elements.dietAllergies.value.split(",")
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
        if (allergies.length) payload.allergies = allergies;
        if (elements.dietTreatPolicy.value.trim()) payload.treatPolicy = elements.dietTreatPolicy.value.trim();
        if (elements.dietNotes.value.trim()) payload.notes = elements.dietNotes.value.trim();
        return payload;
    }

    async function saveDiet(event) {
        event.preventDefault();
        if (!selectedPet) return;

        var payload = dietPayload();
        try {
            await FamiPetAPI.put("/diet/" + encodeURIComponent(selectedPet), payload);
            closeDietModal();
            await fetchDiets();
            renderNutrition();
            var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "your pet";
            addNotification("Diet updated", "The diet profile for " + petName + " was saved. Feeding reminders follow the schedule.");
        } catch (err) {
            alert("Failed to save diet: " + (err.message || err));
        }
    }

    async function removeDiet() {
        if (!selectedPet) return;
        var petName = petsMap[selectedPet] ? petsMap[selectedPet].name : "this pet";
        if (!confirm("Remove the diet profile and feeding reminders for " + petName + "?")) return;
        try {
            await FamiPetAPI.del("/diet/" + encodeURIComponent(selectedPet));
            await fetchDiets();
            renderNutrition();
            addNotification("Diet removed", "The diet profile for " + petName + " was removed.");
        } catch (err) {
            alert("Failed to remove diet: " + (err.message || err));
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
        $("recordType")?.addEventListener("change", syncRecordTypeFields);

        elements.addVaccinationBtn?.addEventListener("click", openVaccinationModal);
        elements.closeVaccinationModal?.addEventListener("click", closeVaccinationModal);
        elements.vaccinationModal?.addEventListener("click", function (event) {
            if (event.target === elements.vaccinationModal) closeVaccinationModal();
        });
        elements.vaccinationForm?.addEventListener("submit", saveVaccination);

        elements.vaccMenuBtn?.addEventListener("click", function (event) {
            event.stopPropagation();
            toggleVaccMenu();
        });

        elements.vaccMenu?.addEventListener("click", function (event) {
            var item = event.target.closest("[data-action]");
            if (!item) return;

            var action = item.getAttribute("data-action");
            toggleVaccMenu(false);

            if (action === "view-history") {
                elements.viewVaccinationBtn?.click();
            } else if (action === "add-vaccination") {
                elements.addVaccinationBtn?.click();
            }
        });

        elements.closeRescheduleModal?.addEventListener("click", closeRescheduleModal);
        elements.rescheduleModal?.addEventListener("click", function (event) {
            if (event.target === elements.rescheduleModal) closeRescheduleModal();
        });
        elements.rescheduleForm?.addEventListener("submit", saveReschedule);

        elements.petSelect?.addEventListener("change", function (event) {
            selectedPet = event.target.value;
            showAllRecords = false;
            updatePet();
            updateStats();
            renderRecords();
            renderVaccinations();
            renderAppointment();
            renderNutrition();
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

        elements.rescheduleAppointmentBtn?.addEventListener("click", openRescheduleModal);
        elements.cancelAppointmentBtn?.addEventListener("click", cancelAppointment);

        elements.editDietBtn?.addEventListener("click", openDietModal);
        elements.closeDietModal?.addEventListener("click", closeDietModal);
        elements.cancelDietBtn?.addEventListener("click", closeDietModal);
        elements.dietModal?.addEventListener("click", function (event) {
            if (event.target === elements.dietModal) closeDietModal();
        });
        elements.dietForm?.addEventListener("submit", saveDiet);
        elements.addMealBtn?.addEventListener("click", addMealRow);
        elements.removeDietBtn?.addEventListener("click", removeDiet);

        elements.notificationBtn?.addEventListener("click", function (event) {
            event.stopPropagation();
            var open = elements.notificationPanel.classList.toggle("open");
            elements.notificationBtn.setAttribute("aria-expanded", String(open));
        });

        elements.markNotificationsRead?.addEventListener("click", async function () {
            try {
                await FamiPetAPI.put("/notifications/read-all", {});
            } catch (e) { return; }
            notifications = notifications.map(function (n) { return { id: n.id, title: n.title, message: n.message, read: true }; });
            renderNotifications();
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape") {
                closeModal();
                closeVaccinationModal();
                closeRescheduleModal();
                closeDietModal();
                toggleVaccMenu(false);
                elements.notificationPanel?.classList.remove("open");
                elements.notificationBtn?.setAttribute("aria-expanded", "false");
            }
        });

        document.addEventListener("click", function (event) {
            if (!event.target.closest(".notification-wrapper")) {
                elements.notificationPanel?.classList.remove("open");
                elements.notificationBtn?.setAttribute("aria-expanded", "false");
            }
            if (!event.target.closest(".vacc-menu-wrap")) {
                toggleVaccMenu(false);
            }
        });
    }

    /* ---------- init ---------- */

    async function init() {
        notifications = [];

        await fetchPets();
        await Promise.all([fetchHealthRecords(), fetchVaccinations(), fetchNotifications(), fetchAppointments(), fetchDiets()]);

        updatePet();
        updateStats();
        renderRecords();
        renderVaccinations();
        renderAppointment();
        renderNutrition();
        renderNotifications();
        setupEvents();
        syncRecordTypeFields();

        if (typeof lucide !== "undefined") {
            lucide.createIcons();
        }
    }

    init();
})();
