/* =========================================================
   Famipet DASHBOARD
   Complete Dashboard JavaScript
========================================================= */

document.addEventListener("DOMContentLoaded", () => {


    /* =========================================================
       1. INITIALIZE LUCIDE ICONS
    ========================================================= */

    if (window.lucide) {
        lucide.createIcons();
    }



    /* =========================================================
       2. ELEMENTS
    ========================================================= */

    const body = document.body;

    const sidebar = document.getElementById("annSidebar");

    const sidebarToggle =
        document.getElementById("sidebarToggle");

    const notificationBtn =
        document.getElementById("notificationBtn");

    const notificationPanel =
        document.getElementById("notificationPanel");

    const closeNotifications =
        document.getElementById("closeNotifications");

    const searchInput =
        document.getElementById("dashboardSearch");

    const profileBtn =
        document.getElementById("profileBtn");

    const appointmentDetailsBtn =
        document.getElementById("appointmentDetailsBtn");


    /* =========================================================
       4. SIDEBAR
    ========================================================= */

    if (sidebarToggle) {

        sidebarToggle.addEventListener(
            "click",
            () => {

                /*
                 Desktop:
                 Collapse sidebar

                 Mobile:
                 Open / close sidebar
                */

                if (window.innerWidth <= 850) {

                    body.classList.toggle(
                        "sidebar-open"
                    );

                } else {

                    body.classList.toggle(
                        "sidebar-collapsed"
                    );

                }

            }
        );

    }



    /* =========================================================
       5. CLOSE MOBILE SIDEBAR WHEN NAV ITEM CLICKED
    ========================================================= */

    const navItems =
        document.querySelectorAll(".nav-item");


    navItems.forEach(item => {

        item.addEventListener(
            "click",
            () => {

                if (window.innerWidth <= 850) {

                    body.classList.remove(
                        "sidebar-open"
                    );

                }

            }
        );

    });



    /* =========================================================
       6. CLOSE SIDEBAR WHEN CLICKING OUTSIDE ON MOBILE
    ========================================================= */

    document.addEventListener(
        "click",
        (event) => {

            if (window.innerWidth > 850) {
                return;
            }


            if (!body.classList.contains("sidebar-open")) {
                return;
            }


            const clickedInsideSidebar =
                sidebar &&
                sidebar.contains(event.target);


            const clickedHamburger =
                sidebarToggle &&
                sidebarToggle.contains(event.target);


            if (
                !clickedInsideSidebar &&
                !clickedHamburger
            ) {

                body.classList.remove(
                    "sidebar-open"
                );

            }

        }
    );



    /* =========================================================
       7. HANDLE WINDOW RESIZE
    ========================================================= */

    window.addEventListener(
        "resize",
        () => {

            if (window.innerWidth > 850) {

                body.classList.remove(
                    "sidebar-open"
                );

            }

        }
    );



    /* =========================================================
       8. NAVIGATION ACTIVE STATE
    ========================================================= */

    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    navItems.forEach(item => {

        const link =
            item.getAttribute("href");


        if (!link) {
            return;
        }


        const linkedPage =
            link.split("/")
                .pop()
                .toLowerCase();


        if (
            linkedPage === currentPage
        ) {

            navItems.forEach(nav => {
                nav.classList.remove("active");
            });


            item.classList.add("active");

        }

    });



    /* =========================================================
       9. NOTIFICATION PANEL
    ========================================================= */

    function openNotifications() {

        if (!notificationPanel) {
            return;
        }

        notificationPanel.classList.add("show");

    }


    function closeNotificationPanel() {

        if (!notificationPanel) {
            return;
        }

        notificationPanel.classList.remove("show");

    }



    if (notificationBtn) {

        notificationBtn.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();

                notificationPanel.classList.toggle(
                    "show"
                );

            }
        );

    }



    if (closeNotifications) {

        closeNotifications.addEventListener(
            "click",
            (event) => {

                event.stopPropagation();

                closeNotificationPanel();

            }
        );

    }



    /* =========================================================
       CLOSE NOTIFICATION WHEN CLICKING OUTSIDE
    ========================================================= */

    document.addEventListener(
        "click",
        (event) => {

            if (!notificationPanel) {
                return;
            }


            const clickedPanel =
                notificationPanel.contains(
                    event.target
                );


            const clickedButton =
                notificationBtn &&
                notificationBtn.contains(
                    event.target
                );


            if (
                !clickedPanel &&
                !clickedButton
            ) {

                closeNotificationPanel();

            }

        }
    );



    /* =========================================================
       10. SEARCH
    ========================================================= */

    if (searchInput) {

        searchInput.addEventListener(
            "input",
            () => {

                const searchValue =
                    searchInput.value
                        .trim()
                        .toLowerCase();


                const cards =
                    document.querySelectorAll(
                        ".dashboard-card, .stat-card"
                    );


                if (!searchValue) {

                    cards.forEach(card => {

                        card.style.display = "";

                    });

                    return;

                }


                cards.forEach(card => {

                    const text =
                        card.innerText
                            .toLowerCase();


                    if (
                        text.includes(
                            searchValue
                        )
                    ) {

                        card.style.display = "";

                    } else {

                        card.style.display = "none";

                    }

                });

            }
        );

    }



    /* =========================================================
       11. FAVORITE PET BUTTONS
    ========================================================= */

    const favoriteButtons =
        document.querySelectorAll(
            ".favorite-button"
        );


    favoriteButtons.forEach(button => {

        button.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                event.stopPropagation();


                button.classList.toggle(
                    "liked"
                );


                const icon =
                    button.querySelector(
                        "svg"
                    );


                if (
                    button.classList.contains(
                        "liked"
                    )
                ) {

                    button.style.background =
                        "#ef78a9";

                    button.style.color =
                        "#ffffff";


                    if (icon) {

                        icon.setAttribute(
                            "fill",
                            "currentColor"
                        );

                    }

                } else {

                    button.style.background =
                        "";

                    button.style.color =
                        "";


                    if (icon) {

                        icon.setAttribute(
                            "fill",
                            "none"
                        );

                    }

                }

            }
        );

    });



    /* =========================================================
       12. APPOINTMENT BUTTON
    ========================================================= */

    if (appointmentDetailsBtn) {

        appointmentDetailsBtn.addEventListener(
            "click",
            () => {

                /*
                 Change this URL later if your
                 appointment page has another name.
                */

                window.location.href =
                    "appointments.html";

            }
        );

    }



    /* =========================================================
       13. PROFILE BUTTON
    ========================================================= */

    if (profileBtn) {

        profileBtn.addEventListener(
            "click",
            () => {

                /*
                 Change this to your actual
                 profile/settings page if needed.
                */

                window.location.href =
                    "settings.html";

            }
        );

    }



    /* =========================================================
       14. STAT CARD LINKS
    ========================================================= */

    const statLinks =
        document.querySelectorAll(
            ".stat-card a"
        );


    statLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                /*
                 Normal anchor navigation.
                 This listener is here so the
                 interaction is handled consistently.
                */

                link.style.transform =
                    "scale(0.98)";


                setTimeout(
                    () => {

                        link.style.transform =
                            "";

                    },
                    120
                );

            }
        );

    });



    /* =========================================================
       15. CARD "VIEW ALL" LINKS
    ========================================================= */

    const cardLinks =
        document.querySelectorAll(
            ".card-header a"
        );


    cardLinks.forEach(link => {

        link.addEventListener(
            "click",
            () => {

                link.style.opacity =
                    "0.6";

            }
        );

    });



    /* =========================================================
       16. SMALL BUTTON PRESS EFFECT
    ========================================================= */

    const interactiveButtons =
        document.querySelectorAll(
            ".theme-btn, .notification-btn, .hamburger-btn, .favorite-button, .appointment-button"
        );


    interactiveButtons.forEach(button => {

        button.addEventListener(
            "mousedown",
            () => {

                button.style.transform =
                    "scale(0.95)";

            }
        );


        button.addEventListener(
            "mouseup",
            () => {

                button.style.transform =
                    "";

            }
        );


        button.addEventListener(
            "mouseleave",
            () => {

                button.style.transform =
                    "";

            }
        );

    });



    /* =========================================================
       17. ESCAPE KEY
    ========================================================= */

    document.addEventListener(
        "keydown",
        (event) => {

            if (event.key !== "Escape") {
                return;
            }


            closeNotificationPanel();


            body.classList.remove(
                "sidebar-open"
            );

        }
    );



    /* =========================================================
       18. PREVENT SEARCH SHORTCUTS FROM INTERFERING
    ========================================================= */

    document.addEventListener(
        "keydown",
        (event) => {

            /*
             Ctrl + K / Cmd + K
             focuses dashboard search.
            */

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "k"
            ) {

                event.preventDefault();


                if (searchInput) {

                    searchInput.focus();

                }

            }

        }
    );



    /* =========================================================
       19. SMOOTH CARD HOVER
    ========================================================= */

    const statCards =
        document.querySelectorAll(
            ".stat-card"
        );


    statCards.forEach(card => {

        card.addEventListener(
            "mouseenter",
            () => {

                card.style.transition =
                    "transform 0.25s ease, box-shadow 0.25s ease";

            }
        );

    });



    /* =========================================================
       20. LOG DASHBOARD READY
    ========================================================= */

    console.log(
        "Famipet Dashboard loaded successfully."
    );

});