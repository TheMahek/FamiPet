/* =========================================================
   Famipet SETTINGS
   Profile + Preferences + Security
   No Alert Popups
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    () => {


        /* =====================================================
           DEFAULT PROFILE
        ===================================================== */

        const DEFAULT_PROFILE = {

            name:
                "Pet Parent",

            email:
                "",

            phone:
                "",

            location:
                "",

            role:
                "Pet Parent",

            image:
                ""

        };


        /* =====================================================
           AVATAR HELPERS
           Only real uploaded images count as a profile photo.
           The old default placeholder (user-profile.svg) and empty
           values always map to the empty profile state (initials).
        ===================================================== */

        function isRealAvatar(value) {

            if (
                typeof FamiPetAPI !== "undefined" &&
                typeof FamiPetAPI.isRealAvatar === "function"
            ) {
                return FamiPetAPI.isRealAvatar(value);
            }

            return typeof value === "string" &&
                value.trim() !== "" &&
                !value.includes("user-profile.svg");

        }


        function resolveAvatar(value) {

            if (
                typeof FamiPetAPI !== "undefined" &&
                typeof FamiPetAPI.resolveAvatarUrl === "function"
            ) {
                return FamiPetAPI.resolveAvatarUrl(value);
            }

            return isRealAvatar(value)
                ? String(value).trim()
                : "";

        }


        function getInitials(name) {

            const clean =
                String(name || "").trim();

            if (!clean) return "PP";

            return clean
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map(function (w) {
                    return w[0].toUpperCase();
                })
                .join("");

        }


        /* =====================================================
           RENDER SETTINGS AVATAR
           Shows the uploaded photo when one exists, otherwise the
           initials empty state. Never a default placeholder.
        ===================================================== */

        function renderSettingsAvatar(image, name) {

            if (!settingsProfileImage) {
                return;
            }

            const initialsEl =
                document.getElementById(
                    "settingsProfileInitials"
                );

            const resolved =
                resolveAvatar(image);

            const hasImage =
                !!resolved;

            settingsProfileImage.dataset.avatarName =
                name || "";

            settingsProfileImage.hidden =
                !hasImage;

            if (initialsEl) {

                initialsEl.style.display =
                    hasImage
                        ? "none"
                        : "";

                initialsEl.textContent =
                    hasImage
                        ? ""
                        : getInitials(
                            name
                        );

            }

            if (hasImage) {

                settingsProfileImage.src =
                    resolved;

                settingsProfileImage.alt =
                    name || "Profile";

            }

        }


        /* =====================================================
           PROFILE CACHE KEY
           The cached profile (including the avatar image) is
           scoped to the logged-in user so one account's picture
           is NEVER shown for another account. If no user id is
           available the legacy shared key is ignored.
        ===================================================== */

        function profileCacheKey() {

            const currentUser =
                (typeof FamiPetAPI !== "undefined")
                    ? FamiPetAPI.getUser()
                    : null;

            const uid =
                (currentUser &&
                    (currentUser.id || currentUser._id))
                || "";

            return uid
                ? "annProfile." + uid
                : "annProfile";

        }


        /* =====================================================
           GET PROFILE
        ===================================================== */

        function getProfile() {

            try {

                const key =
                    profileCacheKey();

                if (
                    key === "annProfile"
                ) {

                    return {
                        ...DEFAULT_PROFILE
                    };

                }


                const saved =
                    localStorage.getItem(
                        key
                    );


                if (saved) {

                    return {

                        ...DEFAULT_PROFILE,

                        ...JSON.parse(saved)

                    };

                }

            } catch (error) {

                console.warn(
                    "Could not load profile."
                );

            }


            return {
                ...DEFAULT_PROFILE
            };

        }


        /* =====================================================
           SAVE PROFILE
        ===================================================== */

        function saveProfile(profile) {

            try {

                const key =
                    profileCacheKey();

                if (
                    key === "annProfile"
                ) {

                    return;

                }


                localStorage.setItem(
                    key,
                    JSON.stringify(profile)
                );

            } catch (error) {

                console.warn(
                    "Could not save profile."
                );

            }

        }


        /* =====================================================
           CURRENT PROFILE
        ===================================================== */

        let currentProfile =
            getProfile();


        /* =====================================================
           INITIALIZE LUCIDE
        ===================================================== */

        if (window.lucide) {

            lucide.createIcons();

        }


        /* =====================================================
           ELEMENTS
        ===================================================== */

        const backDashboardBtn =
            document.getElementById(
                "backDashboardBtn"
            );


        const saveProfileBtn =
            document.getElementById(
                "saveProfileBtn"
            );


        const changePhotoBtn =
            document.getElementById(
                "changePhotoBtn"
            );


        const profileImageInput =
            document.getElementById(
                "profileImageInput"
            );


        const settingsProfileImage =
            document.getElementById(
                "settingsProfileImage"
            );


        /* If the stored photo cannot be loaded, fall back to the
           initials empty state instead of a broken image. */

        if (settingsProfileImage) {

            settingsProfileImage.addEventListener(
                "error",
                function () {

                    settingsProfileImage.hidden =
                        true;

                    const initialsEl =
                        document.getElementById(
                            "settingsProfileInitials"
                        );

                    if (initialsEl) {

                        initialsEl.style.display =
                            "";

                        initialsEl.textContent =
                            getInitials(
                                settingsProfileImage
                                    .dataset
                                    .avatarName
                            );

                    }

                }
            );

        }


        const updatePasswordBtn =
            document.getElementById(
                "updatePasswordBtn"
            );


        const managePetsBtn =
            document.getElementById(
                "managePetsBtn"
            );


        const deleteAccountBtn =
            document.getElementById(
                "deleteAccountBtn"
            );


        const language =
            document.getElementById(
                "language"
            );


        /* =====================================================
           FORM ELEMENTS
        ===================================================== */

        const fullName =
            document.getElementById(
                "fullName"
            );


        const email =
            document.getElementById(
                "email"
            );


        const phone =
            document.getElementById(
                "phone"
            );


        const location =
            document.getElementById(
                "location"
            );


        /* =====================================================
           LOAD PROFILE INTO SETTINGS
        ===================================================== */

        if (fullName) {

            fullName.value =
                currentProfile.name;

        }


        if (email) {

            email.value =
                currentProfile.email || "";

        }


        if (phone) {

            phone.value =
                currentProfile.phone || "";

        }


        if (location) {

            location.value =
                currentProfile.location ||
                "";

        }


        if (settingsProfileImage) {

            renderSettingsAvatar(
                currentProfile.image,
                currentProfile.name
            );

        }


        /* =====================================================
           LOAD PROFILE FROM BACKEND
        ===================================================== */

        async function loadBackendProfile() {

            try {

                const data =
                    await FamiPetAPI.get(
                        "/auth/me"
                    );

                const u =
                    data.user;

                currentProfile = {

                    name:
                        u.name || "Pet Parent",

                    email:
                        u.email || "",

                    phone:
                        u.phone || "",

                    location:
                        u.city ||
                        u.address ||
                        "",

                    role:
                        u.role === "admin"
                            ? "Admin"
                            : "Pet Parent",

                    image:
                        resolveAvatar(u.avatar)

                };


                if (fullName) {
                    fullName.value =
                        currentProfile.name;
                }

                if (email) {
                    email.value =
                        currentProfile.email;
                }

                if (phone) {
                    phone.value =
                        currentProfile.phone;
                }

                if (location) {
                    location.value =
                        currentProfile.location;
                }

                if (settingsProfileImage) {
                    renderSettingsAvatar(
                        currentProfile.image,
                        currentProfile.name
                    );
                }


                saveProfile(
                    currentProfile
                );


                if (
                    typeof window.updateANNProfile ===
                    "function"
                ) {

                    window.updateANNProfile(
                        currentProfile
                    );

                }


                const apiUser =
                    FamiPetAPI.getUser() || {};

                FamiPetAPI.setUser({
                    ...apiUser,
                    ...u
                });

            } catch (err) {

                console.warn(
                    "Could not load profile from backend:",
                    err && err.message
                );

            }

        }


        loadBackendProfile();


        /* =====================================================
           BACK TO DASHBOARD
        ===================================================== */

        if (backDashboardBtn) {

            backDashboardBtn.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "dashboard.html";

                }
            );

        }


        /* =====================================================
           CHANGE PROFILE PHOTO
        ===================================================== */

        if (
            changePhotoBtn &&
            profileImageInput
        ) {

            changePhotoBtn.addEventListener(
                "click",
                () => {

                    profileImageInput.click();

                }
            );

        }


        /* =====================================================
           PROFILE IMAGE PREVIEW
        ===================================================== */

        if (profileImageInput) {

            profileImageInput.addEventListener(
                "change",
                event => {

                    const file =
                        event.target.files?.[0];


                    if (!file) {

                        return;

                    }


                    /* ONLY IMAGE FILES */

                    if (
                        !file.type.startsWith(
                            "image/"
                        )
                    ) {

                        profileImageInput.value =
                            "";

                        return;

                    }


                    const reader =
                        new FileReader();


                    reader.onload =
                        event => {

                            const imageData =
                                event.target.result;


                            if (
                                settingsProfileImage
                            ) {

                                settingsProfileImage.hidden =
                                    false;

                                settingsProfileImage.src =
                                    imageData;

                                const initialsEl =
                                    document.getElementById(
                                        "settingsProfileInitials"
                                    );

                                if (initialsEl) {

                                    initialsEl.style.display =
                                        "none";

                                }

                            }


                            /*
                               Keep image ready
                               before Save Changes.
                            */

                            currentProfile.image =
                                imageData;

                        };


                    reader.readAsDataURL(file);

                }
            );

        }


        /* =====================================================
           SAVE PROFILE
        ===================================================== */

        if (saveProfileBtn) {

            saveProfileBtn.addEventListener(
                "click",
                () => {


                    const name =
                        fullName
                            ? fullName.value.trim()
                            : "";


                    const userEmail =
                        email
                            ? email.value.trim()
                            : "";


                    const userPhone =
                        phone
                            ? phone.value.trim()
                            : "";


                    const userLocation =
                        location
                            ? location.value.trim()
                            : "";


                    /*
                       If name is empty,
                       simply focus the field.
                       NO ALERT.
                    */

                    if (!name) {

                        if (fullName) {

                            fullName.focus();

                        }

                        return;

                    }


                    /*
                       SAVE PROFILE
                    */

                    currentProfile = {

                        ...currentProfile,

                        name:
                            name,

                        email:
                            userEmail,

                        phone:
                            userPhone,

                        location:
                            userLocation,

                        role:
                            "Pet Parent"

                    };


                    saveProfile(
                        currentProfile
                    );


                    /* =================================================
                       SAVE PROFILE TO BACKEND
                    ================================================= */

                    (async () => {

                        try {

                            let avatar =
                                currentProfile.image;

                            const isDataURL =
                                typeof avatar === "string" &&
                                avatar.startsWith("data:");

                            if (isDataURL) {

                                const blob =
                                    await (await fetch(avatar)).blob();

                                const fd =
                                    new FormData();

                                fd.append(
                                    "avatar",
                                    blob,
                                    "avatar.png"
                                );

                                const upRes =
                                    await FamiPetAPI.request(
                                        "/users/avatar",
                                        {
                                            method: "POST",
                                            body: fd
                                        }
                                    );

                                avatar =
                                    upRes.avatar || avatar;

                                currentProfile.image =
                                    avatar;

                            }

                            /*
                               Only keep an avatar value that is a real
                               uploaded image (a dataURL or a server URL).
                               The default placeholder SVG must never be
                               saved as the user's avatar, otherwise every
                               account that saves settings without uploading
                               a photo ends up with the SAME placeholder
                               stored in the database.
                            */

                            const isPlaceholder =
                                typeof avatar === "string" &&
                                (
                                    avatar.includes("user-profile.svg") ||
                                    avatar === ""
                                );

                            const upd =
                                await FamiPetAPI.put(
                                    "/auth/profile",
                                    {
                                        name: name,
                                        phone: userPhone,
                                        address: "",
                                        city: userLocation,
                                        avatar:
                                            isPlaceholder
                                                ? ""
                                                : avatar
                                    }
                                );


                            const u =
                                upd.user || {};

                            const apiUser =
                                FamiPetAPI.getUser() || {};

                            FamiPetAPI.setUser({
                                ...apiUser,
                                name: u.name || apiUser.name,
                                phone: u.phone || apiUser.phone,
                                address: u.address || apiUser.address,
                                city: u.city || apiUser.city,
                                avatar:
                                    (u.avatar && !String(u.avatar).includes("user-profile.svg"))
                                        ? u.avatar
                                        : (apiUser.avatar && !String(apiUser.avatar).includes("user-profile.svg"))
                                            ? apiUser.avatar
                                            : "",
                                role: u.role || apiUser.role,
                                email: u.email || apiUser.email,
                            });

                        } catch (err) {

                            console.warn(
                                "Could not sync profile to backend:",
                                err && err.message
                            );

                        }

                    })();


                    /* =================================================
                       UPDATE SETTINGS PAGE
                    ================================================= */

                    if (
                        settingsProfileImage
                    ) {

                        renderSettingsAvatar(
                            currentProfile.image,
                            currentProfile.name
                        );

                    }


                    /* =================================================
                       UPDATE SIDEBAR
                    ================================================= */

                    if (
                        typeof window.updateANNProfile ===
                        "function"
                    ) {

                        window.updateANNProfile(
                            currentProfile
                        );

                    }


                    /*
                       Send event too.
                       Useful if sidebar or another
                       component is listening.
                    */

                    window.dispatchEvent(
                        new CustomEvent(
                            "annProfileUpdated",
                            {
                                detail:
                                    currentProfile
                            }
                        )
                    );


                    /*
                       BUTTON FEEDBACK
                       NO ALERT / POPUP
                    */

                    const originalHTML =
                        saveProfileBtn.innerHTML;


                    saveProfileBtn.innerHTML = `

                        <i data-lucide="check"></i>

                        Saved

                    `;


                    saveProfileBtn.classList.add(
                        "saved"
                    );


                    if (window.lucide) {

                        lucide.createIcons();

                    }


                    setTimeout(
                        () => {

                            saveProfileBtn.innerHTML =
                                originalHTML;


                            saveProfileBtn.classList.remove(
                                "saved"
                            );


                            if (window.lucide) {

                                lucide.createIcons();

                            }

                        },
                        1500
                    );

                }
            );

        }


        /* =====================================================
           LANGUAGE
           ENGLISH ONLY
        ===================================================== */

        if (language) {

            language.innerHTML = `

                <option value="english">
                    English
                </option>

            `;


            language.value =
                "english";


            language.disabled =
                true;

        }

/* =====================================================
   COUNTRY
   INDIA ONLY
===================================================== */

const country =
    document.getElementById("country");

if (country) {

    country.innerHTML = `
        <option value="india">
            India
        </option>
    `;

    country.value = "india";

    country.disabled = true;
}
        /* =====================================================
           PASSWORD SHOW / HIDE
        ===================================================== */

        const passwordButtons =
            document.querySelectorAll(
                ".password-eye"
            );


        passwordButtons.forEach(
            button => {

                button.addEventListener(
                    "click",
                    () => {

                        const targetId =
                            button.dataset.target;


                        const input =
                            document.getElementById(
                                targetId
                            );


                        if (!input) {

                            return;

                        }


                        if (
                            input.type ===
                            "password"
                        ) {

                            input.type =
                                "text";


                            button.innerHTML = `

                                <i
                                    data-lucide="eye-off"
                                ></i>

                            `;

                        }

                        else {

                            input.type =
                                "password";


                            button.innerHTML = `

                                <i
                                    data-lucide="eye"
                                ></i>

                            `;

                        }


                        if (window.lucide) {

                            lucide.createIcons();

                        }

                    }
                );

            }
        );


        /* =====================================================
           UPDATE PASSWORD
           NO ALERTS
        ===================================================== */

        if (updatePasswordBtn) {

            updatePasswordBtn.addEventListener(
                "click",
                async () => {

                    const currentPassword =
                        document.getElementById(
                            "currentPassword"
                        );


                    const newPassword =
                        document.getElementById(
                            "newPassword"
                        );


                    const confirmPassword =
                        document.getElementById(
                            "confirmPassword"
                        );


                    if (!currentPassword ||
                        !newPassword ||
                        !confirmPassword
                    ) {

                        return;

                    }


                    if (
                        !currentPassword.value
                    ) {

                        currentPassword.focus();

                        return;

                    }


                    if (
                        !newPassword.value
                    ) {

                        newPassword.focus();

                        return;

                    }


                    if (
                        newPassword.value.length < 6
                    ) {

                        newPassword.focus();

                        return;

                    }


                    if (
                        newPassword.value !==
                        confirmPassword.value
                    ) {

                        confirmPassword.focus();

                        return;

                    }

                    /* =================================================
                       UPDATE PASSWORD (BACKEND)
                    ================================================= */

                    try {

                        await FamiPetAPI.put(
                            "/auth/change-password",
                            {
                                currentPassword:
                                    currentPassword.value,
                                newPassword:
                                    newPassword.value
                            }
                        );

                    } catch (err) {

                        const msgBox =
                            document.getElementById(
                                "passwordMsg"
                            );

                        if (msgBox) {

                            msgBox.style.color =
                                "#EF4444";

                            msgBox.textContent =
                                (err && err.data && err.data.message) ||
                                "Could not update password. Please try again.";

                        }

                        return;

                    }


                    const msgBox =
                        document.getElementById(
                            "passwordMsg"
                        );

                    if (msgBox) {

                        msgBox.style.color =
                            "#38C976";

                        msgBox.textContent =
                            "Password updated successfully.";

                    }


                    currentPassword.value =
                        "";


                    newPassword.value =
                        "";


                    confirmPassword.value =
                        "";


                    /*
                       Temporary button feedback.
                       No popup.
                    */

                    const originalHTML =
                        updatePasswordBtn.innerHTML;


                    updatePasswordBtn.innerHTML = `

                        <i data-lucide="check"></i>

                        Updated

                    `;


                    if (window.lucide) {

                        lucide.createIcons();

                    }


                    setTimeout(
                        () => {

                            updatePasswordBtn.innerHTML =
                                originalHTML;


                            if (window.lucide) {

                                lucide.createIcons();

                            }

                        },
                        1500
                    );

                }
            );

        }


        /* =====================================================
           PREFERENCE TOGGLES
        ===================================================== */

        const toggles =
            document.querySelectorAll(
                '.toggle input:not([disabled])'
            );


        toggles.forEach(
            toggle => {

                /* Phase 5: backend-backed toggles (notification
                   preferences) are managed by js/notifications.js;
                   skip them here so localStorage never fights the
                   server-persisted value. */

                if (
                    toggle.hasAttribute(
                        "data-preferences"
                    )
                ) {
                    return;
                }


                const setting =
                    toggle.dataset.setting;


                const saved =
                    localStorage.getItem(
                        "annSetting_" +
                        setting
                    );


                if (
                    saved !== null
                ) {

                    toggle.checked =
                        saved === "true";

                }


                toggle.addEventListener(
                    "change",
                    () => {

                        const value =
                            toggle.checked;


                        localStorage.setItem(
                            "annSetting_" +
                            setting,
                            value
                        );

                    }
                );

            }
        );


        /* =====================================================
           MANAGE PETS
        ===================================================== */

        if (managePetsBtn) {

            managePetsBtn.addEventListener(
                "click",
                () => {

                    window.location.href =
                        "mypet.html";

                }
            );

        }


        /* =====================================================
           PET SUMMARY
        ===================================================== */

        const petItems =
            document.querySelectorAll(
                ".pet-summary-item"
            );


        petItems.forEach(
            pet => {

                pet.addEventListener(
                    "click",
                    () => {

                        window.location.href =
                            "mypet.html";

                    }
                );

            }
        );

/* =====================================================
   ACCOUNT ACTIONS
   SIGN OUT + PERMANENT DELETE
   No browser alerts / confirms
===================================================== */

if (deleteAccountBtn) {

    deleteAccountBtn.addEventListener(
        "click",
        () => {

            const existingBox =
                document.getElementById(
                    "accountActionBox"
                );

            if (existingBox) {
                return;
            }


            const actionBox =
                document.createElement("div");

            actionBox.id =
                "accountActionBox";

            actionBox.className =
                "account-action-overlay";


            actionBox.innerHTML = `

                <div class="account-action-modal">

                    <div class="account-action-icon">
                        <i data-lucide="log-out"></i>
                    </div>

                    <h3>
                        Account Options
                    </h3>

                    <p>
                        Choose what you would like
                        to do with your account.
                    </p>


                    <div class="account-options">

                        <!-- SIGN OUT -->

                        <button
                            type="button"
                            class="account-option signout-option"
                            id="signOutBtn"
                        >

                            <div class="account-option-icon">
                                <i data-lucide="log-out"></i>
                            </div>

                            <div class="account-option-text">

                                <strong>
                                    Sign Out
                                </strong>

                                <span>
                                    Sign out of your account.
                                    Your profile and data
                                    will remain saved.
                                </span>

                            </div>

                            <i
                                data-lucide="chevron-right"
                                class="account-option-arrow"
                            ></i>

                        </button>


                        <!-- PERMANENT DELETE -->

                        <button
                            type="button"
                            class="account-option delete-option"
                            id="permanentDeleteBtn"
                        >

                            <div class="account-option-icon">
                                <i data-lucide="trash-2"></i>
                            </div>

                            <div class="account-option-text">

                                <strong>
                                    Permanently Delete Account
                                </strong>

                                <span>
                                    Permanently remove your
                                    account and saved data.
                                </span>

                            </div>

                            <i
                                data-lucide="chevron-right"
                                class="account-option-arrow"
                            ></i>

                        </button>

                    </div>


                    <button
                        type="button"
                        class="close-account-options"
                        id="closeAccountOptions"
                    >
                        Cancel
                    </button>

                </div>

            `;


            document.body.appendChild(
                actionBox
            );


            if (window.lucide) {
                lucide.createIcons();
            }


            /* =================================================
               CLOSE
            ================================================= */

            const closeBtn =
                document.getElementById(
                    "closeAccountOptions"
                );


            closeBtn.addEventListener(
                "click",
                () => {

                    actionBox.remove();

                }
            );


            /* =================================================
               SIGN OUT
            ================================================= */

            const signOutBtn =
                document.getElementById(
                    "signOutBtn"
                );


            signOutBtn.addEventListener(
                "click",
                () => {

                    if (typeof FamiPetAPI !== "undefined") {

                        FamiPetAPI.logout();

                    }

                    sessionStorage.clear();


                    /*
                       Remove login/session data
                       if your project uses these.
                    */

                    localStorage.removeItem(
                        "annUser"
                    );

                    localStorage.removeItem(
                        "annSession"
                    );


                    /*
                       Redirect to login page.
                       Change this filename if your
                       login page has another name.
                    */

                    window.location.href =
                        "../pages/login.html";

                }
            );


            /* =================================================
               PERMANENT DELETE
            ================================================= */

            const permanentDeleteBtn =
                document.getElementById(
                    "permanentDeleteBtn"
                );


            permanentDeleteBtn.addEventListener(
                "click",
                () => {

                    /*
                       Change modal content to
                       final confirmation.
                    */

                    actionBox.innerHTML = `

                        <div class="account-action-modal">

                            <div class="account-action-icon danger">
                                <i data-lucide="triangle-alert"></i>
                            </div>

                            <h3>
                                Permanently Delete Account?
                            </h3>

                            <p>
                                This action cannot be undone.
                                Your saved profile and
                                account data will be removed.
                            </p>


                            <div class="delete-final-actions">

                                <button
                                    type="button"
                                    id="cancelPermanentDelete"
                                    class="cancel-delete-btn"
                                >
                                    Cancel
                                </button>


                                <button
                                    type="button"
                                    id="finalDeleteBtn"
                                    class="final-delete-btn"
                                >
                                    Permanently Delete
                                </button>

                            </div>

                        </div>

                    `;


                    if (window.lucide) {
                        lucide.createIcons();
                    }


                    /* =========================================
                       CANCEL DELETE
                    ========================================= */

                    document
                        .getElementById(
                            "cancelPermanentDelete"
                        )
                        .addEventListener(
                            "click",
                            () => {

                                actionBox.remove();

                            }
                        );


                    /* =========================================
                       FINAL DELETE
                    ========================================= */

                    document
                        .getElementById(
                            "finalDeleteBtn"
                        )
                        .addEventListener(
                            "click",
                            () => {

                                if (typeof FamiPetAPI !== "undefined") {

                                    FamiPetAPI.logout();

                                }


                                /*
                                   Remove profile
                                */

                                localStorage.removeItem(
                                    profileCacheKey()
                                );

                                localStorage.removeItem(
                                    "annProfile"
                                );


                                /*
                                   Remove Famipet settings
                                */

                                Object.keys(
                                    localStorage
                                ).forEach(
                                    key => {

                                        if (
                                            key.startsWith(
                                                "annSetting_"
                                            )
                                        ) {

                                            localStorage.removeItem(
                                                key
                                            );

                                        }

                                    }
                                );


                                /*
                                   Remove Famipet data
                                */

                                localStorage.removeItem(
                                    "annPets"
                                );

                                localStorage.removeItem(
                                    "annNotifications"
                                );

                                localStorage.removeItem(
                                    "annReminders"
                                );

                                localStorage.removeItem(
                                    "annUser"
                                );

                                localStorage.removeItem(
                                    "annSession"
                                );


                                /*
                                   Clear session
                                */

                                sessionStorage.clear();


                                /*
                                   Redirect
                                */

                                window.location.href =
                                    "../pages/signup.html";

                            }
                        );

                }
            );

        }

    );


        /* =====================================================
           INFORMATION LINKS
           NO ALERT POPUPS
        ===================================================== */

        const infoLinks =
            document.querySelectorAll(
                ".info-link"
            );


        infoLinks.forEach(
            link => {

                link.addEventListener(
                    "click",
                    () => {

                        /*
                           These pages are not connected yet.
                           No popup is shown.
                        */

                    }
                );

            }
        );


        /* =====================================================
           PROFILE SYNC
           If another page updates profile while
           Settings page is open.
        ===================================================== */

        window.addEventListener(
            "annProfileUpdated",
            event => {

                const updatedProfile =
                    event.detail;


                if (!updatedProfile) {

                    return;

                }


                currentProfile =
                    updatedProfile;


                if (fullName) {

                    fullName.value =
                        updatedProfile.name || "";

                }


                if (email) {

                    email.value =
                        updatedProfile.email || "";

                }


                if (phone) {

                    phone.value =
                        updatedProfile.phone || "";

                }


                if (location) {

                    location.value =
                        updatedProfile.location ||
                        "";

                }


                if (settingsProfileImage) {

                    renderSettingsAvatar(
                        updatedProfile.image ||
                        updatedProfile.avatar ||
                        "",
                        updatedProfile.name
                    );

                }

            }
        );


        /* =====================================================
           FINAL ICON REFRESH
        ===================================================== */

        if (window.lucide) {

            lucide.createIcons();

        }

    }
});