/* =========================================================
   Famipet - REMINDERS PAGE
   Complete Reminder Functionality
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       REMINDER DATA
    ===================================================== */

    let reminders = [];

    let pets = [];


    /* =====================================================
       LOAD PETS
    ===================================================== */

    async function loadPets() {

        try {

            const data =
                await FamiPetAPI.get(
                    "/pets/my"
                );

            pets =
                data.pets || [];

        } catch (error) {

            pets = [];

        }

    }


    /* =====================================================
       REMINDER TYPE MAPPING (backend <-> UI display)
    ===================================================== */

    function mapTypeToBackend(type) {

        switch (type) {

            case "Vaccination":
                return "vaccination";

            case "Deworming":
                return "medicine";

            case "Flea Treatment":
                return "medicine";

            case "Grooming":
                return "grooming";

            case "General Checkup":
            default:
                return "custom";

        }

    }


    function mapTypeFromBackend(type) {

        switch (type) {

            case "vaccination":
                return "Vaccination";

            case "medicine":
                return "Deworming";

            case "grooming":
                return "Grooming";

            case "custom":
            case "feeding":
            case "appointment":
            case "exercise":
            default:
                return "General Checkup";

        }

    }


    /* =====================================================
       BACKEND TIME FORMAT
    ===================================================== */

    function formatBackendTime(time) {

        if (!time) {
            return "";
        }

        const parts =
            String(time).split(":");

        if (parts.length < 2) {
            return String(time);
        }

        let hour =
            Number(parts[0]);

        const minutes =
            parts[1].replace(
                " ",
                ""
            );

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
       NORMALIZE BACKEND REMINDER -> UI SHAPE
    ===================================================== */

    function normalizeReminder(raw) {

        const displayType =
            mapTypeFromBackend(
                raw.type
            );

        return {

            id:
                raw._id,

            pet:
                raw.pet
                    ? raw.pet.name
                    : "No pet",

            type:
                displayType,

            date:
                String(raw.date)
                    .slice(0, 10),

            time:
                formatBackendTime(
                    raw.time
                ),

            color:
                getReminderColor(
                    displayType
                ),

            status:
                raw.isCompleted
                    ? "Completed"
                    : "Upcoming"

        };

    }


    /* =====================================================
       LOAD REMINDERS
    ===================================================== */

    async function loadReminders() {

        try {

            const data =
                await FamiPetAPI.get(
                    "/reminders"
                );

            reminders =
                (data.reminders || [])
                    .map(
                        normalizeReminder
                    );

        } catch (error) {

            reminders = [];

        }

        renderCurrentReminders();

        updateStats();

        renderCalendar();

    }


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const reminderList =
        document.getElementById("reminderList");

    const searchInput =
        document.getElementById("reminderSearch");

    const addReminderBtn =
        document.getElementById("addReminderBtn");

    const upcomingCount =
        document.getElementById("upcomingCount");

    const totalCount =
        document.getElementById("totalCount");

    const calendarGrid =
        document.getElementById("calendarGrid");

    const calendarTitle =
        document.getElementById("calendarTitle");

    const previousMonth =
        document.getElementById("previousMonth");

    const nextMonth =
        document.getElementById("nextMonth");

    const viewAllBtn =
        document.getElementById("viewAllBtn");

    const viewAllReminders =
        document.getElementById("viewAllReminders");


    /* =====================================================
       VIEW STATE
    ===================================================== */

    let showingAllReminders = false;


    /* =====================================================
       PET IMAGES
    ===================================================== */

    const petImages = {

        Bruno:
            "../assets/images/dashboard/golden-retriever.png",

        Luna:
            "../assets/images/my-pet/cat.png",

        Coco:
            "../assets/images/my-pet/dog.png",

        Milo:
            "../assets/images/my-pet/cat.png"

    };


    /* =====================================================
       REMINDER ICONS
    ===================================================== */

    const typeIcons = {

        "Vaccination":
            "syringe",

        "Deworming":
            "pill",

        "Flea Treatment":
            "bug",

        "General Checkup":
            "stethoscope",

        "Grooming":
            "scissors"

    };


    /* =====================================================
       REMINDER TYPE CSS CLASS
    ===================================================== */

    function getTypeClass(type) {

        switch (type) {

            case "Vaccination":
                return "vaccination";

            case "Deworming":
                return "deworming";

            case "Flea Treatment":
                return "flea";

            case "General Checkup":
                return "checkup";

            case "Grooming":
                return "grooming";

            default:
                return "vaccination";

        }

    }


    /* =====================================================
       REMINDER COLOR
    ===================================================== */

    function getReminderColor(type) {

        switch (type) {

            case "Vaccination":
                return "green";

            case "Deworming":
                return "pink";

            case "Flea Treatment":
                return "orange";

            case "General Checkup":
                return "purple";

            case "Grooming":
                return "blue";

            default:
                return "green";

        }

    }


    /* =====================================================
       RENDER REMINDERS
    ===================================================== */

    function renderReminders(list = reminders) {

        if (!reminderList) {
            return;
        }


        /* EMPTY STATE */

        if (list.length === 0) {

            reminderList.innerHTML = `

                <div class="empty-reminders">

                    <div class="empty-reminder-icon">

                        <i data-lucide="bell-off"></i>

                    </div>

                    <h3>
                        No reminders found
                    </h3>

                    <p>
                        Try another search or add a new reminder.
                    </p>

                </div>

            `;

            refreshIcons();

            return;

        }


        /* CREATE REMINDER ITEMS */

        reminderList.innerHTML = list.map(
            reminder => {

                const icon =
                    typeIcons[reminder.type] ||
                    "bell";


                const typeClass =
                    getTypeClass(
                        reminder.type
                    );


                const image =
                    petImages[reminder.pet] ||
                    "../assets/images/my-pet/cat.png";


                return `

                    <div
                        class="reminder-item"
                        data-id="${reminder.id}"
                    >

                        <!-- =================================
                             TYPE ICON CIRCLE
                        ================================== -->

                        <div
                            class="reminder-type ${typeClass}"
                        >

                            <i
                                data-lucide="${icon}"
                            ></i>

                        </div>


                        <!-- =================================
                             PET IMAGE
                        ================================== -->

                        <div
                            class="reminder-pet-image"
                        >

                            <img
                                src="${image}"
                                alt="${escapeHTML(
                                    reminder.pet
                                )}"
                                onerror="
                                    this.style.display='none'
                                "
                            >

                        </div>


                        <!-- =================================
                             INFORMATION
                        ================================== -->

                        <div
                            class="reminder-info"
                        >

                            <h3>
                                ${escapeHTML(
                                    reminder.pet
                                )}
                            </h3>


                            <strong
                                class="${typeClass}-text"
                            >
                                ${escapeHTML(
                                    reminder.type
                                )}
                            </strong>


                            <div
                                class="reminder-meta"
                            >

                                <span>

                                    <i
                                        data-lucide="calendar-days"
                                    ></i>

                                    ${formatDate(
                                        reminder.date
                                    )}

                                </span>


                                <span>

                                    <i
                                        data-lucide="clock"
                                    ></i>

                                    ${escapeHTML(
                                        reminder.time
                                    )}

                                </span>

                            </div>

                        </div>


                        <!-- =================================
                             RIGHT SIDE
                        ================================== -->

                        <div
                            class="reminder-actions"
                        >

                            <span
                                class="
                                    days-badge
                                    ${reminder.color}-badge
                                "
                            >

                                ${getDaysText(
                                    reminder.date
                                )}

                            </span>


                            <button
                                class="more-btn"
                                type="button"
                                data-id="${reminder.id}"
                                aria-label="Reminder options"
                            >

                                <i
                                    data-lucide="ellipsis"
                                ></i>

                            </button>

                        </div>

                    </div>

                `;

            }
        ).join("");


        refreshIcons();

        bindMoreButtons();

    }


    /* =====================================================
       FORMAT DATE
    ===================================================== */

    function formatDate(dateString) {

        const date =
            new Date(
                dateString + "T00:00:00"
            );


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
       DAYS TEXT
    ===================================================== */

    function getDaysText(dateString) {

        /*
         * Keep the original demo labels
         * from your design.
         */

        const demoDates = {

            "2025-05-27":
                "In 2 days",

            "2025-05-29":
                "In 4 days",

            "2025-06-02":
                "In 8 days",

            "2025-06-05":
                "In 11 days",

            "2025-06-10":
                "In 16 days"

        };


        if (demoDates[dateString]) {

            return demoDates[dateString];

        }


        /* Real calculation for newly added reminders */

        const today =
            new Date();

        const target =
            new Date(
                dateString + "T00:00:00"
            );


        today.setHours(
            0, 0, 0, 0
        );

        target.setHours(
            0, 0, 0, 0
        );


        const difference =
            Math.ceil(
                (
                    target - today
                ) /
                (
                    1000 *
                    60 *
                    60 *
                    24
                )
            );


        if (difference === 0) {

            return "Today";

        }


        if (difference === 1) {

            return "Tomorrow";

        }


        if (difference > 1) {

            return `In ${difference} days`;

        }


        if (difference === -1) {

            return "Yesterday";

        }


        return `${Math.abs(
            difference
        )} days ago`;

    }


    /* =====================================================
       THREE DOT BUTTONS
    ===================================================== */

    function bindMoreButtons() {

        document
            .querySelectorAll(".more-btn")
            .forEach(button => {

                button.addEventListener(
                    "click",
                    event => {

                        event.stopPropagation();

                        closeReminderMenus();


                        const id =
                            String(
                                button.dataset.id
                            );


                        showReminderMenu(
                            button,
                            id
                        );

                    }
                );

            });

    }


    /* =====================================================
       REMINDER MENU
    ===================================================== */

    function showReminderMenu(
        button,
        id
    ) {

        const reminder =
            reminders.find(
                item =>
                    item.id === id
            );


        if (!reminder) {
            return;
        }


        const menu =
            document.createElement(
                "div"
            );


        menu.className =
            "reminder-menu";


        menu.innerHTML = `

            <button
                type="button"
                data-action="complete"
            >

                <i
                    data-lucide="circle-check"
                ></i>

                Mark Completed

            </button>


            <button
                type="button"
                data-action="edit"
            >

                <i
                    data-lucide="pencil"
                ></i>

                Edit Reminder

            </button>


            <button
                type="button"
                data-action="delete"
                class="delete-action"
            >

                <i
                    data-lucide="trash-2"
                ></i>

                Delete Reminder

            </button>

        `;


        document.body.appendChild(
            menu
        );


        const rect =
            button.getBoundingClientRect();


        menu.style.position =
            "fixed";


        menu.style.top =
            `${rect.bottom + 7}px`;


        menu.style.left =
            `${Math.max(
                10,
                rect.right - 180
            )}px`;


        refreshIcons();


        menu
            .querySelectorAll("button")
            .forEach(actionButton => {

                actionButton.addEventListener(
                    "click",
                    () => {

                        const action =
                            actionButton.dataset.action;


                        if (
                            action === "complete"
                        ) {

                            completeReminder(
                                id
                            );

                        }


                        else if (
                            action === "edit"
                        ) {

                            openReminderModal(
                                reminder
                            );

                        }


                        else if (
                            action === "delete"
                        ) {

                            deleteReminder(
                                id
                            );

                        }


                        menu.remove();

                    }
                );

            });

    }


    /* =====================================================
       CLOSE MENUS
    ===================================================== */

    function closeReminderMenus() {

        document
            .querySelectorAll(
                ".reminder-menu"
            )
            .forEach(menu =>
                menu.remove()
            );

    }


    /* =====================================================
       COMPLETE REMINDER
    ===================================================== */

    function completeReminder(id) {

        const reminder =
            reminders.find(
                item =>
                    item.id === id
            );


        if (!reminder) {
            return;
        }


        FamiPetAPI.put(
            `/reminders/${id}/complete`
        )
        .then(() => {

            reminder.status =
                "Completed";

            renderCurrentReminders();

            updateStats();

        })
        .catch(error => {

            alert(
                error.message ||
                "Failed to complete reminder."
            );

        });

    }


    /* =====================================================
       DELETE REMINDER
    ===================================================== */

    function deleteReminder(id) {

        const reminder =
            reminders.find(
                item =>
                    item.id === id
            );


        if (!reminder) {
            return;
        }


        const confirmed =
            confirm(
                `Delete ${reminder.type} reminder for ${reminder.pet}?`
            );


        if (!confirmed) {
            return;
        }


        FamiPetAPI.del(
            `/reminders/${id}`
        )
        .then(() => {

            reminders =
                reminders.filter(
                    item =>
                        item.id !== id
                );

            renderCurrentReminders();

            updateStats();

            renderCalendar();

        })
        .catch(error => {

            alert(
                error.message ||
                "Failed to delete reminder."
            );

        });

    }


    /* =====================================================
       ADD / EDIT MODAL
    ===================================================== */

    function openReminderModal(
        editingReminder = null
    ) {

        closeReminderMenus();


        const editing =
            Boolean(
                editingReminder
            );


        const overlay =
            document.createElement(
                "div"
            );


        overlay.className =
            "reminder-modal-overlay";


        overlay.innerHTML = `

            <div
                class="reminder-modal"
                role="dialog"
                aria-modal="true"
            >

                <div
                    class="reminder-modal-header"
                >

                    <div>

                        <span
                            class="modal-eyebrow"
                        >

                            ${editing
                                ? "UPDATE REMINDER"
                                : "NEW REMINDER"}

                        </span>


                        <h2>

                            ${editing
                                ? "Edit Reminder"
                                : "Add Reminder"}

                        </h2>

                    </div>


                    <button
                        class="modal-close"
                        type="button"
                        aria-label="Close"
                    >

                        <i
                            data-lucide="x"
                        ></i>

                    </button>

                </div>


                <form
                    id="reminderForm"
                    class="reminder-form"
                >

                    <!-- PET -->

                    <div
                        class="form-group"
                    >

                        <label>
                            Pet Name
                        </label>

                        <input
                            type="text"
                            id="reminderPet"
                            placeholder="e.g. Bruno"
                            list="reminderPetOptions"
                            value="${editing
                                ? escapeHTML(
                                    editingReminder.pet
                                )
                                : ""}"
                            required
                        >


                        <datalist
                            id="reminderPetOptions"
                        >

                            ${pets.map(
                                pet => `
                                    <option
                                        value="${escapeHTML(
                                            pet.name
                                        )}"
                                    >
                                    </option>
                                `
                            ).join("")}

                        </datalist>

                    </div>


                    <!-- TYPE -->

                    <div
                        class="form-group"
                    >

                        <label>
                            Reminder Type
                        </label>

                        <select
                            id="reminderType"
                            required
                        >

                            <option value="">
                                Select reminder
                            </option>


                            <option
                                value="Vaccination"
                                ${editingReminder?.type ===
                                    "Vaccination"
                                    ? "selected"
                                    : ""}
                            >
                                Vaccination
                            </option>


                            <option
                                value="Deworming"
                                ${editingReminder?.type ===
                                    "Deworming"
                                    ? "selected"
                                    : ""}
                            >
                                Deworming
                            </option>


                            <option
                                value="Flea Treatment"
                                ${editingReminder?.type ===
                                    "Flea Treatment"
                                    ? "selected"
                                    : ""}
                            >
                                Flea Treatment
                            </option>


                            <option
                                value="General Checkup"
                                ${editingReminder?.type ===
                                    "General Checkup"
                                    ? "selected"
                                    : ""}
                            >
                                General Checkup
                            </option>


                            <option
                                value="Grooming"
                                ${editingReminder?.type ===
                                    "Grooming"
                                    ? "selected"
                                    : ""}
                            >
                                Grooming
                            </option>

                        </select>

                    </div>


                    <!-- DATE + TIME -->

                    <div
                        class="form-row"
                    >

                        <div
                            class="form-group"
                        >

                            <label>
                                Date
                            </label>

                            <input
                                type="date"
                                id="reminderDate"
                                value="${editing
                                    ? editingReminder.date
                                    : ""}"
                                required
                            >

                        </div>


                        <div
                            class="form-group"
                        >

                            <label>
                                Time
                            </label>

                            <input
                                type="time"
                                id="reminderTime"
                                value="${editing
                                    ? convertTimeToInput(
                                        editingReminder.time
                                    )
                                    : ""}"
                                required
                            >

                        </div>

                    </div>


                    <!-- BUTTONS -->

                    <div
                        class="modal-actions"
                    >

                        <button
                            type="button"
                            class="modal-cancel"
                        >
                            Cancel
                        </button>


                        <button
                            type="submit"
                            class="modal-save"
                        >

                            <i
                                data-lucide="check"
                            ></i>

                            ${editing
                                ? "Save Changes"
                                : "Add Reminder"}

                        </button>

                    </div>

                </form>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        refreshIcons();


        const form =
            overlay.querySelector(
                "#reminderForm"
            );


        const closeButton =
            overlay.querySelector(
                ".modal-close"
            );


        const cancelButton =
            overlay.querySelector(
                ".modal-cancel"
            );


        function closeModal() {

            overlay.remove();

        }


        closeButton.addEventListener(
            "click",
            closeModal
        );


        cancelButton.addEventListener(
            "click",
            closeModal
        );


        overlay.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    overlay
                ) {

                    closeModal();

                }

            }
        );


        form.addEventListener(
            "submit",
            event => {

                event.preventDefault();


                const pet =
                    document
                        .getElementById(
                            "reminderPet"
                        )
                        .value
                        .trim();


                const type =
                    document
                        .getElementById(
                            "reminderType"
                        )
                        .value;


                const date =
                    document
                        .getElementById(
                            "reminderDate"
                        )
                        .value;


                const timeValue =
                    document
                        .getElementById(
                            "reminderTime"
                        )
                        .value;


                if (
                    !pet ||
                    !type ||
                    !date ||
                    !timeValue
                ) {

                    return;

                }


                const formattedTime =
                    formatTime(
                        timeValue
                    );


                const color =
                    getReminderColor(
                        type
                    );


                const petMatch =
                    pets.find(
                        item =>
                            item.name === pet
                    );

                const backendType =
                    mapTypeToBackend(
                        type
                    );

                const payload = {

                    title: pet,

                    type: backendType,

                    date: date,

                    time: timeValue,

                    description: ""

                };

                if (petMatch) {

                    payload.pet =
                        petMatch._id;

                }


                const save =
                    editing
                        ? FamiPetAPI.put(
                            `/reminders/${editingReminder.id}`,
                            payload
                        )
                        : FamiPetAPI.post(
                            "/reminders",
                            payload
                        );


                save
                    .then(() => {

                        if (editing) {

                            editingReminder.pet =
                                pet;

                            editingReminder.type =
                                type;

                            editingReminder.date =
                                date;

                            editingReminder.time =
                                formattedTime;

                            editingReminder.color =
                                color;

                            editingReminder.status =
                                "Upcoming";

                        }

                        showingAllReminders =
                            true;

                        return loadReminders();

                    })
                    .then(() => {

                        closeModal();

                    })
                    .catch(error => {

                        alert(
                            error.message ||
                            "Failed to save reminder."
                        );

                    });

            }
        );

    }


    /* =====================================================
       ADD REMINDER BUTTON
    ===================================================== */

    if (addReminderBtn) {

        addReminderBtn.addEventListener(
            "click",
            () => {

                openReminderModal();

            }
        );

    }


    /* =====================================================
       SEARCH
    ===================================================== */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const value =
                    searchInput.value
                        .toLowerCase()
                        .trim();


                /* Empty search */

                if (!value) {

                    renderCurrentReminders();

                    return;

                }


                /* Search all reminders */

                const filtered =
                    reminders.filter(
                        reminder =>

                            reminder.pet
                                .toLowerCase()
                                .includes(
                                    value
                                )

                            ||

                            reminder.type
                                .toLowerCase()
                                .includes(
                                    value
                                )
                    );


                renderReminders(
                    filtered
                );

            }
        );

    }


    /* =====================================================
       VIEW ALL / SHOW LESS
    ===================================================== */

    function toggleViewAll() {

        showingAllReminders =
            !showingAllReminders;


        renderCurrentReminders();


        const section =
            document.querySelector(
                ".upcoming-reminders"
            );


        if (section) {

            section.scrollIntoView({
                behavior: "smooth",
                block: "start"
            });

        }

    }


    if (viewAllBtn) {

        viewAllBtn.addEventListener(
            "click",
            event => {

                event.preventDefault();

                toggleViewAll();

            }
        );

    }


    if (viewAllReminders) {

        viewAllReminders.addEventListener(
            "click",
            event => {

                event.preventDefault();

                toggleViewAll();

            }
        );

    }


    /* =====================================================
       RENDER CURRENT REMINDER VIEW
    ===================================================== */

    function renderCurrentReminders() {

        const searchValue =
            searchInput
                ? searchInput.value
                    .toLowerCase()
                    .trim()
                : "";


        let currentReminders =
            reminders;


        /* Search results always show all matches */

        if (searchValue) {

            currentReminders =
                reminders.filter(
                    reminder =>

                        reminder.pet
                            .toLowerCase()
                            .includes(
                                searchValue
                            )

                        ||

                        reminder.type
                            .toLowerCase()
                            .includes(
                                searchValue
                            )
                );

        }


        /* Normal view = first 4 */

        else if (
            !showingAllReminders
        ) {

            currentReminders =
                reminders.slice(
                    0,
                    4
                );

        }


        /* All view */

        else {

            currentReminders =
                reminders;

        }


        renderReminders(
            currentReminders
        );


        updateViewAllButtons();

    }


    /* =====================================================
       UPDATE VIEW ALL BUTTON TEXT
    ===================================================== */
function updateViewAllButtons() {

    if (viewAllBtn) {

        /*
         * Keep the top View All button
         * visible at all times.
         */

        viewAllBtn.style.display = "";

        viewAllBtn.textContent =
            showingAllReminders
                ? "Show Less"
                : "View All";
    }


    if (viewAllReminders) {

        /*
         * Keep the bottom button visible
         * only when there are more than 4 reminders.
         */

        if (reminders.length <= 4) {

            viewAllReminders.style.display = "none";

            return;

        }


        viewAllReminders.style.display = "";


        viewAllReminders.innerHTML =
            showingAllReminders
                ? `
                    Show Less
                    <i
                        class="fa-solid fa-arrow-up"
                    ></i>
                  `
                : `
                    View All Reminders
                    <i
                        class="fa-solid fa-arrow-right"
                    ></i>
                  `;
    }

}

    /* =====================================================
       CALENDAR
    ===================================================== */

    let currentCalendarDate =
        new Date(
            2025,
            4,
            1
        );


    function renderCalendar() {

        if (
            !calendarGrid ||
            !calendarTitle
        ) {

            return;

        }


        calendarGrid.innerHTML =
            "";


        const year =
            currentCalendarDate
                .getFullYear();


        const month =
            currentCalendarDate
                .getMonth();


        const monthName =
            currentCalendarDate
                .toLocaleString(
                    "default",
                    {
                        month: "long"
                    }
                );


        calendarTitle.textContent =
            `${monthName} ${year}`;


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


        /* ================================================
           PREVIOUS MONTH
        ================================================ */

        for (
            let i = firstDay - 1;
            i >= 0;
            i--
        ) {

            const day =
                document.createElement(
                    "div"
                );


            day.className =
                "calendar-day other-month";


            day.textContent =
                previousMonthDays - i;


            calendarGrid.appendChild(
                day
            );

        }


        /* ================================================
           CURRENT MONTH
        ================================================ */

        for (
            let dayNumber = 1;
            dayNumber <= daysInMonth;
            dayNumber++
        ) {

            const day =
                document.createElement(
                    "div"
                );


            day.className =
                "calendar-day";


            day.textContent =
                dayNumber;


            const monthNumber =
                String(
                    month + 1
                ).padStart(
                    2,
                    "0"
                );


            const formattedDay =
                String(
                    dayNumber
                ).padStart(
                    2,
                    "0"
                );


            const dateKey =
                `${year}-${monthNumber}-${formattedDay}`;


            const events =
                reminders.filter(
                    reminder =>
                        reminder.date ===
                        dateKey
                );


            if (
                events.length > 0
            ) {

                const color =
                    events[0].color;


                day.classList.add(
                    `event-${color}`
                );


                day.title =
                    events
                        .map(
                            event =>
                                `${event.pet} - ${event.type}`
                        )
                        .join("\n");

            }


            calendarGrid.appendChild(
                day
            );

        }


        /* ================================================
           NEXT MONTH CELLS
        ================================================ */

        const currentCells =
            calendarGrid.children.length;


        const remaining =
            42 - currentCells;


        for (
            let i = 1;
            i <= remaining;
            i++
        ) {

            const day =
                document.createElement(
                    "div"
                );


            day.className =
                "calendar-day other-month";


            day.textContent =
                i;


            calendarGrid.appendChild(
                day
            );

        }

    }


    /* =====================================================
       PREVIOUS MONTH
    ===================================================== */

    if (previousMonth) {

        previousMonth.addEventListener(
            "click",
            () => {

                currentCalendarDate.setMonth(
                    currentCalendarDate.getMonth() - 1
                );


                renderCalendar();

            }
        );

    }


    /* =====================================================
       NEXT MONTH
    ===================================================== */

    if (nextMonth) {

        nextMonth.addEventListener(
            "click",
            () => {

                currentCalendarDate.setMonth(
                    currentCalendarDate.getMonth() + 1
                );


                renderCalendar();

            }
        );

    }


    /* =====================================================
       CLOSE MENU OUTSIDE CLICK
    ===================================================== */

    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(
                    ".more-btn"
                ) &&
                !event.target.closest(
                    ".reminder-menu"
                )
            ) {

                closeReminderMenus();

            }

        }
    );


    /* =====================================================
       ESCAPE KEY
    ===================================================== */

    document.addEventListener(
        "keydown",
        event => {

            if (
                event.key ===
                "Escape"
            ) {

                closeReminderMenus();


                const modal =
                    document.querySelector(
                        ".reminder-modal-overlay"
                    );


                if (modal) {

                    modal.remove();

                }

            }

        }
    );


    /* =====================================================
       STATISTICS
    ===================================================== */

    function updateStats() {

        if (upcomingCount) {

            const upcoming =
                reminders.filter(
                    reminder =>
                        reminder.status !==
                        "Completed"
                ).length;


            upcomingCount.textContent =
                upcoming;

        }


        if (totalCount) {

            totalCount.textContent =
                reminders.length;

        }

    }


    /* =====================================================
       FORMAT TIME
    ===================================================== */

    function formatTime(time) {

        const [
            hours,
            minutes
        ] = time.split(":");


        let hour =
            Number(hours);


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
       CONVERT TIME TO INPUT
    ===================================================== */

    function convertTimeToInput(time) {

        if (!time) {
            return "";
        }


        const parts =
            time.split(" ");


        const clock =
            parts[0];


        const modifier =
            parts[1];


        let [
            hours,
            minutes
        ] =
            clock.split(":");


        hours =
            Number(hours);


        if (
            modifier === "PM" &&
            hours !== 12
        ) {

            hours += 12;

        }


        if (
            modifier === "AM" &&
            hours === 12
        ) {

            hours = 0;

        }


        return `${String(
            hours
        ).padStart(
            2,
            "0"
        )}:${minutes}`;

    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(value) {

        return String(value)

            .replace(
                /&/g,
                "&amp;"
            )

            .replace(
                /</g,
                "&lt;"
            )

            .replace(
                />/g,
                "&gt;"
            )

            .replace(
                /"/g,
                "&quot;"
            )

            .replace(
                /'/g,
                "&#039;"
            );

    }


    /* =====================================================
       LUCIDE ICONS
    ===================================================== */

    function refreshIcons() {

        if (
            window.lucide
        ) {

            lucide.createIcons();

        }

    }


    /* =====================================================
       INITIALIZE PAGE
    ===================================================== */

    loadPets();

    loadReminders();

    refreshIcons();

});