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
         * Fallback to the normal profile image path.
         */

        return new URL(
            "../assets/images/profile.jpg",
            document.baseURI
        ).href;

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

                <img
                    src="${avatarSource}"
                    alt="Mahek"
                    draggable="false"
                >

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
       PETGPT RESPONSES
    ===================================================== */

    function getResponse(question) {

        const q =
            question
                .toLowerCase()
                .trim();


        /* =================================================
           DOG FOOD
        ================================================= */

        if (
            q.includes("food") &&
            (
                q.includes("dog") ||
                q.includes("golden") ||
                q.includes("puppy")
            )
        ) {

            return (
                "Choose a complete and balanced dog food " +
                "appropriate for your pet's age, size and " +
                "activity level. For puppies, look for food " +
                "formulated specifically for growth. Fresh " +
                "water should always be available."
            );

        }


        /* =================================================
           KITTEN FOOD
        ================================================= */

        if (
            q.includes("kitten") &&
            q.includes("food")
        ) {

            return (
                "Kittens need food formulated for growth because " +
                "they require extra protein, calories and essential " +
                "nutrients. Feed a complete kitten diet and provide " +
                "fresh water throughout the day."
            );

        }


        /* =================================================
           OVERWEIGHT
        ================================================= */

        if (
            q.includes("overweight") ||
            q.includes("weight")
        ) {

            return (
                "A healthy weight depends on your pet's breed, age " +
                "and body condition. Look for a visible waist and " +
                "ribs that can be felt without being prominently " +
                "visible. If you are unsure, your veterinarian can " +
                "perform a proper body-condition assessment."
            );

        }


        /* =================================================
           WALK
        ================================================= */

        if (
            q.includes("walk") ||
            q.includes("exercise")
        ) {

            return (
                "Most dogs benefit from regular daily exercise, but " +
                "the ideal amount depends on age, breed and health. " +
                "Puppies usually need shorter walks combined with " +
                "playtime and rest. Increase activity gradually."
            );

        }


        /* =================================================
           TRAINING
        ================================================= */

        if (
            q.includes("train") ||
            q.includes("training")
        ) {

            return (
                "Use short, positive training sessions and reward " +
                "good behaviour immediately. Keep sessions consistent " +
                "and fun. Start with simple commands such as sit, " +
                "stay and come."
            );

        }


        /* =================================================
           CAT NOT EATING
        ================================================= */

        if (
            q.includes("cat") &&
            (
                q.includes("not eating") ||
                q.includes("eating")
            )
        ) {

            return (
                "A sudden loss of appetite in a cat should not be " +
                "ignored. Check for other signs such as vomiting, " +
                "lethargy or difficulty chewing. If your cat stops " +
                "eating or seems unwell, contact a veterinarian."
            );

        }


        /* =================================================
           GROOMING
        ================================================= */

        if (
            q.includes("groom") ||
            q.includes("grooming")
        ) {

            return (
                "Regular brushing helps remove loose fur and keeps " +
                "your pet's coat healthy. Check the ears, paws and " +
                "nails regularly, and use grooming products suitable " +
                "for your pet's species and coat type."
            );

        }


        /* =================================================
           HEALTH
        ================================================= */

        if (
            q.includes("health") ||
            q.includes("sick") ||
            q.includes("problem")
        ) {

            return (
                "Common signs that deserve attention include changes " +
                "in appetite, unusual tiredness, vomiting, diarrhoea, " +
                "breathing problems or sudden behaviour changes. " +
                "For serious or persistent symptoms, contact a vet."
            );

        }


        /* =================================================
           NUTRITION
        ================================================= */

        if (
            q.includes("nutrition") ||
            q.includes("diet") ||
            q.includes("eat")
        ) {

            return (
                "A balanced pet diet should provide the right amount " +
                "of protein, fats, carbohydrates, vitamins and minerals " +
                "for your pet's species, age and lifestyle. Avoid giving " +
                "pets foods that are toxic to them."
            );

        }


        /* =================================================
           DEFAULT
        ================================================= */

        return (
            "I'm here to help with pet care, nutrition, training, " +
            "grooming and general health questions. Tell me a little " +
            "more about your pet and I'll guide you."
        );

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


        /* ADD USER MESSAGE */

        addUserMessage(question);


        /* CLEAR INPUT */

        messageInput.value = "";


        /* SHOW TYPING */

        showTyping();


        /* ASK BACKEND AI */

        FamiPetAPI.post(
            "/ai/ask",
            {
                question
            }
        ).then((data) => {

            removeTyping();

            addAIMessage(
                (data && data.answer) ||
                getResponse(question)
            );

        }).catch(() => {

            removeTyping();

            addAIMessage(
                getResponse(question)
            );

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
       INITIAL SCROLL
    ===================================================== */

    scrollToBottom();

});