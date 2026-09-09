/* =========================================================
   Famipet APPOINTMENTS LOGIC
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       APPOINTMENT DATA
    ===================================================== */

    let appointments = [];

    let notifications = [];

    let myPets = [];

    let vets = [];


    /* =====================================================
       LOAD DATA (pets + veterinarians + appointments)
    ===================================================== */

    async function loadPetsAndVets() {

        try {

            const petData =
                await FamiPetAPI.get(
                    "/pets/my"
                );

            myPets =
                petData.pets || [];

        } catch (error) {

            myPets = [];

        }


        try {

            const vetData =
                await FamiPetAPI.get(
                    "/veterinarians"
                );

            vets =
                (vetData.veterinarians || [])
                    .filter(
                        item =>
                            item.isActive !== false
                    );

        } catch (error) {

            vets = [];

        }

    }


    /* =====================================================
       TYPE MAPPING (backend enum <-> UI display)
    ===================================================== */

    function mapTypeToBackend(type) {

        switch (type) {

            case "Vaccination":
                return "vaccination";

            case "Grooming":
                return "grooming";

            case "Dental Cleaning":
                return "checkup";

            case "Follow-up":
                return "consultation";

            case "General Checkup":
            default:
                return "checkup";

        }

    }


    function mapTypeFromBackend(type) {

        switch (type) {

            case "vaccination":
                return "Vaccination";

            case "grooming":
                return "Grooming";

            case "surgery":
                return "Surgery";

            case "emergency":
                return "Emergency";

            case "consultation":
                return "Consultation";

            case "checkup":
            default:
                return "Checkup";

        }

    }


    /* =====================================================
       STATUS MAPPING (backend enum <-> UI status)
    ===================================================== */

    function mapStatusFromBackend(status) {

        switch (status) {

            case "pending":
            case "confirmed":
                return "upcoming";

            case "completed":
                return "completed";

            case "no-show":
            case "cancelled":
                return "cancelled";

            default:
                return "upcoming";

        }

    }


    /* =====================================================
       BACKEND DATE / TIME FORMAT
    ===================================================== */

    function formatBackendDate(date) {

        return String(date)
            .slice(0, 10);

    }


    function formatBackendTime(time) {

        if (!time) {
            return "";
        }

        const clean =
            String(time)
                .trim()
                .replace(
                    /\s*(AM|PM)/i,
                    ""
                );

        const parts =
            clean.split(":");

        if (parts.length < 2) {
            return String(time);
        }

        let hour =
            Number(parts[0]);

        const minutes =
            parts[1].slice(0, 2);

        const ampm =
            hour >= 12
                ? "PM"
                : "AM";

        hour =
            hour % 12 || 12;

        return `${String(
            hour
        ).padStart(
            2,
            "0"
        )}:${minutes} ${ampm}`;

    }


    /* =====================================================
       NORMALIZE BACKEND APPOINTMENT -> UI SHAPE
    ===================================================== */

    function normalizeAppointment(raw) {

        const petImage =
            raw.pet &&
            raw.pet.images &&
            raw.pet.images.length
                ? raw.pet.images[0]
                : "../assets/images/adoption/pet1.jpg";

        return {

            id:
                raw._id,

            pet:
                raw.pet
                    ? raw.pet.name
                    : "Unknown pet",

            type:
                mapTypeFromBackend(
                    raw.type
                ),

            doctor:
                raw.veterinarian
                    ? raw.veterinarian.name
                    : "Veterinary Doctor",

            date:
                formatBackendDate(
                    raw.date
                ),

            time:
                formatBackendTime(
                    raw.time
                ),

            clinic:
                raw.veterinarian
                    ? raw.veterinarian.clinic
                    : "",

            status:
                mapStatusFromBackend(
                    raw.status
                ),

            image:
                petImage

        };

    }


    /* =====================================================
       LOAD APPOINTMENTS
    ===================================================== */

    async function loadAppointments() {

        try {

            const data =
                await FamiPetAPI.get(
                    "/appointments"
                );

            appointments =
                (data.appointments || [])
                    .map(
                        normalizeAppointment
                    );

        } catch (error) {

            appointments = [];

        }

        renderAll();

    }


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const upcomingList =
        document.getElementById("upcomingList");

    const historyList =
        document.getElementById("historyList");

    const searchInput =
        document.getElementById("appointmentSearch");

    const upcomingCount =
        document.getElementById("upcomingCount");

    const completedCount =
        document.getElementById("completedCount");

    const cancelledCount =
        document.getElementById("cancelledCount");

    const totalCount =
        document.getElementById("totalCount");

    const nextAppointmentText =
        document.getElementById("nextAppointmentText");

    const notificationBtn =
        document.getElementById("notificationBtn");

    const notificationPanel =
        document.getElementById("notificationPanel");

    const notificationList =
        document.getElementById("notificationList");

    const notificationBadge =
        document.getElementById("notificationBadge");

    const notificationSummary =
        document.getElementById("notificationSummary");

    const markNotificationsRead =
        document.getElementById("markNotificationsRead");

    const bookAppointmentBtn =
        document.getElementById("bookAppointmentBtn");

    const quickBook =
        document.getElementById("quickBook");

    const quickHistory =
        document.getElementById("quickHistory");

    const quickVet =
        document.getElementById("quickVet");

    const quickReminder =
        document.getElementById("quickReminder");


    /* =====================================================
       DATE FORMAT
    ===================================================== */

    function formatDate(dateString) {

        const date =
            new Date(dateString + "T00:00:00");

        return date.toLocaleDateString(
            "en-GB",
            {
                day: "2-digit",
                month: "short",
                year: "numeric"
            }
        );

    }


    /* =====================================================
       RENDER STATS
    ===================================================== */

    function renderStats() {

        const upcoming =
            appointments.filter(
                item => item.status === "upcoming"
            );

        const completed =
            appointments.filter(
                item => item.status === "completed"
            );

        const cancelled =
            appointments.filter(
                item => item.status === "cancelled"
            );

        upcomingCount.textContent = upcoming.length;

        completedCount.textContent =
            completed.length;

        cancelledCount.textContent =
            cancelled.length;

        totalCount.textContent =
            appointments.length;


        const sortedUpcoming =
            [...upcoming].sort(
                (a, b) =>
                    new Date(a.date) -
                    new Date(b.date)
            );


        if (sortedUpcoming.length) {

            nextAppointmentText.textContent =
                `Next: ${formatDate(sortedUpcoming[0].date)}`;

        } else {

            nextAppointmentText.textContent =
                "No upcoming visits";

        }

    }


    /* =====================================================
       UPCOMING APPOINTMENTS
    ===================================================== */

    function renderUpcoming(list = appointments) {

        const upcoming =
            list.filter(
                item => item.status === "upcoming"
            );

        upcomingList.innerHTML = "";


        if (!upcoming.length) {

            upcomingList.innerHTML = `
                <div class="empty-state">
                    <i class="fa-regular fa-calendar-xmark"></i>
                    <br><br>
                    No upcoming appointments found.
                </div>
            `;

            return;
        }


        upcoming.forEach(item => {

            const appointment =
                document.createElement("div");

            appointment.className =
                "appointment-item";

            appointment.dataset.id =
                item.id;


            appointment.innerHTML = `

                <div class="pet-photo">

                    <img
                        src="${item.image}"
                        alt="${item.pet}"
                    >

                </div>


                <div class="appointment-info">

                    <h3>${item.pet}</h3>

                    <div class="appointment-type">

                        <i class="fa-solid fa-stethoscope"></i>

                        ${item.type}

                    </div>


                    <div class="appointment-details">

                        <span>
                            <i class="fa-solid fa-user-doctor"></i>
                            ${item.doctor}
                        </span>

                        <span>
                            <i class="fa-regular fa-calendar"></i>
                            ${formatDate(item.date)} • ${item.time}
                        </span>

                        <span>
                            <i class="fa-solid fa-location-dot"></i>
                            ${item.clinic}
                        </span>

                    </div>

                </div>


                <div class="status-column">

                    <span class="status-badge">
                        Upcoming
                    </span>


                    <div class="appointment-actions">

                        <button
                            class="reschedule-btn"
                            data-action="reschedule"
                            data-id="${item.id}"
                        >
                            Reschedule
                        </button>

                        <button
                            class="more-btn"
                            data-action="cancel"
                            data-id="${item.id}"
                            title="Cancel appointment"
                        >
                            <i class="fa-solid fa-xmark"></i>
                        </button>

                    </div>

                </div>

            `;


            upcomingList.appendChild(appointment);

        });

    }


    /* =====================================================
       HISTORY
    ===================================================== */

    function renderHistory(list = appointments) {

        const history =
            list.filter(
                item =>
                    item.status === "completed" ||
                    item.status === "cancelled"
            );


        historyList.innerHTML = "";


        if (!history.length) {

            historyList.innerHTML = `
                <div class="empty-state">
                    No appointment history found.
                </div>
            `;

            return;
        }


        history.forEach(item => {

            const historyItem =
                document.createElement("div");

            historyItem.className =
                "history-item";


            const statusClass =
                item.status === "completed"
                    ? "completed"
                    : "cancelled";


            historyItem.innerHTML = `

                <div class="history-photo">

                    <img
                        src="${item.image}"
                        alt="${item.pet}"
                    >

                </div>


                <div class="history-info">

                    <strong>
                        ${item.pet}
                    </strong>

                    <span>
                        ${item.type} •
                        ${formatDate(item.date)}
                    </span>

                </div>


                <span class="history-status ${statusClass}">
                    ${item.status}
                </span>


                <button
                    class="history-view-btn"
                    data-id="${item.id}"
                    type="button"
                >
                    View Details
                </button>

            `;


            historyList.appendChild(historyItem);

        });

    }


    /* =====================================================
       SEARCH
    ===================================================== */

    searchInput.addEventListener(
        "input",
        () => {

            const query =
                searchInput.value
                    .trim()
                    .toLowerCase();


            const filtered =
                appointments.filter(item =>

                    item.pet.toLowerCase().includes(query) ||

                    item.type.toLowerCase().includes(query) ||

                    item.doctor.toLowerCase().includes(query) ||

                    item.clinic.toLowerCase().includes(query)

                );


            renderUpcoming(filtered);

            renderHistory(filtered);

        }
    );


    /* =====================================================
       RESCHEDULE
    ===================================================== */

    upcomingList.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest("button");

            if (!button) return;


            const id =
                String(button.dataset.id);

            const appointment =
                appointments.find(
                    item => item.id === id
                );

            if (!appointment) return;

if (
    button.dataset.action ===
    "reschedule"
) {
    openRescheduleModal(appointment);
}


            if (
                button.dataset.action ===
                "cancel"
            ) {

                const confirmCancel =
                    confirm(
                        `Cancel ${appointment.pet}'s appointment?`
                    );


                if (!confirmCancel) return;


                FamiPetAPI.del(
                    `/appointments/${id}`
                )
                .then(() => {

                    addNotification(
                        "Appointment cancelled",
                        `${appointment.pet}'s appointment has been cancelled.`
                    );

                    return loadAppointments();

                })
                .catch(error => {

                    alert(
                        error.message ||
                        "Failed to cancel appointment."
                    );

                });

            }

        }
    );


    /* =====================================================
       HISTORY DETAILS
    ===================================================== */

    historyList.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".history-view-btn"
                );

            if (!button) return;


            const appointment =
                appointments.find(
                    item =>
                        item.id ===
                        String(button.dataset.id)
                );


            if (!appointment) return;


            alert(
                `${appointment.pet}\n\n` +
                `${appointment.type}\n` +
                `${appointment.doctor}\n` +
                `${formatDate(appointment.date)} • ${appointment.time}\n` +
                `${appointment.clinic}\n\n` +
                `Status: ${appointment.status}`
            );

        }
    );


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    function renderNotifications() {

        notificationList.innerHTML = "";


        const unread =
            notifications.filter(
                item => !item.read
            );


        notificationBadge.textContent =
            unread.length;


        notificationBadge.style.display =
            unread.length
                ? "flex"
                : "none";


        notificationSummary.textContent =
            `${unread.length} unread`;


        if (!notifications.length) {

            notificationList.innerHTML = `
                <div class="notification-empty">
                    You're all caught up! 🎉
                </div>
            `;

            return;
        }


        notifications.forEach(item => {

            const notification =
                document.createElement("div");

            notification.className =
                `notification-item ${
                    item.read ? "read" : ""
                }`;


            notification.innerHTML = `

                <span class="notification-dot"></span>

                <div>

                    <strong>
                        ${item.title}
                    </strong>

                    <p>
                        ${item.message}
                    </p>

                </div>

            `;


            notificationList.appendChild(
                notification
            );

        });

    }


    function addNotification(title, message) {

        notifications.unshift({

            id: Date.now(),

            title: title,

            message: message,

            read: false

        });


        renderNotifications();

    }


    notificationBtn.addEventListener(
        "click",
        event => {

            event.stopPropagation();

            const open =
                notificationPanel.classList.toggle(
                    "open"
                );


            notificationBtn.setAttribute(
                "aria-expanded",
                open
            );

        }
    );


    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(
                    ".notification-wrapper"
                )
            ) {

                notificationPanel.classList.remove(
                    "open"
                );

            }

        }
    );


    markNotificationsRead.addEventListener(
        "click",
        () => {

            notifications.forEach(
                item => {
                    item.read = true;
                }
            );


            renderNotifications();

        }
    );


    /* =====================================================
       BOOK APPOINTMENT MODAL
    ===================================================== */

    function openBookingModal() {

        if (
            document.getElementById(
                "appointmentModal"
            )
        ) return;


        const modal =
            document.createElement("div");

        modal.className =
            "appointment-modal";

        modal.id =
            "appointmentModal";


        modal.innerHTML = `

            <div class="modal-box">

                <div class="modal-header">

                    <h2>
                        Book New Appointment
                    </h2>

                    <button
                        class="close-modal"
                        id="closeModal"
                        type="button"
                    >
                        <i class="fa-solid fa-xmark"></i>
                    </button>

                </div>


                <div class="form-group">

                    <label>
                        Select Pet
                    </label>

                    <select id="modalPet">

                        <option value="">
                            Select a pet
                        </option>

                        ${myPets.map(
                            pet => `
                                <option
                                    value="${pet._id}"
                                >
                                    ${pet.name}
                                </option>
                            `
                        ).join("")}

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Appointment Type
                    </label>

                    <select id="modalType">

                        <option>
                            General Checkup
                        </option>

                        <option>
                            Vaccination
                        </option>

                        <option>
                            Dental Cleaning
                        </option>

                        <option>
                            Grooming
                        </option>

                        <option>
                            Follow-up
                        </option>

                    </select>

                </div>


                <div class="form-group">

                    <label>
                        Date
                    </label>

                    <input
                        type="date"
                        id="modalDate"
                    >

                </div>


                <div class="form-group">

                    <label>
                        Time
                    </label>

                    <input
                        type="time"
                        id="modalTime"
                    >

                </div>


                <div class="form-group">

                    <label>
                        Veterinary Clinic
                    </label>

                    <select id="modalClinic">

                        <option value="">
                            Select a veterinarian
                        </option>

                        ${vets.map(
                            vet => `
                                <option
                                    value="${vet._id}"
                                >
                                    ${vet.name}
                                    ${vet.clinic
                                        ? ` - ${vet.clinic}`
                                        : ""}
                                </option>
                            `
                        ).join("")}

                    </select>

                </div>


                <div class="modal-actions">

                    <button
                        class="cancel-modal-btn"
                        id="cancelModal"
                        type="button"
                    >
                        Cancel
                    </button>

                    <button
                        class="save-appointment-btn"
                        id="saveAppointment"
                        type="button"
                    >
                        Book Appointment
                    </button>

                </div>

            </div>

        `;


        document.body.appendChild(modal);


        requestAnimationFrame(() => {
            modal.classList.add("open");
        });


        document
            .getElementById("closeModal")
            .addEventListener(
                "click",
                closeBookingModal
            );


        document
            .getElementById("cancelModal")
            .addEventListener(
                "click",
                closeBookingModal
            );


        document
            .getElementById("saveAppointment")
            .addEventListener(
                "click",
                saveNewAppointment
            );

    }


    function closeBookingModal() {

        const modal =
            document.getElementById(
                "appointmentModal"
            );


        if (!modal) return;


        modal.classList.remove("open");


        setTimeout(() => {

            modal.remove();

        }, 200);

    }


    function saveNewAppointment() {

        const pet =
            document.getElementById(
                "modalPet"
            ).value;


        const type =
            document.getElementById(
                "modalType"
            ).value;


        const date =
            document.getElementById(
                "modalDate"
            ).value;


        const time =
            document.getElementById(
                "modalTime"
            ).value;


        const vet =
            document.getElementById(
                "modalClinic"
            ).value;


        if (!date || !time) {

            alert(
                "Please select a date and time."
            );

            return;

        }


        if (!pet) {

            alert(
                "Please select a pet."
            );

            return;

        }


        if (!vet) {

            alert(
                "Please select a veterinarian."
            );

            return;

        }


        const payload = {

            pet: pet,

            veterinarian: vet,

            type:
                mapTypeToBackend(
                    type
                ),

            date: date,

            time: time,

            symptoms: "",

            notes: ""

        };


        FamiPetAPI.post(
            "/appointments",
            payload
        )
        .then(() => {

            addNotification(
                "New appointment booked",
                `${type} is scheduled for ${formatDate(date)}.`
            );

            closeBookingModal();

            return loadAppointments();

        })
        .then(() => {

            alert(
                "Appointment booked successfully!"
            );

        })
        .catch(error => {

            alert(
                error.message ||
                "Failed to book appointment."
            );

        });

    }


    function convertTime(time) {

        const [hour, minute] =
            time.split(":");

        let h =
            parseInt(hour, 10);

        const suffix =
            h >= 12
                ? "PM"
                : "AM";

        h =
            h % 12 || 12;

        return `${h}:${minute} ${suffix}`;

    }


    bookAppointmentBtn.addEventListener(
        "click",
        openBookingModal
    );


    quickBook.addEventListener(
        "click",
        openBookingModal
    );

    /* =====================================================
   RESCHEDULE MODAL
===================================================== */

function openRescheduleModal(appointment) {

    const existingModal =
        document.getElementById("rescheduleModal");

    if (existingModal) {
        existingModal.remove();
    }

    const modal =
        document.createElement("div");

    modal.className = "appointment-modal";
    modal.id = "rescheduleModal";

    modal.innerHTML = `

        <div class="modal-box reschedule-box">

            <div class="modal-header">

                <div>
                    <span class="section-label">
                        RESCHEDULE
                    </span>

                    <h2>
                        Reschedule Appointment
                    </h2>
                </div>

                <button
                    class="close-modal"
                    id="closeReschedule"
                    type="button"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>

            </div>


            <div class="reschedule-pet-info">

                <div class="reschedule-icon">
                    <i class="fa-regular fa-calendar"></i>
                </div>

                <div>
                    <strong>${appointment.pet}</strong>

                    <span>
                        ${appointment.type}
                    </span>
                </div>

            </div>


            <div class="form-group">

                <label for="rescheduleDate">
                    Select New Date
                </label>

                <input
                    type="date"
                    id="rescheduleDate"
                    value="${appointment.date}"
                >

            </div>


            <div class="form-group">

                <label for="rescheduleTime">
                    Select New Time
                </label>

                <input
                    type="time"
                    id="rescheduleTime"
                >

            </div>


            <div class="modal-actions">

                <button
                    class="cancel-modal-btn"
                    id="cancelReschedule"
                    type="button"
                >
                    Cancel
                </button>

                <button
                    class="save-appointment-btn"
                    id="saveReschedule"
                    type="button"
                >
                    <i class="fa-solid fa-calendar-check"></i>
                    Save Changes
                </button>

            </div>

        </div>

    `;


    document.body.appendChild(modal);


    requestAnimationFrame(() => {
        modal.classList.add("open");
    });


    document
        .getElementById("closeReschedule")
        .addEventListener(
            "click",
            closeRescheduleModal
        );


    document
        .getElementById("cancelReschedule")
        .addEventListener(
            "click",
            closeRescheduleModal
        );


    document
        .getElementById("saveReschedule")
        .addEventListener(
            "click",
            () => {

                const newDate =
                    document.getElementById(
                        "rescheduleDate"
                    ).value;


                const newTime =
                    document.getElementById(
                        "rescheduleTime"
                    ).value;


                if (!newDate) {

                    showAppointmentMessage(
                        "Please select a new date."
                    );

                    return;
                }


                const newTimeValue =
                    newTime || "";


                FamiPetAPI.put(
                    `/appointments/${appointment.id}`,
                    {
                        date: newDate,
                        time: newTimeValue
                    }
                )
                .then(() => {

                    addNotification(
                        "Appointment rescheduled",
                        `${appointment.pet}'s appointment was moved to ${formatDate(newDate)}.`
                    );

                    closeRescheduleModal();

                    return loadAppointments();

                })
                .then(() => {

                    showAppointmentMessage(
                        "Appointment rescheduled successfully!"
                    );

                })
                .catch(error => {

                    alert(
                        error.message ||
                        "Failed to reschedule appointment."
                    );

                });

            }
        );

}


/* =====================================================
   CLOSE RESCHEDULE MODAL
===================================================== */

function closeRescheduleModal() {

    const modal =
        document.getElementById(
            "rescheduleModal"
        );


    if (!modal) return;


    modal.classList.remove("open");


    setTimeout(() => {

        modal.remove();

    }, 200);

}


/* =====================================================
   CUSTOM MESSAGE
===================================================== */

function showAppointmentMessage(message) {

    const existing =
        document.getElementById(
            "appointmentMessage"
        );

    if (existing) {
        existing.remove();
    }


    const messageBox =
        document.createElement("div");

    messageBox.id =
        "appointmentMessage";

    messageBox.className =
        "appointment-message";

    messageBox.innerHTML = `

        <div class="message-icon">
            <i class="fa-solid fa-check"></i>
        </div>

        <span>${message}</span>

    `;


    document.body.appendChild(
        messageBox
    );


    requestAnimationFrame(() => {

        messageBox.classList.add("show");

    });


    setTimeout(() => {

        messageBox.classList.remove(
            "show"
        );


        setTimeout(() => {

            messageBox.remove();

        }, 250);

    }, 2500);

}

    /* =====================================================
       QUICK ACTIONS
    ===================================================== */

    quickHistory.addEventListener(
        "click",
        () => {

            document
                .querySelector(".history-card")
                .scrollIntoView({
                    behavior: "smooth"
                });

        }
    );


    quickVet.addEventListener(
        "click",
        () => {

            alert(
                "Vet finder will be available soon."
            );

        }
    );


    quickReminder.addEventListener(
        "click",
        () => {

            addNotification(
                "Reminder set",
                "We'll remind you before your next appointment."
            );


            alert(
                "Reminder set successfully!"
            );

        }
    );


    /* =====================================================
       VIEW ALL
    ===================================================== */

    document
        .getElementById("viewAllUpcoming")
        .addEventListener(
            "click",
            () => {

                searchInput.value = "";

                renderUpcoming(
                    appointments
                );

            }
        );


    document
        .getElementById("viewAllHistory")
        .addEventListener(
            "click",
            () => {

                searchInput.value = "";

                renderHistory(
                    appointments
                );

            }
        );


    /* =====================================================
       CALENDAR
    ===================================================== */

    let calendarDate =
        new Date(2026, 7, 1);


    const calendarGrid =
        document.getElementById(
            "calendarGrid"
        );

    const calendarMonth =
        document.getElementById(
            "calendarMonth"
        );


    function renderCalendar() {

        const year =
            calendarDate.getFullYear();

        const month =
            calendarDate.getMonth();


        calendarMonth.textContent =
            new Date(
                year,
                month,
                1
            ).toLocaleDateString(
                "en-US",
                {
                    month: "long",
                    year: "numeric"
                }
            );


        calendarGrid.innerHTML = "";


        const firstDay =
            new Date(
                year,
                month,
                1
            ).getDay();


        const daysInMonth =
            new Date(
                year,
                month + 1,
                0
            ).getDate();


        const previousMonthDays =
            new Date(
                year,
                month,
                0
            ).getDate();


        for (
            let i = firstDay - 1;
            i >= 0;
            i--
        ) {

            const day =
                document.createElement("div");

            day.className =
                "calendar-day other-month";

            day.textContent =
                previousMonthDays - i;

            calendarGrid.appendChild(day);

        }


        for (
            let dayNumber = 1;
            dayNumber <= daysInMonth;
            dayNumber++
        ) {

            const day =
                document.createElement("div");

            day.className =
                "calendar-day";

            day.textContent =
                dayNumber;


            const currentDate =
                `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNumber).padStart(2, "0")}`;


            const appointmentsOnDay =
                appointments.filter(
                    item =>
                        item.date === currentDate
                );


            if (
                appointmentsOnDay.length > 0
            ) {

                day.classList.add(
                    "has-blue"
                );

                day.title =
                    appointmentsOnDay
                        .map(
                            item =>
                                `${item.pet} - ${item.type} - ${item.time}`
                        )
                        .join("\n");

            }


            day.addEventListener(
                "click",
                () => {

                    if (
                        appointmentsOnDay.length
                    ) {

                        const details =
                            appointmentsOnDay
                                .map(
                                    item =>
                                        `${item.pet} - ${item.type}`
                                )
                                .join("\n");


                        alert(
                            `${formatDate(currentDate)}\n\n${details}`
                        );

                    }

                }
            );


            calendarGrid.appendChild(day);

        }


        const totalCells =
            firstDay + daysInMonth;


        const remainingCells =
            totalCells % 7 === 0
                ? 0
                : 7 - (totalCells % 7);


        for (
            let i = 1;
            i <= remainingCells;
            i++
        ) {

            const day =
                document.createElement("div");

            day.className =
                "calendar-day other-month";

            day.textContent = i;

            calendarGrid.appendChild(day);

        }

    }


    document
        .getElementById("prevMonth")
        .addEventListener(
            "click",
            () => {

                calendarDate.setMonth(
                    calendarDate.getMonth() - 1
                );

                renderCalendar();

            }
        );


    document
        .getElementById("nextMonth")
        .addEventListener(
            "click",
            () => {

                calendarDate.setMonth(
                    calendarDate.getMonth() + 1
                );

                renderCalendar();

            }
        );


    /* =====================================================
       RENDER EVERYTHING
    ===================================================== */

    function renderAll() {

        renderStats();

        renderUpcoming();

        renderHistory();

        renderNotifications();

        renderCalendar();

    }


    loadPetsAndVets();

    loadAppointments();

});