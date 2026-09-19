/* =========================================================
   FAMIPET - PET BREEDS PAGE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const grid =
        document.getElementById("breedsGrid");

    const searchInput =
        document.getElementById("breedSearch");

    const filterTabs =
        document.querySelectorAll("#breedFilterTabs .tab-btn");

    const notificationBtn =
        document.getElementById("notificationBtn");

    let allBreeds = [];
    let currentSpecies = "all";
    let currentSearch = "";


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function speciesLabel(species) {

        return String(species || "")
            .replace(/^\w/, c => c.toUpperCase());
    }


    const BREED_IMAGE_OVERRIDES = {

        "Golden Retriever":
            "../assets/images/dashboard/golden-retriever.png"
    };


    function breedImage(breed, species) {

        if (
            breed.images &&
            breed.images.length &&
            breed.images[0]
        ) {

            return breed.images[0];
        }

        const override =
            BREED_IMAGE_OVERRIDES[breed.name];

        if (override) {

            return override;
        }

        if (species === "cat") {

            return "../assets/images/my-pet/cat.png";
        }

        if (species === "bird") {

            return "../assets/images/my-pet/pet-tip.png";
        }

        const seed =
            String(breed.name || "")
                .split("")
                .reduce((sum, ch) =>
                    sum + ch.charCodeAt(0), 0);

        return seed % 2 === 0
            ? "../assets/images/my-pet/dog.png"
            : "../assets/images/my-pet/dog1.png";
    }


    function renderBreeds() {

        const filtered =
            allBreeds.filter((breed) => {

                const matchesSpecies =
                    currentSpecies === "all" ||
                    breed.species === currentSpecies;

                const matchesSearch =
                    !currentSearch ||
                    breed.name
                        .toLowerCase()
                        .includes(currentSearch) ||
                    (breed.origin || "")
                        .toLowerCase()
                        .includes(currentSearch);

                return matchesSpecies && matchesSearch;
            });


        if (!allBreeds.length) {

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No breeds found</h3>
                    <p style="margin-top:8px;">
                        Try another search or filter.
                    </p>
                </div>
            `;

            return;
        }


        if (!filtered.length) {

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No breeds found</h3>
                    <p style="margin-top:8px;">
                        Try another search or filter.
                    </p>
                </div>
            `;

            return;
        }


        grid.innerHTML =
            filtered.map((breed) => {

                return `

                <article class="breed-card" data-id="${escapeHTML(breed._id)}">

                    <div class="breed-card-img">

                        <img
                            src="${escapeHTML(breedImage(breed, breed.species))}"
                            alt="${escapeHTML(breed.name)}"
                            loading="lazy"
                        />

                    </div>


                    <div class="breed-card-body">

                        <div class="breed-card-top">

                            <h3>
                                ${escapeHTML(breed.name)}
                            </h3>

                            <span class="species-pill">
                                ${escapeHTML(speciesLabel(breed.species))}
                            </span>

                        </div>


                        <div class="breed-meta">

                            ${
                                breed.origin
                                    ? `<span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(breed.origin)}</span>`
                                    : ""
                            }

                            ${
                                breed.lifespan
                                    ? `<span><i class="fa-solid fa-heart"></i> ${escapeHTML(breed.lifespan)}</span>`
                                    : ""
                            }

                            ${
                                breed.weightRange
                                    ? `<span><i class="fa-solid fa-weight-scale"></i> ${escapeHTML(breed.weightRange)}</span>`
                                    : ""
                            }

                        </div>


                        ${
                            breed.description
                                ? `<p class="breed-desc">${escapeHTML(breed.description)}</p>`
                                : ""
                        }


                        <div class="breed-card-spacer" aria-hidden="true"></div>


                        <a
                            class="breed-toggle-btn"
                            href="breed-details.html?id=${encodeURIComponent(breed._id)}"
                        >

                            View Details

                            <i class="fa-solid fa-arrow-right"></i>

                        </a>

                    </div>

                </article>

                `;

            }).join("");
    }


    async function loadBreeds() {

        try {

            const data =
                await FamiPetAPI.get("/breeds");

            allBreeds =
                data.breeds || [];

            renderBreeds();

        } catch (error) {

            console.error(
                "Could not load breeds:",
                error
            );

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>Could not load breeds</h3>
                    <p style="margin-top:8px;">
                        Please check your connection and try again.
                    </p>
                </div>
            `;
        }
    }


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            (event) => {

                currentSearch =
                    event.target.value
                        .trim()
                        .toLowerCase();

                renderBreeds();
            }
        );
    }


    filterTabs.forEach((tab) => {

        tab.addEventListener(
            "click",
            () => {

                filterTabs.forEach((t) =>
                    t.classList.remove("active")
                );

                tab.classList.add("active");

                currentSpecies =
                    tab.dataset.species;

                renderBreeds();
            }
        );
    });


    loadBreeds();


    /* =====================================================
       NOTIFICATIONS (LIVE)
    ===================================================== */

    async function refreshNotificationBadge() {

        const badge =
            document.getElementById(
                "notificationCount"
            );

        if (!badge) return;

        try {

            const data =
                await FamiPetAPI.get(
                    "/notifications/unread"
                );

            const count =
                Number(data && data.count) || 0;

            if (count > 0) {

                badge.textContent =
                    String(count);

                badge.style.display =
                    "";

            } else {

                badge.style.display =
                    "none";

            }

        }
        catch (error) {

            badge.style.display =
                "none";

        }

    }


    function formatTime(value) {

        if (!value) return "";

        const parsed =
            new Date(value);

        if (
            Number.isNaN(
                parsed.getTime()
            )
        ) {
            return "";
        }

        return parsed.toLocaleTimeString(
            [],
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );

    }


    function renderNotificationItems(panel) {

        const body =
            panel.querySelector(
                "#notifPanelBody"
            );

        FamiPetAPI.get(
            "/notifications"
        ).then((data) => {

            const notifications =
                (data && data.notifications) || [];

            if (!notifications.length) {

                body.innerHTML =
                    '<div class="notif-empty">No new notifications.</div>';

                return;

            }

            body.innerHTML =
                notifications
                    .slice(0, 10)
                    .map(n => {

                        const icon =
                            n.type === "reminder"
                                ? "fa-bell"
                                : n.type === "appointment"
                                    ? "fa-calendar-check"
                                    : n.type === "community"
                                        ? "fa-users"
                                        : "fa-paw";

                        return `
                            <div class="notification-item" data-id="${n._id}" data-read="${n.isRead ? "1" : "0"}">

                                <i class="fa-solid ${icon}"></i>

                                <div>
                                    <strong>${escapeHTML(n.title || "Notification")}</strong>
                                    <p>${escapeHTML(n.message || "")}</p>
                                    <span class="notif-time">${escapeHTML(formatTime(n.createdAt))}</span>
                                </div>

                            </div>
                        `;

                    })
                    .join("");

            body.querySelectorAll(".notification-item[data-id]").forEach((el) => {

                el.addEventListener("click", async () => {

                    const id =
                        el.getAttribute("data-id");

                    if (
                        !id ||
                        el.getAttribute("data-read") === "1"
                    ) {
                        return;
                    }

                    try {

                        await FamiPetAPI.put(
                            "/notifications/" +
                            encodeURIComponent(id) +
                            "/read",
                            {}
                        );

                        el.setAttribute("data-read", "1");

                        refreshNotificationBadge();

                    }
                    catch (error) {
                        /* keep current state on failure */
                    }

                });

            });

        }).catch(() => {

            body.innerHTML =
                '<div class="notif-empty">Could not load notifications.</div>';

        });

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


    if (notificationBtn) {

        notificationBtn.addEventListener(
            "click",
            event => {

                event.stopPropagation();

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

                panel.innerHTML =
                    '<div class="notification-head"><strong>Notifications</strong><button class="notif-close-btn" id="closeNotificationPanel" type="button" aria-label="Close"><i class="fa-solid fa-xmark"></i></button></div><div class="notif-body" id="notifPanelBody">Loading...</div>';

                document.body.appendChild(panel);

                panel.querySelector(
                    "#closeNotificationPanel"
                ).addEventListener(
                    "click",
                    () => panel.remove()
                );

                document.addEventListener(
                    "keydown",
                    function handler(event) {

                        if (event.key !== "Escape") return;

                        document.removeEventListener(
                            "keydown",
                            handler
                        );

                        panel.remove();

                    }
                );

                setTimeout(() => {

                    document.addEventListener(
                        "click",
                        closeNotificationOutside,
                        {
                            once: true
                        }
                    );

                }, 0);

                renderNotificationItems(panel);

            }
        );

        refreshNotificationBadge();

    }

});