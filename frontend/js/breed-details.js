/* =========================================================
   FAMIPET - BREED DETAILS PAGE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const wrap =
        document.getElementById("breedDetailContent");

    const notificationBtn =
        document.getElementById("notificationBtn");


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


    function breedImage(breed) {

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

        if (breed.species === "cat") {

            return "../assets/images/my-pet/cat.png";
        }

        if (breed.species === "bird") {

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


    function breedTag(text) {

        return `<span class="breed-tag">${escapeHTML(text)}</span>`;
    }


    function tile(icon, label, value) {

        if (!value) return "";

        return `
            <div class="detail-tile">

                <div class="tile-icon">
                    <i class="fa-solid ${icon}"></i>
                </div>

                <strong>${escapeHTML(label)}</strong>

                <span>${escapeHTML(value)}</span>

            </div>
        `;
    }


    function section(title, icon, content) {

        if (!content) return "";

        return `
            <div class="breed-section">

                <h3>
                    <i class="fa-solid ${icon}"></i>
                    ${escapeHTML(title)}
                </h3>

                ${content}

            </div>
        `;
    }


    function render(breed) {

        const temperament =
            Array.isArray(breed.temperament)
                ? breed.temperament
                : [];

        const diseases =
            Array.isArray(breed.commonDiseases)
                ? breed.commonDiseases
                : [];

        wrap.innerHTML = `

            <div class="breed-detail-hero">

                <img
                    src="${escapeHTML(breedImage(breed))}"
                    alt="${escapeHTML(breed.name)}"
                />

                <div>

                    <h2>
                        ${escapeHTML(breed.name)}
                    </h2>

                    <span class="species-pill">
                        ${escapeHTML(speciesLabel(breed.species))}
                    </span>

                </div>

            </div>

            <div class="detail-grid">

                ${tile("fa-location-dot", "Origin", breed.origin)}
                ${tile("fa-heart", "Lifespan", breed.lifespan)}
                ${tile("fa-weight-scale", "Weight", breed.weightRange)}
                ${tile("fa-ruler-vertical", "Height", breed.heightRange)}

            </div>

            ${section(
                "Temperament",
                "fa-face-smile",
                temperament.map(breedTag).join("")
            )}

            ${section(
                "Description",
                "fa-pen",
                escapeHTML(breed.description)
            )}

            ${section(
                "Exercise",
                "fa-person-running",
                escapeHTML(breed.exerciseRequirements)
            )}

            ${section(
                "Grooming",
                "fa-shower",
                escapeHTML(breed.groomingGuide)
            )}

            ${section(
                "Suitable Environment",
                "fa-house",
                escapeHTML(breed.suitableEnvironment)
            )}

            ${section(
                "Common Health Concerns",
                "fa-heart-pulse",
                diseases.map(breedTag).join("")
            )}

        `;
    }


    function showProblem(title, message) {

        wrap.innerHTML = `
            <div class="breeds-empty">
                <i class="fa-solid fa-paw"></i>
                <h3>${escapeHTML(title)}</h3>
                <p style="margin-top:8px;">
                    ${escapeHTML(message)}
                </p>
                <a class="back-link" href="breeds.html" style="text-decoration:none;">
                    <i class="fa-solid fa-arrow-left"></i>
                    Back to All Breeds
                </a>
            </div>
        `;
    }


    async function loadBreed() {

        try {

            if (typeof FamiPetAPI === "undefined") {

                showProblem(
                    "Could not load breed",
                    "The app is not ready. Please try again."
                );

                return;
            }

            const params =
                new URLSearchParams(
                    window.location.search
                );

            const id =
                params.get("id");

            if (!id) {

                showProblem(
                    "No breed selected",
                    "Please pick a breed from the list."
                );

                return;
            }

            const data =
                await FamiPetAPI.get(
                    "/breeds/" + id
                );

            if (!data || !data.breed) {

                showProblem(
                    "Breed not found",
                    "This breed may no longer be available."
                );

                return;
            }

            render(data.breed);

        } catch (error) {

            console.error(
                "Could not load breed details:",
                error
            );

            showProblem(
                "Could not load breed",
                error.message ||
                    "Please check your connection and try again."
            );
        }
    }


    loadBreed();


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