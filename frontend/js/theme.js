/* =========================================================
   FAMIPET - GLOBAL THEME
   ☀️ = LIGHT MODE
   🌙 = DARK MODE
========================================================= */

(function () {

    "use strict";

    const THEME_KEY = "famipetTheme";


    /* =========================================================
       GET THEME BUTTONS
    ========================================================= */

    function getThemeButtons() {

        return document.querySelectorAll(
            "#themeBtn, " +
            "#themeToggle, " +
            ".theme-btn, " +
            ".theme-toggle"
        );

    }


    /* =========================================================
       UPDATE ICONS
    ========================================================= */

    function updateIcons(isDark) {

        getThemeButtons().forEach(function (button) {

            const icon = button.querySelector("i");

            if (!icon) return;

            /* Remove BOTH icons first */
            icon.classList.remove(
                "fa-sun",
                "fa-moon",
                "fa-regular",
                "fa-solid"
            );


            /* ===============================================
               LIGHT = SUN
               DARK  = MOON
            =============================================== */

            if (isDark) {

                icon.classList.add(
                    "fa-regular",
                    "fa-moon"
                );

                button.setAttribute(
                    "aria-label",
                    "Switch to light mode"
                );

                button.setAttribute(
                    "title",
                    "Switch to light mode"
                );

            } else {

                icon.classList.add(
                    "fa-regular",
                    "fa-sun"
                );

                button.setAttribute(
                    "aria-label",
                    "Switch to dark mode"
                );

                button.setAttribute(
                    "title",
                    "Switch to dark mode"
                );

            }

        });

    }


    /* =========================================================
       APPLY THEME
    ========================================================= */

    function applyTheme(isDark) {

        document.body.classList.toggle(
            "dark-theme",
            isDark
        );


        /* Remove old theme class */
        document.body.classList.remove(
            "dark-mode"
        );


        /* Save */
        localStorage.setItem(
            THEME_KEY,
            isDark ? "dark" : "light"
        );


        /* Update icon */
        updateIcons(isDark);

    }


    /* =========================================================
       INITIALIZE
    ========================================================= */

    function initTheme() {

        const savedTheme =
            localStorage.getItem(THEME_KEY);


        const isDark =
            savedTheme === "dark";


        applyTheme(isDark);


        /* =====================================================
           CONNECT BUTTONS
        ===================================================== */

        getThemeButtons().forEach(function (button) {

            /* Prevent duplicate listeners */
            if (
                button.dataset.famipetTheme === "true"
            ) {
                return;
            }


            button.dataset.famipetTheme = "true";


            button.addEventListener(
                "click",
                function (event) {

                    event.preventDefault();
                    event.stopPropagation();


                    const currentlyDark =
                        document.body.classList.contains(
                            "dark-theme"
                        );


                    /* Toggle */
                    applyTheme(
                        !currentlyDark
                    );

                }
            );

        });

    }


    /* =========================================================
       START
    ========================================================= */

    if (
        document.readyState === "loading"
    ) {

        document.addEventListener(
            "DOMContentLoaded",
            initTheme
        );

    } else {

        initTheme();

    }


    /* =========================================================
       GLOBAL ACCESS
    ========================================================= */

    window.FamiPetTheme = {

        dark: function () {
            applyTheme(true);
        },

        light: function () {
            applyTheme(false);
        },

        toggle: function () {

            const isDark =
                document.body.classList.contains(
                    "dark-theme"
                );

            applyTheme(!isDark);

        }

    };

})();