/* =========================================================
   Famipet - PETGPT
   Frontend Chat Functionality
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       ELEMENTS
    ===================================================== */

    const messageInput =
        document.getElementById("messageInput");

    const sendBtn =
        document.getElementById("sendBtn");

    const chatMessages =
        document.getElementById("chatMessages");

    const quickQuestions =
        document.querySelectorAll(".quick-question");

    const topicItems =
        document.querySelectorAll(".topic-item");

    const findClinicBtn =
        document.getElementById("findClinicBtn");


    /* =====================================================
       INITIALIZE LUCIDE
    ===================================================== */

    if (window.lucide) {
        lucide.createIcons();
    }


    /* =====================================================
       CURRENT USER + CHAT PERSISTENCE
       (live name on the welcome card, saved conversation
        restored on reload)
    ===================================================== */

    const STORAGE_KEY =
        "annPetgptChat";

    const currentUser =
        FamiPetAPI.getUser();

    const currentUserName =
        (currentUser && currentUser.name) ||
        "";


    /* =====================================================
       AVATAR HELPERS
       Only a real uploaded image counts as a profile photo.
       Otherwise the chat shows the initials empty state.
    ===================================================== */

    function isRealAvatar(value) {
        return typeof value === "string" &&
            value.trim() !== "" &&
            !value.includes("user-profile.svg");
    }

    function getUserInitials() {
        return String(currentUserName || "Pet Parent")
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map(function (w) {
                return w[0].toUpperCase();
            })
            .join("") || "PP";
    }


    function setUserName() {

        const nameEl =
            document.getElementById(
                "petgptUserName"
            );

        if (nameEl && currentUserName) {

            nameEl.textContent =
                currentUserName;

        }

    }


    function saveChat() {

        if (!chatMessages) {
            return;
        }

        const messages =
            Array.from(
                chatMessages.querySelectorAll(".message")
            ).map(msg => ({

                role:
                    msg.classList.contains("user-message")
                        ? "user"
                        : "ai",

                text:
                    (msg.querySelector(".message-bubble p") || {}).textContent || ""

            })).filter(item => item.text);

        if (!messages.length) {
            return;
        }

        try {

            localStorage.setItem(
                STORAGE_KEY,
                JSON.stringify(messages.slice(-100))
            );

        } catch (err) {
        }

    }


    function restoreChat() {

        if (!chatMessages) {
            return;
        }

        let saved = [];

        try {

            saved =
                JSON.parse(
                    localStorage.getItem(STORAGE_KEY) || "[]"
                );

        } catch (err) {
            saved = [];
        }

        if (
            !Array.isArray(saved) ||
            !saved.length
        ) {
            return;
        }

        saved.forEach(item => {

            if (item.role === "user") {

                addUserMessage(
                    typeof item.text === "string"
                        ? item.text
                        : ""
                );

            } else {

                addAIMessage(
                    typeof item.text === "string"
                        ? item.text
                        : ""
                );

            }

        });

        scrollToBottom();

    }


    /* =====================================================
       USER PROFILE IMAGE
       IMPORTANT FIX
    ===================================================== */

    function getUserAvatarSource() {

        /*
         * First try to get the profile image that is already
         * being used by the universal sidebar.
         *
         * This prevents the newly-created chat message from
         * using a broken relative image path.
         */

        const sidebarImage =
            document.querySelector(
                "#sidebar-container .profile-avatar img"
            );

        if (
            sidebarImage &&
            sidebarImage.src
        ) {

            return sidebarImage.src;

        }


        /*
         * Fallback to the logged-in user's own avatar
         * (empty means: no photo — use initials).
         */

        const userAvatar =
            (currentUser &&
                isRealAvatar(currentUser.avatar)) ?
                    currentUser.avatar
                    : "";

        return userAvatar;

    }


    /* =====================================================
       TIME
    ===================================================== */

    function getCurrentTime() {

        return new Date().toLocaleTimeString(
            "en-IN",
            {
                hour: "numeric",
                minute: "2-digit"
            }
        );

    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(value = "") {

        const div =
            document.createElement("div");

        div.textContent = value;

        return div.innerHTML;

    }


    /* =====================================================
       SCROLL CHAT TO BOTTOM
    ===================================================== */

    function scrollToBottom() {

        if (!chatMessages) {
            return;
        }

        requestAnimationFrame(() => {

            chatMessages.scrollTop =
                chatMessages.scrollHeight;

        });

    }


    /* =====================================================
       CREATE USER MESSAGE
    ===================================================== */

    function addUserMessage(text) {

        const message =
            document.createElement("div");

        message.className =
            "message user-message";


        /*
         * Get the SAME profile image used by
         * the sidebar.
         */

        const avatarSource =
            getUserAvatarSource();

        const hasAvatar =
            isRealAvatar(avatarSource);


        message.innerHTML = `

            <div class="message-bubble">

                <p>
                    ${escapeHTML(text)}
                </p>

                <small>

                    ${getCurrentTime()}

                    <span class="checks">
                        ✓✓
                    </span>

                </small>

            </div>


            <div class="user-avatar">

                ${
                    hasAvatar
                        ? `<img
                               src="${avatarSource}"
                               alt="${escapeHTML(currentUserName) || "User"}"
                               draggable="false"
                           >`
                        : `<span class="user-initials">
                               ${getUserInitials()}
                           </span>`
                }

            </div>

        `;


        chatMessages.appendChild(message);


        /*
         * Extra protection:
         * If the image somehow fails, copy the
         * sidebar image directly.
         */

        const newAvatar =
            message.querySelector(
                ".user-avatar img"
            );

        if (newAvatar) {

            newAvatar.addEventListener(
                "error",
                () => {

                    const sidebarImage =
                        document.querySelector(
                            "#sidebar-container .profile-avatar img"
                        );

                    if (
                        sidebarImage &&
                        sidebarImage.src &&
                        newAvatar.src !== sidebarImage.src
                    ) {

                        newAvatar.src =
                            sidebarImage.src;

                    }

                },
                {
                    once: true
                }
            );

        }


        scrollToBottom();

    }


    /* =====================================================
       CREATE AI MESSAGE
       MINI ROBOT
    ===================================================== */

    function addAIMessage(text) {

        const message =
            document.createElement("div");

        message.className =
            "message ai-message";


        message.innerHTML = `

            <div class="ai-avatar">

                <div class="mini-robot">

                    <div class="mini-eye"></div>

                    <div class="mini-eye"></div>

                    <div class="mini-smile"></div>

                </div>

            </div>


            <div class="message-bubble">

                <p>
                    ${escapeHTML(text)}
                </p>

                <small>
                    ${getCurrentTime()}
                </small>

            </div>

        `;


        chatMessages.appendChild(message);

        scrollToBottom();

    }


    /* =====================================================
       TOOL CONFIRMATION CARD (Phase 10 AI Tool Layer)
       Rendered when PetGPT proposes a data-changing action.
       Confirm -> POST /ai/tools/confirm (executes ONCE)
       Cancel  -> POST /ai/tools/cancel  (invalidates token)
    ===================================================== */

    const TOOL_LABELS = {

        create_pet: "Add a pet",

        update_pet: "Update a pet",

        update_diet: "Update diet profile",

        create_reminder: "Add a reminder",

        update_reminder: "Update a reminder"

    };


    function toolLabel(tool) {

        return TOOL_LABELS[tool] || (tool || "Action");

    }


    function fieldsToList(fields) {

        if (!fields || typeof fields !== "object") {

            return "";

        }

        const entries =
            Object.entries(fields)
                .filter(([, value]) =>
                    value !== undefined &&
                    value !== null &&
                    value !== "" &&
                    !(Array.isArray(value) && !value.length)
                );

        if (!entries.length) {

            return "";

        }

        return entries
            .map(([key, value]) => {
                const pretty =
                    Array.isArray(value) ?
                        value.map(v => (v && v.time ? `${v.label || "Meal"} ${v.time}` : v)).join(", ")
                        : typeof value === "object" ?
                            JSON.stringify(value)
                            : value;
                return `<li><strong>${escapeHTML(key)}:</strong> ${escapeHTML(String(pretty))}</li>`;
            })
            .join("");

    }


    function markCardFinal(card, note) {

        const buttons =
            card.querySelector(".tool-actions");

        if (buttons) {

            buttons.remove();

        }

        const label =
            card.querySelector(".tool-note");

        if (label) {

            label.textContent = note;

        }

    }


    function setCardBusy(card, busy, doneLabel) {

        const buttons =
            card.querySelectorAll(".tool-action-btn");

        buttons.forEach(btn => {
            btn.disabled = busy;
            if (busy && doneLabel && btn.classList.contains("confirm")) {
                btn.textContent = doneLabel;
            }
        });

    }


    async function runToolConfirm(card, action, confirm) {

        const token =
            action &&
            action.confirmation &&
            action.confirmation.token;

        if (!token) {

            markCardFinal(card, "Confirmation expired — please ask PetGPT again.");

            return;

        }

        setCardBusy(card, true, confirm ? "Confirming…" : "Cancelling…");

        const path =
            confirm ? "/ai/tools/confirm" : "/ai/tools/cancel";

        try {

            const data =
                await FamiPetAPI.post(path, { token });

            const note =
                confirm ?
                    (data.message || "Action completed.") :
                    (data.message || "Action cancelled.");

            markCardFinal(card, note);

            if (confirm && data && data.data && data.data.guidanceOfPet) {

                return;

            }

        } catch (err) {

            markCardFinal(
                card,
                confirm ? "This action could not be completed." : "Could not cancel that action."
            );

            return;

        }

        if (confirm) {

            scrollToBottom();

        }

    }


    function addToolActionCard(action) {

        if (!chatMessages || !action || !action.preview) {

            return;

        }

        const wrapper =
            document.createElement("div");

        wrapper.className =
            "message ai-message tool-message";


        const summary =
            action.preview.summary || toolLabel(action.action);

        const details =
            fieldsToList(action.preview.fields);

        const confirmBtnLabel = "Confirm";
        const cancelBtnLabel  = "Cancel";


        wrapper.innerHTML = `

            <div class="ai-avatar">

                <div class="mini-robot">

                    <div class="mini-eye"></div>

                    <div class="mini-eye"></div>

                    <div class="mini-smile"></div>

                </div>

            </div>


            <div class="message-bubble">

                <div class="tool-action-card">

                    <div class="tool-action-heading">

                        <span class="tool-action-icon">⚡</span>

                        <span>Proposed action</span>

                    </div>

                    <h4 class="tool-action-title">
                        ${escapeHTML(toolLabel(action.action))}
                    </h4>

                    <p class="tool-action-summary">
                        ${escapeHTML(summary)}
                    </p>

                    ${details ? `<ul class="tool-action-list">${details}</ul>` : ""}

                    <p class="tool-action-note tool-note">
                        Would you like me to go ahead?
                    </p>

                    <div class="tool-actions">

                        <button
                            type="button"
                            class="tool-action-btn confirm"
                            data-confirm="true"
                        >
                            ${confirmBtnLabel}
                        </button>


                        <button
                            type="button"
                            class="tool-action-btn cancel"
                            data-confirm="false"
                        >
                            ${cancelBtnLabel}
                        </button>

                    </div>

                </div>

                <small>
                    ${getCurrentTime()}
                </small>

            </div>

        `;


        const confirmBtn =
            wrapper.querySelector(".tool-action-btn[data-confirm='true']");

        const cancelBtn =
            wrapper.querySelector(".tool-action-btn[data-confirm='false']");


        if (confirmBtn) {

            confirmBtn.addEventListener("click", () => {
                runToolConfirm(wrapper, action, true);
            });

        }


        if (cancelBtn) {

            cancelBtn.addEventListener("click", () => {
                runToolConfirm(wrapper, action, false);
            });

        }


        chatMessages.appendChild(wrapper);

        scrollToBottom();

    }


    /* =====================================================
       TYPING INDICATOR
       MINI ROBOT
    ===================================================== */

    function showTyping() {

        /*
         * Don't create duplicate typing indicators.
         */

        if (
            document.getElementById(
                "typingIndicator"
            )
        ) {

            return;

        }


        const typing =
            document.createElement("div");

        typing.className =
            "message ai-message typing-message";

        typing.id =
            "typingIndicator";


        typing.innerHTML = `

            <div class="ai-avatar">

                <div class="mini-robot">

                    <div class="mini-eye"></div>

                    <div class="mini-eye"></div>

                    <div class="mini-smile"></div>

                </div>

            </div>


            <div class="message-bubble">

                <div class="typing-dots">

                    <span></span>

                    <span></span>

                    <span></span>

                </div>

            </div>

        `;


        chatMessages.appendChild(typing);

        scrollToBottom();

    }


    /* =====================================================
       REMOVE TYPING
    ===================================================== */

    function removeTyping() {

        const typing =
            document.getElementById(
                "typingIndicator"
            );

        if (typing) {

            typing.remove();

        }

    }


    /* =====================================================
       SEND MESSAGE
    ===================================================== */

    function sendMessage(text = null) {

        if (!messageInput) {
            return;
        }


        const question =
            text !== null
                ? text.trim()
                : messageInput.value.trim();


        if (!question) {
            return;
        }


        if (question.length > 2000) {

            addAIMessage(
                "Your question is a bit too long. Please keep it under 2000 characters."
            );

            return;

        }


        /* ADD USER MESSAGE */

        addUserMessage(question);


        /* PERSIST CHAT */

        saveChat();


        /* CLEAR INPUT */

        messageInput.value = "";


        /* SHOW TYPING */

        showTyping();


        /* ASK BACKEND AI */

        FamiPetAPI.post(
            "/ai/ask",
            {
                message: question
            }
        ).then((data) => {

            removeTyping();

            const reply =
                data && typeof data.message === "string"
                    ? data.message
                    : "";

            addAIMessage(
                reply ||
                "I couldn't get a proper response from PetGPT. Please try again."
            );

            if (data && data.action && data.action.requiresConfirmation) {

                addToolActionCard(data.action);

            }

            saveChat();

        }).catch(() => {

            removeTyping();

            addAIMessage(
                "I couldn't reach the AI service right now. Please try again in a moment."
            );

            saveChat();

        });

    }


    /* =====================================================
       SEND BUTTON
    ===================================================== */

    if (sendBtn) {

        sendBtn.addEventListener(
            "click",
            () => {

                sendMessage();

            }
        );

    }


    /* =====================================================
       ENTER KEY
    ===================================================== */

    if (messageInput) {

        messageInput.addEventListener(
            "keydown",
            event => {

                if (
                    event.key === "Enter" &&
                    !event.shiftKey
                ) {

                    event.preventDefault();

                    sendMessage();

                }

            }
        );

    }


    /* =====================================================
       QUICK QUESTIONS
    ===================================================== */

    quickQuestions.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const question =
                    button.dataset.question;

                if (question) {

                    sendMessage(question);

                }

            }
        );

    });


    /* =====================================================
       POPULAR TOPICS
    ===================================================== */

    topicItems.forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const question =
                    button.dataset.question;

                if (question) {

                    sendMessage(question);

                }

            }
        );

    });


    /* =====================================================
       FIND NEARBY
    ===================================================== */

    if (findClinicBtn) {

        findClinicBtn.addEventListener(
            "click",
            async () => {

                try {

                    const data =
                        await FamiPetAPI.get(
                            "/veterinarians"
                        );

                    const vets =
                        data.veterinarians || [];

                    if (!vets.length) {

                        alert(
                            "No nearby pet clinics available right now."
                        );

                        return;
                    }

                    alert(
                        vets.slice(0, 5).map(v =>
                            `${v.name} – ${
                                v.clinic || "Pet Clinic"
                            } (${
                                v.city || "City"
                            }${
                                v.phone
                                    ? ", " + v.phone
                                    : ""
                            })`
                        ).join("\n")
                    );

                } catch (err) {

                    alert(
                        "Could not load nearby pet clinics."
                    );
                }

            }
        );

    }


    /* =====================================================
       LIVE WELCOME NAME + RESTORE SAVED CHAT
    ===================================================== */

    setUserName();
    restoreChat();


    /* =====================================================
       AI SUGGESTIONS PANEL (Phase 11 Recommendations)
       Loads /ai/recommendations on page load, renders each
       informational item, and lets the user Accept a suggested
       action -> POST /ai/action (a Phase 10 proposal) -> the
       existing chat confirmation card appears for confirm.
    ===================================================== */

    const suggestionsList =
        document.getElementById("suggestionsList");

    function suggestionCategoryLabel(category) {

        return String(category || "care")
            .replace(/_/g, " ")
            .toLowerCase()
            .split(" ")
            .map(function (word) {
                return word
                    .charAt(0)
                    .toUpperCase() +
                    word.slice(1);
            })
            .join(" ");

    }


    function markSuggestionAccepted(el) {

        el.classList.add("suggested");

        const errorNote =
            el.querySelector(".suggestion-error");

        if (errorNote) {

            errorNote.remove();

        }

    }


    function renderSuggestionItems(items) {

        if (!suggestionsList) {

            return;

        }

        if (
            !Array.isArray(items) ||
            !items.length
        ) {

            suggestionsList.innerHTML =
                `<p class="suggestions-empty">` +
                `No suggestions right now. Add a pet and PetGPT ` +
                `will tailor care tips to your family.` +
                `</p>`;

            return;

        }

        suggestionsList.innerHTML = "";

        items.forEach(item => {

            if (!item || !item.title) {

                return;

            }

            const el =
                document.createElement("div");

            el.className =
                "suggestion-item";

            const petName =
                item.pet && item.pet.name
                    ? escapeHTML(item.pet.name)
                    : "Family";

            const hasAction =
                item.action &&
                item.action.tool;

            el.innerHTML = `

                <div class="suggestion-head">

                    <span class="suggestion-pet">
                        ${petName}
                    </span>

                    <span class="suggestion-chip">
                        ${escapeHTML(suggestionCategoryLabel(item.category))}
                    </span>

                </div>

                <h4 class="suggestion-title">
                    ${escapeHTML(item.title)}
                </h4>

                <p class="suggestion-summary">
                    ${escapeHTML(item.summary)}
                </p>

                ${
                    item.detail
                        ? `<p class="suggestion-detail">
                               ${escapeHTML(item.detail)}
                           </p>`
                        : ""
                }

                ${
                    hasAction
                        ? `<div class="suggestion-actions">
                               <button
                                   type="button"
                                   class="suggestion-accept-btn"
                               >
                                   Accept
                               </button>
                           </div>`
                        : ""
                }

            `;

            if (hasAction) {

                const btn =
                    el.querySelector(
                        ".suggestion-accept-btn"
                    );

                btn.addEventListener(
                    "click",
                    () => {

                        acceptSuggestion(
                            item,
                            el,
                            btn
                        );

                    }
                );

            }

            suggestionsList.appendChild(el);

        });

    }


    function showSuggestionError(el, btn, message) {

        const existing =
            el.querySelector(".suggestion-error");

        if (existing) {

            existing.remove();

        }

        const note =
            document.createElement("p");

        note.className =
            "suggestion-error";

        note.textContent =
            message ||
            "Could not propose this action.";

        el.appendChild(note);

        btn.disabled = false;

        btn.textContent = "Accept";

    }


    async function acceptSuggestion(item, el, btn) {

        btn.disabled = true;

        btn.textContent = "Proposing…";

        try {

            const data =
                await FamiPetAPI.post(
                    "/ai/action",
                    {
                        tool: item.action.tool,
                        args: item.action.args
                    }
                );

            if (
                data &&
                data.requiresConfirmation &&
                data.confirmation
            ) {

                markSuggestionAccepted(el);

                btn.textContent =
                    "Proposed — check chat";

                addToolActionCard(data);

                return;

            }

            showSuggestionError(
                el,
                btn,
                (data && data.message) ||
                    "This action was not accepted."
            );

        } catch (err) {

            showSuggestionError(
                el,
                btn,
                (err && err.message) ||
                    "Could not propose this action."
            );

        }

    }


    async function loadSuggestions() {

        if (!suggestionsList) {

            return;

        }

        try {

            const data =
                await FamiPetAPI.get(
                    "/ai/recommendations"
                );

            renderSuggestionItems(
                data && data.recommendations
            );

        } catch (err) {

            suggestionsList.innerHTML =
                `<p class="suggestions-empty">` +
                `Suggestions unavailable right now.` +
                `</p>`;

        }

    }


    loadSuggestions();


    /* =====================================================
       INITIAL SCROLL
    ===================================================== */

    scrollToBottom();

});