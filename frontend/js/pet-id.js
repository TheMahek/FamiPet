/* =========================================================
   FAMIPET - DIGITAL PET ID / QR
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const section =
        document.getElementById("petIdSection");

    const petSelect =
        document.getElementById("petSelect");

    const petPreview =
        document.getElementById("petPreview");

    const previewName =
        document.getElementById("previewName");

    const previewBreed =
        document.getElementById("previewBreed");

    const previewImg =
        petPreview.querySelector("img");

    const generateBtn =
        document.getElementById("generateQrBtn");

    const downloadBtn =
        document.getElementById("downloadIdBtn");

    const notificationBtn =
        document.getElementById("notificationBtn");

    const idPlaceholder =
        document.getElementById("idPlaceholder");

    const idCard =
        document.getElementById("idCard");

    const idPhoto =
        document.getElementById("idPhoto");

    const idPetName =
        document.getElementById("idPetName");

    const idBreed =
        document.getElementById("idBreed");

    const idSpecies =
        document.getElementById("idSpecies");

    const idAge =
        document.getElementById("idAge");

    const idOwner =
        document.getElementById("idOwner");

    const idQr =
        document.getElementById("idQr");

    let pets = [];
    let currentPet = null;
    let ownerName = "";


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function capFirst(s) {

        return String(s || "")
            .trim()
            .replace(/^\w/, c => c.toUpperCase());
    }


    function petImage(pet) {

        if (
            pet.images &&
            pet.images.length &&
            pet.images[0]
        ) {

            return pet.images[0];
        }

        return pet.species === "cat"
            ? "../assets/images/my-pet/cat.png"
            : "../assets/images/my-pet/dog1.png";
    }


    function refreshPreview() {

        const pet =
            pets.find(p => p._id === petSelect.value);

        currentPet = pet || null;

        if (!currentPet) {

            petPreview.style.display = "none";
            generateBtn.disabled = true;
            return;
        }

        previewName.textContent =
            currentPet.name;

        previewBreed.textContent =
            (currentPet.breed && currentPet.breed.name)
                ? `${capFirst(currentPet.species)} • ${currentPet.breed.name}`
                : capFirst(currentPet.species);

        previewImg.src =
            petImage(currentPet);

        petPreview.style.display = "flex";
        generateBtn.disabled = false;
    }


    function showIdCard(pet, qrCode) {

        idPhoto.src =
            petImage(pet);

        idPetName.textContent =
            pet.name;

        idBreed.textContent =
            (pet.breed && pet.breed.name)
                ? pet.breed.name
                : "";

        idSpecies.textContent =
            capFirst(pet.species);

        idAge.textContent =
            `${pet.age} ${pet.age === 1 ? "year" : "years"}`;

        idOwner.textContent =
            ownerName || "Pet Parent";

        idQr.src =
            qrCode;

        idPlaceholder.style.display = "none";

        idCard.style.display = "block";

        downloadBtn.style.display = "flex";
    }


    async function loadPets() {

        try {

            const me =
                await FamiPetAPI.get("/auth/me");

            ownerName =
                (me.user && me.user.name) || "";

            const data =
                await FamiPetAPI.get("/pets/my");

            pets =
                data.pets || [];

        } catch (error) {

            console.error(
                "Could not load pets:",
                error
            );

            pets = [];
        }

        if (!pets.length) {

            const container =
                document.getElementById("petIdSection");

            container.innerHTML = `
                <div class="petid-empty">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No pets yet</h3>
                    <p style="margin-top:8px;">
                        Add a pet first to generate its Digital ID.
                        <a href="mypet.html" style="color:#ff5c8a;font-weight:600;">Add your first pet →</a>
                    </p>
                </div>
            `;

            return;
        }

        petSelect.innerHTML =
            '<option value="">Choose a pet...</option>' +
            pets.map(p =>
                `<option value="${escapeHTML(p._id)}">
                    ${escapeHTML(p.name)} (${escapeHTML(capFirst(p.species))})
                </option>`
            ).join("");

        petSelect.disabled = false;
    }


    function generateQr() {

        if (!currentPet) return;

        const oldText =
            generateBtn.innerHTML;

        generateBtn.disabled = true;

        generateBtn.innerHTML =
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';

        FamiPetAPI.get(
            "/pets/" + currentPet._id + "/qr"
        ).then((data) => {

            if (data && data.qrCode) {

                showIdCard(currentPet, data.qrCode);

            } else {

                alert(
                    "Could not generate the QR code. Please try again."
                );
            }

        }).catch((err) => {

            console.error(err);

            alert(
                err.message ||
                "Could not generate the QR code. Please try again."
            );

        }).finally(() => {

            generateBtn.innerHTML =
                oldText;

            if (currentPet) {
                generateBtn.disabled = false;
            }
        });
    }


    async function downloadIdCard() {

        if (!currentPet) return;

        const name =
            (currentPet.name || "pet")
                .replace(/\s+/g, "-")
                .toLowerCase();

        try {

            const cardClone =
                idCard.cloneNode(true);

            const imgs =
                Array.from(
                    cardClone.querySelectorAll("img")
                );

            await Promise.all(
                imgs.map(img => {

                    if (
                        !img.src ||
                        img.src.startsWith("data:")
                    ) {
                        return Promise.resolve();
                    }

                    return fetch(img.src)
                        .then(res => res.blob())
                        .then(blob => {

                            return new Promise(resolve => {

                                const reader =
                                    new FileReader();

                                reader.onload = () => {

                                    img.src =
                                        String(reader.result);

                                    resolve();

                                };

                                reader.readAsDataURL(blob);

                            });

                        })
                        .catch(() => {});
                })
            );

            const canvas =
                document.createElement("canvas");

            const width = cardClone.offsetWidth || 460;
            const height = cardClone.offsetHeight || 420;

            canvas.width = width * 2;
            canvas.height = height * 2;

            const ctx =
                canvas.getContext("2d");

            const xml =
                new XMLSerializer()
                    .serializeToString(cardClone);

            const svg =
                "data:image/svg+xml;charset=utf-8," +
                encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                        <foreignObject width="100%" height="100%">
                            ${xml}
                        </foreignObject>
                    </svg>`
                );

            const img =
                new Image();

            img.onload = () => {

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const link =
                    document.createElement("a");

                link.download =
                    `famipet-${name}-id.png`;

                link.href =
                    canvas.toDataURL("image/png");

                link.click();
            };

            img.src = svg;

        } catch (error) {

            console.warn(error);

            window.print();
        }
    }


    petSelect.addEventListener(
        "change",
        refreshPreview
    );

    generateBtn.addEventListener(
        "click",
        generateQr
    );

    downloadBtn.addEventListener(
        "click",
        downloadIdCard
    );


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


    loadPets();

});