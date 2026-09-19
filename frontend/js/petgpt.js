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
       INITIAL SCROLL
    ===================================================== */

    scrollToBottom();

});