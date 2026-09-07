/* =========================================================
   Famipet LOST & FOUND
========================================================= */

document.addEventListener("DOMContentLoaded", () => {


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const petsGrid =
        document.getElementById("petsGrid");

    const noResults =
        document.getElementById("noResults");

    const searchInput =
        document.getElementById("lostFoundSearch");

    const typeFilter =
        document.getElementById("typeFilter");

    const locationFilter =
        document.getElementById("locationFilter");

    const sortFilter =
        document.getElementById("sortFilter");

    const clearFiltersBtn =
        document.getElementById("clearFiltersBtn");

    const reportLostBtn =
        document.getElementById("reportLostBtn");

    const reportFoundBtn =
        document.getElementById("reportFoundBtn");

    const notificationBtn =
        document.getElementById("notificationBtn");


    /* =====================================================
       STATE
    ===================================================== */

    let currentStatus = "all";

    let searchValue = "";

    let typeValue = "all";

    let locationValue = "all";

    let sortValue = "recent";


    /* =====================================================
       CURRENT USER
    ===================================================== */

    const famipetUser =
        (typeof FamiPetAPI !== "undefined" &&
            FamiPetAPI.getUser()) || {};

    const currentUserName =
        famipetUser.name || "Pet Parent";

    const currentUserPhone =
        famipetUser.phone || "";

    const currentUserEmail =
        famipetUser.email || "";


    /* =====================================================
       INITIALIZE LUCIDE
    ===================================================== */

    if (window.lucide) {

        lucide.createIcons();

    }


    /* =====================================================
       GET CARDS
    ===================================================== */

    function getCards() {

        return Array.from(
            document.querySelectorAll(".pet-card")
        );

    }


    /* =====================================================
       FILTER TABS
    ===================================================== */

    const filterTabs =
        document.querySelectorAll(".filter-tab");


    filterTabs.forEach(tab => {

        tab.addEventListener("click", () => {

            filterTabs.forEach(item => {

                item.classList.remove("active");

            });


            tab.classList.add("active");


            currentStatus =
                tab.dataset.status || "all";


            renderCards();

        });

    });


    /* =====================================================
       SEARCH
    ===================================================== */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            event => {

                searchValue =
                    event.target.value
                        .trim()
                        .toLowerCase();

                renderCards();

            }
        );

    }


    /* =====================================================
       TYPE
    ===================================================== */

    if (typeFilter) {

        typeFilter.addEventListener(
            "change",
            event => {

                typeValue =
                    event.target.value;

                renderCards();

            }
        );

    }


    /* =====================================================
       LOCATION
    ===================================================== */

    if (locationFilter) {

        locationFilter.addEventListener(
            "change",
            event => {

                locationValue =
                    event.target.value;

                renderCards();

            }
        );

    }


    /* =====================================================
       SORT
    ===================================================== */

    if (sortFilter) {

        sortFilter.addEventListener(
            "change",
            event => {

                sortValue =
                    event.target.value;

                renderCards();

            }
        );

    }


    /* =====================================================
       RENDER / FILTER
    ===================================================== */

    function renderCards() {

        const cards =
            getCards();


        const visibleCards = [];


        cards.forEach(card => {

            const status =
                card.dataset.status || "";

            const type =
                card.dataset.type || "";

            const location =
                card.dataset.location || "";

            const text =
                card.innerText
                    .toLowerCase();

            const name =
                card.dataset.name
                    ? card.dataset.name.toLowerCase()
                    : "";


            /* STATUS */

            const statusMatch =
                currentStatus === "all" ||
                status === currentStatus;


            /* TYPE */

            const typeMatch =
                typeValue === "all" ||
                type === typeValue;


            /* LOCATION */

            const locationMatch =
                locationValue === "all" ||
                location === locationValue;


            /* SEARCH */

            const searchMatch =
                searchValue === "" ||
                text.includes(searchValue) ||
                name.includes(searchValue);


            const shouldShow =
                statusMatch &&
                typeMatch &&
                locationMatch &&
                searchMatch;


            if (shouldShow) {

                card.style.display = "";

                visibleCards.push(card);

            } else {

                card.style.display = "none";

            }

        });


        sortCards(visibleCards);


        if (visibleCards.length === 0) {

            noResults.style.display = "block";

        } else {

            noResults.style.display = "none";

        }

    }


    /* =====================================================
       SORT CARDS
    ===================================================== */

    function sortCards(cards) {

        cards.sort((a, b) => {

            const dateA =
                new Date(
                    a.dataset.date
                );

            const dateB =
                new Date(
                    b.dataset.date
                );


            if (sortValue === "oldest") {

                return dateA - dateB;

            }


            if (sortValue === "name") {

                const nameA =
                    (
                        a.dataset.name || ""
                    ).toLowerCase();

                const nameB =
                    (
                        b.dataset.name || ""
                    ).toLowerCase();

                return nameA.localeCompare(nameB);

            }


            return dateB - dateA;

        });


        cards.forEach(card => {

            petsGrid.appendChild(card);

        });

    }


    /* =====================================================
       CLEAR FILTERS
    ===================================================== */

    if (clearFiltersBtn) {

        clearFiltersBtn.addEventListener(
            "click",
            clearFilters
        );

    }


    function clearFilters() {

        currentStatus = "all";

        searchValue = "";

        typeValue = "all";

        locationValue = "all";

        sortValue = "recent";


        if (searchInput) {

            searchInput.value = "";

        }


        if (typeFilter) {

            typeFilter.value = "all";

        }


        if (locationFilter) {

            locationFilter.value = "all";

        }


        if (sortFilter) {

            sortFilter.value = "recent";

        }


        filterTabs.forEach(tab => {

            tab.classList.toggle(
                "active",
                tab.dataset.status === "all"
            );

        });


        renderCards();

    }


    /* =====================================================
       REPORT LOST
    ===================================================== */

    if (reportLostBtn) {

        reportLostBtn.addEventListener(
            "click",
            () => {

                openReportModal("lost");

            }
        );

    }


    /* =====================================================
       REPORT FOUND
    ===================================================== */

    if (reportFoundBtn) {

        reportFoundBtn.addEventListener(
            "click",
            () => {

                openReportModal("found");

            }
        );

    }


    /* =====================================================
       REPORT MODAL
    ===================================================== */

    function openReportModal(status) {

        closeAllOverlays();


        const modal =
            document.createElement("div");


        modal.className =
            "lost-modal-overlay";


        const title =
            status === "lost"
                ? "Report a Lost Pet"
                : "Report a Found Pet";


        const subtitle =
            status === "lost"
                ? "Tell us about the pet so others can help bring them home."
                : "Tell us about the pet so we can help find their owner.";


        const icon =
            status === "lost"
                ? "fa-magnifying-glass"
                : "fa-paw";


        modal.innerHTML = `

            <div class="lost-modal">

                <button
                    class="modal-close"
                    type="button"
                    aria-label="Close"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>


                <div class="modal-icon ${status}">
                    <i class="fa-solid ${icon}"></i>
                </div>


                <h2>
                    ${title}
                </h2>


                <p class="modal-subtitle">
                    ${subtitle}
                </p>


                <form
                    class="report-form"
                    id="reportPetForm"
                >


<div class="form-group">

    <label for="reportPetPhone">
        Phone Number
    </label>

    <input
        id="reportPetPhone"
        type="tel"
        placeholder="Enter 10-digit phone number"
        pattern="[0-9]{10}"
        maxlength="10"
        required
    >

</div>


<div class="form-group">

    <label for="reportPetEmail">
        Email Address
    </label>

    <input
        id="reportPetEmail"
        type="email"
        placeholder="Enter your email address"
        required
    >

</div>


<div class="form-group">

    <label for="reportPetDescription">
        Description
    </label>

    <textarea
        id="reportPetDescription"
        rows="3"
        placeholder="Add useful details about the pet..."
    ></textarea>

</div>

                    <div class="form-row">


                        <div class="form-group">

                            <label for="reportPetType">
                                Pet Type
                            </label>

                            <select
                                id="reportPetType"
                                required
                            >

                                <option value="">
                                    Select type
                                </option>

                                <option value="dog">
                                    Dog
                                </option>

                                <option value="cat">
                                    Cat
                                </option>

                                <option value="other">
                                    Other
                                </option>

                            </select>

                        </div>


                        <div class="form-group">

                            <label for="reportPetLocation">
                                Location
                            </label>

                            <input
                                id="reportPetLocation"
                                type="text"
                                placeholder="e.g. Andheri"
                                required
                            >

                        </div>

                    </div>


                    <div class="form-row">


                        <div class="form-group">

                            <label for="reportPetGender">
                                Gender
                            </label>

                            <select
                                id="reportPetGender"
                            >

                                <option value="Unknown">
                                    Prefer not to say
                                </option>

                                <option value="Male">
                                    Male
                                </option>

                                <option value="Female">
                                    Female
                                </option>

                            </select>

                        </div>


                        <div class="form-group">

                            <label for="reportPetAge">
                                Age
                            </label>

                            <input
                                id="reportPetAge"
                                type="text"
                                placeholder="e.g. 2 Years"
                            >

                        </div>

                    </div>


                    <div class="form-group">

                        <label for="reportPetColor">
                            Colour / Appearance
                        </label>

                        <input
                            id="reportPetColor"
                            type="text"
                            placeholder="e.g. Golden, white & grey"
                        >

                    </div>


                    <div class="form-group">

                        <label for="reportPetImage">
                            Pet Image
                        </label>

                        <input
                            id="reportPetImage"
                            type="file"
                            accept="image/*"
                        >

                    </div>


                    <div class="form-group">

                        <label for="reportPetDescription">
                            Description
                        </label>

                        <textarea
                            id="reportPetDescription"
                            rows="3"
                            placeholder="Add useful details about the pet..."
                        ></textarea>

                    </div>


                    <button
                        type="submit"
                        class="submit-report-btn"
                    >

                        Submit Report

                    </button>

                </form>

            </div>

        `;


        document.body.appendChild(modal);


        requestAnimationFrame(() => {

            modal.classList.add("show");

        });


        /* CLOSE */

        modal
            .querySelector(".modal-close")
            .addEventListener(
                "click",
                () => closeModal(modal)
            );


        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    closeModal(modal);

                }

            }
        );


        /* FORM */

        modal
            .querySelector("#reportPetForm")
            .addEventListener(
                "submit",
                async event => {

                    event.preventDefault();


                    await submitReport(
                        modal,
                        status
                    );

                }
            );

    }


    /* =====================================================
       SUBMIT REPORT
    ===================================================== */

    async function submitReport(
        modal,
        status
    ) {

        const nameInput =
            modal.querySelector(
                "#reportPetName"
            );


        const name =
            nameInput
                ? nameInput.value.trim()
                : "";


        const type =
            modal
                .querySelector("#reportPetType")
                .value;


        const location =
            modal
                .querySelector("#reportPetLocation")
                .value
                .trim() ||
            "Not specified";


        const gender =
            modal
                .querySelector("#reportPetGender")
                .value;


        const color =
            modal
                .querySelector("#reportPetColor")
                .value
                .trim() ||
            "Not specified";


        const description =
            modal
                .querySelector("#reportPetDescription")
                .value
                .trim() ||
            "No additional description provided.";


        const phoneInput =
            modal.querySelector(
                "#reportPetPhone"
            );


        const phone =
            phoneInput
                ? phoneInput.value.trim()
                : "";


        const imageInput =
            modal.querySelector(
                "#reportPetImage"
            );


        let image =
            "../assets/images/adoption/pet1.jpg";


        /* IMAGE */

        if (
            imageInput &&
            imageInput.files &&
            imageInput.files.length > 0
        ) {

            try {

                image =
                    await fileToDataURL(
                        imageInput.files[0]
                    );

            } catch (error) {

                showToast(
                    "The image could not be loaded.",
                    "error"
                );

                return;

            }

        }


        const today =
            new Date()
                .toISOString()
                .split("T")[0];


        const genderValue =
            String(
                gender || ""
            ).toLowerCase();


        const species =
            type || "other";


        const petName =
            name ||
            species.charAt(0)
                .toUpperCase() +
                species.slice(1);


        const payload = {

            type:
                status,

            petName,

            contactName:
                currentUserName,

            contactPhone:
                phone ||
                currentUserPhone,

            species,

            description,

            location,
            date:
                today,

            breed:
                "",

            gender:
                genderValue === "male"
                    ? "male"
                    : genderValue === "female"
                        ? "female"
                        : "unknown",

            color,

            images:
                image
                    ? [image]
                    : []

        };


        try {

            await FamiPetAPI.post(
                "/lost-found",
                payload
            );


            /* CLOSE */

            closeModal(modal);


            /* RELOAD FROM BACKEND */

            await loadReports();


            /* RESET FILTER */

            clearFilters();


            /* SUCCESS */

            showToast(
                status === "lost"
                    ? "Lost pet report added successfully."
                    : "Found pet report added successfully."
            );

        }
        catch (error) {

            showToast(
                error.message ||
                    "Could not submit the report.",
                "error"
            );

        }

    }


    /* =====================================================
       FILE TO DATA URL
    ===================================================== */

    function fileToDataURL(file) {

        return new Promise(
            (resolve, reject) => {

                const reader =
                    new FileReader();


                reader.onload =
                    () => resolve(
                        reader.result
                    );


                reader.onerror =
                    reject;


                reader.readAsDataURL(file);

            }
        );

    }


    /* =====================================================
       CREATE PET CARD
    ===================================================== */

    function createPetCard(pet) {

        const card =
            document.createElement("article");


        card.className =
            "pet-card";


        card.dataset.status =
            pet.status;


        card.dataset.type =
            pet.type;


        card.dataset.location =
            pet.location;


        card.dataset.date =
            pet.date;


        card.dataset.name =
            pet.name;


        card.dataset.poster =
            pet.poster ||
            pet.contactName ||
            "";


        card.dataset.phone =
            pet.phone ||
            pet.contactPhone ||
            "";


        card.dataset.email =
            pet.email ||
            "";


        const statusText =
            pet.status === "lost"
                ? "LOST"
                : "FOUND";


        const buttonClass =
            pet.status === "found"
                ? "details-btn found-btn"
                : "details-btn";


        const dateLabel =
            pet.status === "lost"
                ? "Lost on"
                : "Found on";


        const genderIcon =
            pet.gender === "Female"
                ? "fa-venus"
                : pet.gender === "Male"
                    ? "fa-mars"
                    : "fa-paw";


        card.innerHTML = `

            <div class="pet-image">

                <img
                    src="${escapeHTML(pet.image)}"
                    alt="${escapeHTML(pet.name)}"
                >

                <span class="status ${pet.status}">
                    ${statusText}
                </span>

                <span class="location-tag">

                    <i class="fa-solid fa-location-dot"></i>

                    ${escapeHTML(
                        pet.locationLabel
                    )}

                </span>

            </div>


            <div class="pet-info">

                <h3>
                    ${escapeHTML(pet.name)}
                </h3>


                <div class="pet-meta">

                    <span>

                        <i class="fa-solid ${genderIcon}"></i>

                        ${escapeHTML(
                            pet.gender
                        )}

                    </span>

                    <b>•</b>

                    <span>
                        ${escapeHTML(pet.age)}
                    </span>

                    <b>•</b>

                    <span>
                        ${escapeHTML(pet.color)}
                    </span>

                </div>


                <div class="pet-date">

                    <i class="fa-regular fa-calendar"></i>

                    ${dateLabel}
                    ${formatDate(pet.date)}

                </div>


                <p>
                    ${escapeHTML(
                        pet.description
                    )}
                </p>


                <button
                    class="${buttonClass}"
                    type="button"
                >

                    View Details

                    <i class="fa-solid fa-arrow-right"></i>

                </button>

            </div>

        `;


        petsGrid.appendChild(card);

    }


    /* =====================================================
       DETAILS BUTTONS
    ===================================================== */

    petsGrid.addEventListener(
        "click",
        event => {

            const button =
                event.target.closest(
                    ".details-btn"
                );


            if (!button) return;


            const card =
                button.closest(
                    ".pet-card"
                );


            if (!card) return;


            openDetailsModal(card);

        }
    );


    /* =====================================================
       DETAILS MODAL
    ===================================================== */

    function openDetailsModal(card) {

        closeAllOverlays();


        const name =
            card.dataset.name ||
            card.querySelector("h3")
                ?.textContent
                .trim() ||
            "Pet";


        const status =
            card.dataset.status ||
            "lost";


        const image =
            card.querySelector("img")
                ?.src || "";


        const location =
            card.dataset.location ||
            "";


        const locationText =
            card.querySelector(
                ".location-tag"
            )
                ?.innerText
                .trim() ||
            location;


        const date =
            card.dataset.date ||
            "";


        const meta =
            card.querySelector(
                ".pet-meta"
            )
                ?.innerText
                .trim() ||
            "Pet information";


        const description =
            card.querySelector(
                ".pet-info p"
            )
                ?.innerText
                .trim() ||
            "No additional information.";

            const poster =
    card.dataset.poster ||
    "Pet Parent";

const phone =
    card.dataset.phone ||
    "";

const email =
    card.dataset.email ||
    "";

        const statusText =
            status === "lost"
                ? "LOST"
                : "FOUND";


        const modal =
            document.createElement("div");


        modal.className =
            "lost-modal-overlay";


        modal.innerHTML = `

            <div class="lost-modal details-modal">

                <button
                    class="modal-close"
                    type="button"
                    aria-label="Close"
                >
                    <i class="fa-solid fa-xmark"></i>
                </button>


                <img
                    src="${escapeHTML(image)}"
                    alt="${escapeHTML(name)}"
                    class="details-image"
                >


                <span
                    class="details-status ${status}"
                >
                    ${statusText}
                </span>


                <h2>
                    ${escapeHTML(name)}
                </h2>


                <div class="detail-line">

                    <i class="fa-solid fa-paw"></i>

                    <span>
                        ${escapeHTML(meta)}
                    </span>

                </div>


                <div class="detail-line">

                    <i class="fa-solid fa-location-dot"></i>

                    <span>
                        ${escapeHTML(locationText)}
                    </span>

                </div>


                <div class="detail-line">

                    <i class="fa-regular fa-calendar"></i>

                    <span>
                        ${formatDate(date)}
                    </span>

                </div>


<div class="details-description">

    ${escapeHTML(description)}

</div>


<div class="contact-person">

    <div class="contact-person-title">

        <i class="fa-solid fa-user"></i>

        <div>
            <strong>Contact Person</strong>

            <span>
                ${escapeHTML(poster)}
            </span>
        </div>

    </div>


    <div class="contact-actions">

        <button
            class="contact-btn call-btn"
            type="button"
        >
            <i class="fa-solid fa-phone"></i>
            Call
        </button>


        <button
            class="contact-btn message-btn"
            type="button"
        >
            <i class="fa-solid fa-envelope"></i>
            Message
        </button>

    </div>

</div>


<button
    class="details-close-btn"
    type="button"
>
    Close
</button>

            </div>

        `;


        document.body.appendChild(modal);


        requestAnimationFrame(() => {

            modal.classList.add("show");

        });


        modal
            .querySelector(".modal-close")
            .addEventListener(
                "click",
                () => closeModal(modal)
            );


        modal
            .querySelector(".details-close-btn")
            .addEventListener(
                "click",
                () => closeModal(modal)
            );
const callButton =
    modal.querySelector(".call-btn");


const messageButton =
    modal.querySelector(".message-btn");


callButton.addEventListener(
    "click",
    () => {

        if (!phone) {

            alert(
                "Phone number is not available."
            );

            return;

        }


        window.location.href =
            `tel:${phone}`;

    }
);


messageButton.addEventListener(
    "click",
    () => {

        if (!email) {

            alert(
                "Email address is not available."
            );

            return;

        }


        const subject =
            encodeURIComponent(
                `Regarding ${name} - Lost & Found`
            );


        const body =
            encodeURIComponent(
                `Hello ${poster},\n\nI am contacting you regarding ${name}, listed on Famipet Lost & Found.`
            );


        window.location.href =
            `mailto:${email}?subject=${subject}&body=${body}`;

    }
);

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    closeModal(modal);

                }

            }
        );

    }


    /* =====================================================
       NOTIFICATIONS
    ===================================================== */

    if (notificationBtn) {

        notificationBtn.addEventListener(
            "click",
            event => {

                event.stopPropagation();

                toggleNotificationPanel();

            }
        );

    }


    function toggleNotificationPanel() {

        const existing =
            document.querySelector(
                ".notification-panel"
            );


        if (existing) {

            existing.remove();

            return;

        }


        const panel =
            document.createElement("div");


        panel.className =
            "notification-panel";


        panel.innerHTML = `

            <div class="notification-head">

                <strong>
                    Notifications
                </strong>

                <span>
                    3 new
                </span>

            </div>


            <div class="notification-item">

                <i class="fa-solid fa-paw"></i>

                <div>

                    <strong>
                        Lost pet report
                    </strong>

                    <p>
                        A new lost pet report is available.
                    </p>

                </div>

            </div>


            <div class="notification-item">

                <i class="fa-solid fa-location-dot"></i>

                <div>

                    <strong>
                        Nearby report
                    </strong>

                    <p>
                        A pet was reported in your area.
                    </p>

                </div>

            </div>


            <div class="notification-item">

                <i class="fa-solid fa-heart"></i>

                <div>

                    <strong>
                        Community update
                    </strong>

                    <p>
                        Someone may have found a missing pet.
                    </p>

                </div>

            </div>

        `;


        document.body.appendChild(panel);


        setTimeout(() => {

            document.addEventListener(
                "click",
                closeNotificationOutside,
                {
                    once: true
                }
            );

        }, 0);

    }


    function closeNotificationOutside(event) {

        const panel =
            document.querySelector(
                ".notification-panel"
            );


        if (!panel) return;


        if (
            !panel.contains(event.target) &&
            !notificationBtn.contains(event.target)
        ) {

            panel.remove();

        }

    }


    /* =====================================================
       BACKEND - LOST & FOUND REPORTS
    ===================================================== */

    function titleCaseGender(gender) {

        const value =
            String(
                gender || ""
            ).toLowerCase();


        if (value === "male") {

            return "Male";

        }


        if (value === "female") {

            return "Female";

        }


        return "Prefer not to say";

    }


    function mapReport(report) {

        const images =
            Array.isArray(report.images)
                ? report.images
                : [];


        const author =
            report.user || {};


        const speciesLabel =
            String(
                report.species || ""
            );


        return {

            id:
                report._id || report.id,

            status:
                report.type,

            type:
                speciesLabel,

            name:
                report.petName,

            species:
                speciesLabel,

            breed:
                report.breed || "",

            gender:
                titleCaseGender(
                    report.gender
                ),

            color:
                report.color || "",

            description:
                report.description || "",

            location:
                normalizeLocation(
                    report.location || ""
                ),

            locationLabel:
                report.location || "",

            date:
                report.date || "",

            contactName:
                report.contactName || "",

            contactPhone:
                report.contactPhone || "",

            poster:
                report.contactName ||
                author.name ||
                "Pet Parent",

            phone:
                report.contactPhone ||
                author.phone ||
                "",

            email:
                author.email ||
                "",

            age:
                report.breed || "Not specified",

            image:
                images[0] ||
                "../assets/images/adoption/pet1.jpg"

        };

    }


    async function loadReports() {

        try {

            const data =
                await FamiPetAPI.get(
                    "/lost-found"
                );


            const reports =
                (data && data.reports) || [];


            document
                .querySelectorAll(
                    "#petsGrid .pet-card"
                )
                .forEach(
                    card =>
                        card.remove()
                );


            reports
                .slice()
                .reverse()
                .forEach(
                    report => {

                        createPetCard(
                            mapReport(report)
                        );

                    }
                );


            renderCards();

        }
        catch (error) {

            showToast(
                error.message ||
                    "Could not load lost & found reports.",
                "error"
            );

        }

    }


    /* =====================================================
       NORMALIZE LOCATION
    ===================================================== */

    function normalizeLocation(value) {

        const location =
            value
                .toLowerCase()
                .trim();


        if (
            location.includes("andheri")
        ) {

            return "andheri";

        }


        if (
            location.includes("borivali")
        ) {

            return "borivali";

        }


        if (
            location.includes("thane")
        ) {

            return "thane";

        }


        if (
            location.includes("dadar")
        ) {

            return "dadar";

        }


        return "all";

    }


    /* =====================================================
       DATE
    ===================================================== */

    function formatDate(date) {

        if (!date) {

            return "Unknown date";

        }


        const parsed =
            new Date(date);


        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {

            return date;

        }


        return parsed.toLocaleDateString(
            "en-IN",
            {
                day: "numeric",
                month: "short",
                year: "numeric"
            }
        );

    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(value) {

        const div =
            document.createElement("div");


        div.textContent =
            value ?? "";


        return div.innerHTML;

    }


    /* =====================================================
       MODAL HELPERS
    ===================================================== */

    function closeModal(modal) {

        if (!modal) return;


        modal.classList.remove("show");


        setTimeout(() => {

            modal.remove();

        }, 200);

    }


    function closeAllOverlays() {

        document
            .querySelectorAll(
                ".lost-modal-overlay"
            )
            .forEach(modal => {

                modal.remove();

            });


        const notification =
            document.querySelector(
                ".notification-panel"
            );


        if (notification) {

            notification.remove();

        }

    }


    /* =====================================================
       TOAST
    ===================================================== */

    function showToast(
        message,
        type = "success"
    ) {

        const oldToast =
            document.querySelector(
                ".ann-toast"
            );


        if (oldToast) {

            oldToast.remove();

        }


        const toast =
            document.createElement("div");


        toast.className =
            "ann-toast";


        toast.innerHTML = `

            <div class="toast-icon">

                <i class="fa-solid ${
                    type === "error"
                        ? "fa-circle-exclamation"
                        : "fa-circle-check"
                }"></i>

            </div>


            <span>
                ${escapeHTML(message)}
            </span>


            <button
                class="toast-close"
                type="button"
                aria-label="Close"
            >
                <i class="fa-solid fa-xmark"></i>
            </button>

        `;


        document.body.appendChild(toast);


        requestAnimationFrame(() => {

            toast.classList.add("show");

        });


        toast
            .querySelector(".toast-close")
            .addEventListener(
                "click",
                () => toast.remove()
            );


        setTimeout(() => {

            toast.remove();

        }, 3500);

    }


    /* =====================================================
       LOAD DATA
    ===================================================== */

    loadReports();


    /* =====================================================
       INITIAL RENDER
    ===================================================== */

    renderCards();

});