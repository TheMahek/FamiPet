/* =========================================================
   FAMIPET - ADMIN PANEL SHARED LAYOUT + AUTH GUARD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* -----------------------------------------------------
       ADMIN-ONLY GUARD
    ----------------------------------------------------- */

    if (
        typeof FamiPetAPI === "undefined" ||
        !FamiPetAPI.isLoggedIn()
    ) {
        window.location.href = "../pages/login.html";
        return;
    }

    if (!FamiPetAPI.isAdmin()) {
        window.location.href = "../pages/dashboard.html";
        return;
    }

    const page =
        document.body.dataset.page || "dashboard";

    const user =
        FamiPetAPI.getUser() || {};

    /* -----------------------------------------------------
       SIDEBAR
    ----------------------------------------------------- */

    const navItems = [
        {
            page: "dashboard",
            label: "Dashboard",
            icon: "fa-solid fa-chart-pie",
            href: "dashboard.html",
        },
        {
            page: "users",
            label: "Users",
            icon: "fa-solid fa-users",
            href: "users.html",
        },
        {
            page: "pets",
            label: "Pets",
            icon: "fa-solid fa-paw",
            href: "pets.html",
        },
        {
            page: "adoptions",
            label: "Adoptions",
            icon: "fa-solid fa-heart",
            href: "adoptions.html",
        },
    ];

    const sidebar =
        document.getElementById("adminSidebar");

    if (sidebar) {

        sidebar.innerHTML = `

            <div class="admin-brand">

                <img src="../assets/images/dashboard/cute-pet.svg" alt="Famipet" />

                <h3>Famipet Admin</h3>

                <small>Control Panel</small>

            </div>

            <nav class="admin-nav">

                ${navItems.map(item => `

                    <a
                        href="${item.href}"
                        class="${item.page === page ? "active" : ""}"
                    >

                        <i class="${item.icon}"></i>

                        ${item.label}

                    </a>

                `).join("")}

            </nav>

            <div class="admin-sidebar-foot">

                <a href="../pages/dashboard.html">

                    <i class="fa-solid fa-arrow-left"></i>

                    Back to App

                </a>

                <a href="#" id="adminLogout">

                    <i class="fa-solid fa-right-from-bracket"></i>

                    Logout

                </a>

            </div>

        `;

        const logout =
            document.getElementById("adminLogout");

        if (logout) {

            logout.addEventListener(
                "click",
                (event) => {

                    event.preventDefault();

                    FamiPetAPI.logout();

                    window.location.href =
                        "../pages/login.html";
                }
            );
        }
    }

    /* -----------------------------------------------------
       TOPBAR USER CHIP
    ----------------------------------------------------- */

    const chipImage =
        document.getElementById("adminAvatar");

    const chipName =
        document.getElementById("adminUserName");

    if (chipName) {

        chipName.textContent =
            user.name || "Admin";
    }

    if (chipImage && user.avatar) {

        chipImage.src =
            user.avatar;
    }

});