/* =========================================================
   Famipet UNIVERSAL SIDEBAR
   Same sidebar on every page
   Shared Profile Support
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const sidebarContainer =
        document.getElementById("sidebar-container");

    if (!sidebarContainer) {
        return;
    }

    /* =====================================================
       AUTH GUARD
       Pages with the sidebar are protected.
    ===================================================== */

    if (typeof FamiPetAPI !== "undefined" && !FamiPetAPI.isLoggedIn()) {
        window.location.href = "login.html";
        return;
    }

    const apiUser = (typeof FamiPetAPI !== "undefined") ? FamiPetAPI.getUser() : null;

    const isAdmin = (typeof FamiPetAPI !== "undefined") ? FamiPetAPI.isAdmin() : false;


    /* =====================================================
       DEFAULT PROFILE
    ===================================================== */

    const DEFAULT_PROFILE = {

        name: "Pet Parent",

        role: "Pet Owner",

        image: ""

    };


    function getInitials(name) {

        const clean =
            String(name || "").trim();

        if (!clean) return "PP";

        return clean
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((w) => w[0].toUpperCase())
            .join("");
    }


    function isRealImage(src) {

        return !!(
            src &&
            !String(src).includes("user-profile.svg")
        );
    }


    /* =====================================================
       GET SAVED PROFILE
    ===================================================== */

    function getSavedProfile() {

        try {

            if (apiUser) {

                return {
                    name: apiUser.name || DEFAULT_PROFILE.name,
                    role: apiUser.role === "admin" ? "Admin" : DEFAULT_PROFILE.role,
                    image: isRealImage(apiUser.avatar) ? apiUser.avatar : "",
                };

            }

            const saved =
                localStorage.getItem("annProfile");

            if (saved) {

                const profile =
                    JSON.parse(saved);

                return {

                    ...DEFAULT_PROFILE,

                    ...profile

                };

            }

        } catch (error) {

            console.warn(
                "Could not load saved profile."
            );

        }

        return {
            ...DEFAULT_PROFILE
        };

    }


    const profile =
        getSavedProfile();


    /* =====================================================
       SIDEBAR HTML
    ===================================================== */

    sidebarContainer.innerHTML = `

        <aside
            class="ann-sidebar"
            id="annSidebar"
        >


            <!-- =================================================
                 LOGO
            ================================================= -->

            <div class="sidebar-brand">

                <div class="brand-logo">

                    <img
                        src="../assets/logos/Famipet.png"
                        alt="Famipet Logo"
                    >

                </div>


                <div class="brand-text">

                    <h2>
                        Famipet
                    </h2>

                    <span>
                        Pet Care &amp; Community
                    </span>

                </div>

            </div>


            <!-- =================================================
                 NAVIGATION
            ================================================= -->

            <nav class="sidebar-nav">


                <a
                    href="dashboard.html"
                    class="ann-nav-item"
                    data-page="dashboard"
                >

                    <i data-lucide="layout-grid"></i>

                    <span>
                        Dashboard
                    </span>

                </a>


                <a
                    href="mypet.html"
                    class="ann-nav-item"
                    data-page="mypet"
                >

                    <i data-lucide="users-round"></i>

                    <span>
                        My Pets
                    </span>

                </a>


                <a
                    href="adoption.html"
                    class="ann-nav-item"
                    data-page="adoption"
                >

                    <i data-lucide="heart"></i>

                    <span>
                        Adoption
                    </span>

                </a>


                <a
                    href="health.html"
                    class="ann-nav-item"
                    data-page="health"
                >

                    <i data-lucide="activity"></i>

                    <span>
                        Health
                    </span>

                </a>


                <a
                    href="appointments.html"
                    class="ann-nav-item"
                    data-page="appointments"
                >

                    <i data-lucide="calendar-check"></i>

                    <span>
                        Appointments
                    </span>

                </a>


                <a
                    href="reminders.html"
                    class="ann-nav-item"
                    data-page="reminders"
                >

                    <i data-lucide="bell"></i>

                    <span>
                        Reminders
                    </span>

                </a>


                <a
                    href="community.html"
                    class="ann-nav-item"
                    data-page="community"
                >

                    <i data-lucide="users"></i>

                    <span>
                        Community
                    </span>

                </a>


                <a
                    href="lost-found.html"
                    class="ann-nav-item"
                    data-page="lost-found"
                >

                    <i data-lucide="search"></i>

                    <span>
                        Lost &amp; Found
                    </span>

                </a>


                <a
                    href="petgpt.html"
                    class="ann-nav-item"
                    data-page="petgpt"
                >

                    <i data-lucide="sparkles"></i>

                    <span>
                        PetGPT
                    </span>

                </a>

                <a
                    href="breeds.html"
                    class="ann-nav-item"
                    data-page="breeds"
                >

                    <i data-lucide="paw-print"></i>

                    <span>
                        Pet Breeds
                    </span>

                </a>

                <a
                    href="pet-id.html"
                    class="ann-nav-item"
                    data-page="pet-id"
                >

                    <i data-lucide="qrcode"></i>

                    <span>
                        Pet ID
                    </span>

                </a>


                <a
                    href="settings.html"
                    class="ann-nav-item"
                    data-page="settings"
                >

                    <i data-lucide="settings"></i>

                    <span>
                        Settings
                    </span>

                </a>

                ${isAdmin ? `
                <a
                    href="../admin/dashboard.html"
                    class="ann-nav-item"
                    data-page="admin"
                >

                    <i data-lucide="shield"></i>

                    <span>
                        Admin Panel
                    </span>

                </a>
                ` : ""}

                <a
                    href="#"
                    class="ann-nav-item"
                    id="sidebarLogout"
                >

                    <i data-lucide="log-out"></i>

                    <span>
                        Logout
                    </span>

                </a>


            </nav>


            <!-- =================================================
                 PET DECORATION
            ================================================= -->

            <div class="sidebar-pet-decoration">

                <img
                    src="../assets/images/dashboard/cute-pet.svg"
                    alt="Cute pets"
                >

            </div>


            <!-- =================================================
                 USER PROFILE
            ================================================= -->

            <button
                class="sidebar-profile"
                id="sidebarProfile"
                type="button"
            >

                <div
                    class="profile-avatar"
                    id="sidebarAvatar"
                >

                    ${
                        isRealImage(profile.image)
                            ? `<img
                                   id="sidebarProfileImage"
                                   src="${profile.image}"
                                   alt="${profile.name}"
                               >`
                            : `<span
                                   id="sidebarProfileInitials"
                                   class="profile-initials"
                               >
                                   ${getInitials(profile.name)}
                               </span>`
                    }

                </div>


                <div class="profile-info">

                    <strong
                        id="sidebarProfileName"
                    >
                        ${profile.name}
                    </strong>


                    <span
                        id="sidebarProfileRole"
                    >
                        ${profile.role}
                    </span>

                </div>


                <i
                    data-lucide="chevron-down"
                    class="profile-arrow"
                ></i>

            </button>


        </aside>

    `;


    /* =====================================================
       MOBILE SIDEBAR CONTROLS
       Pages other than Dashboard do not have their own toggle,
       so create one here and reuse the same sidebar state.
    ===================================================== */

    const existingToggle = document.getElementById("sidebarToggle");

    if (!existingToggle) {
        const mobileToggle = document.createElement("button");
        mobileToggle.className = "mobile-sidebar-toggle";
        mobileToggle.type = "button";
        mobileToggle.setAttribute("aria-label", "Open navigation");
        mobileToggle.innerHTML = '<i data-lucide="menu"></i>';
        document.body.appendChild(mobileToggle);

        mobileToggle.addEventListener("click", () => {
            document.body.classList.toggle("sidebar-open");
            mobileToggle.setAttribute(
                "aria-label",
                document.body.classList.contains("sidebar-open")
                    ? "Close navigation"
                    : "Open navigation"
            );
            mobileToggle.innerHTML = document.body.classList.contains("sidebar-open")
                ? '<i data-lucide="x"></i>'
                : '<i data-lucide="menu"></i>';
            if (window.lucide) lucide.createIcons();
        });
    } else {
        existingToggle.classList.add("mobile-sidebar-toggle");
    }

    const overlay = document.createElement("div");
    overlay.className = "mobile-sidebar-overlay";
    overlay.setAttribute("aria-hidden", "true");
    document.body.appendChild(overlay);

    overlay.addEventListener("click", () => {
        document.body.classList.remove("sidebar-open");
    });

    document.querySelectorAll("#sidebar-container .ann-nav-item").forEach(item => {
        item.addEventListener("click", () => {
            document.body.classList.remove("sidebar-open");
        });
    });


    /* =====================================================
       INITIALIZE LUCIDE
    ===================================================== */

    if (window.lucide) {

        lucide.createIcons();

    }


    /* =====================================================
       HEADER PROFILE BUTTONS
       Replace the default placeholder image with the real
       avatar, or initials when no photo is set.
    ===================================================== */

    document.querySelectorAll(".profile-btn").forEach((btn) => {

        btn.innerHTML =
            isRealImage(profile.image)
                ? `<img src="${profile.image}" alt="${profile.name}">`
                : `<span class="profile-initials">${getInitials(profile.name)}</span>`;

    });


    /* =====================================================
       FIND CURRENT PAGE
    ===================================================== */

    const currentFile =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    let currentPage = "";


    if (
        currentFile.includes("dashboard")
    ) {

        currentPage =
            "dashboard";

    }

    else if (
        currentFile.includes("mypet") ||
        currentFile.includes("my-pet")
    ) {

        currentPage =
            "mypet";

    }

    else if (
        currentFile.includes("adoption")
    ) {

        currentPage =
            "adoption";

    }

    else if (
        currentFile.includes("health")
    ) {

        currentPage =
            "health";

    }

    else if (
        currentFile.includes("appointment")
    ) {

        currentPage =
            "appointments";

    }

    else if (
        currentFile.includes("reminder")
    ) {

        currentPage =
            "reminders";

    }

    else if (
        currentFile.includes("community")
    ) {

        currentPage =
            "community";

    }

    else if (
        currentFile.includes("lost") ||
        currentFile.includes("found")
    ) {

        currentPage =
            "lost-found";

    }

    else if (
        currentFile.includes("breed")
    ) {

        currentPage =
            "breeds";

    }

    else if (
        currentFile.includes("pet-gpt") ||
        currentFile.includes("petgpt")
    ) {

        currentPage =
            "petgpt";

    }

    else if (
        currentFile.includes("pet-id") ||
        currentFile.includes("petid")
    ) {

        currentPage =
            "pet-id";

    }

    else if (
        currentFile.includes("setting")
    ) {

        currentPage =
            "settings";

    }


    /* =====================================================
       ACTIVE NAVIGATION
    ===================================================== */

    document
        .querySelectorAll(".ann-nav-item")
        .forEach(item => {

            if (
                item.dataset.page ===
                currentPage
            ) {

                item.classList.add("active");

            }

        });


    /* =====================================================
       PROFILE BUTTON
    ===================================================== */

    const profileButton =
        document.getElementById(
            "sidebarProfile"
        );


    if (profileButton) {

        profileButton.addEventListener(
            "click",
            () => {

                window.location.href =
                    "settings.html";

            }
        );

    }


    /* =====================================================
       LOGOUT
    ===================================================== */

    const logoutBtn =
        document.getElementById("sidebarLogout");

    if (logoutBtn) {

        logoutBtn.addEventListener(
            "click",
            (e) => {

                e.preventDefault();

                if (typeof FamiPetAPI !== "undefined") {
                    FamiPetAPI.logout();
                } else {
                    localStorage.clear();
                    sessionStorage.clear();
                }

                window.location.href =
                    "login.html";

            }
        );

    }


    /* =====================================================
       UPDATE PROFILE FUNCTION
       Can be used by any page
    ===================================================== */

    window.updateANNProfile =
        function(profileData) {

            if (!profileData) {
                return;
            }


            const profileImage =
                profileData.image ||
                profileData.avatar ||
                DEFAULT_PROFILE.image;

            const profileName =
                profileData.name ||
                DEFAULT_PROFILE.name;

            const profileRole =
                profileData.role ||
                DEFAULT_PROFILE.role;

            const hasImage =
                isRealImage(profileImage);


            const sidebarAvatar =
                document.getElementById(
                    "sidebarAvatar"
                );

            if (sidebarAvatar) {

                sidebarAvatar.innerHTML =
                    hasImage
                        ? `<img
                               id="sidebarProfileImage"
                               src="${profileImage}"
                               alt="${profileName}"
                           >`
                        : `<span
                               id="sidebarProfileInitials"
                               class="profile-initials"
                           >
                               ${getInitials(profileName)}
                           </span>`;

            }


            const name =
                document.getElementById(
                    "sidebarProfileName"
                );

            if (name) {

                name.textContent =
                    profileName;

            }


            const role =
                document.getElementById(
                    "sidebarProfileRole"
                );

            if (role) {

                role.textContent =
                    profileRole;

            }


            document.querySelectorAll(
                ".profile-btn"
            ).forEach((btn) => {

                btn.innerHTML =
                    hasImage
                        ? `<img src="${profileImage}" alt="${profileName}">`
                        : `<span class="profile-initials">${getInitials(profileName)}</span>`;

            });

        };


});