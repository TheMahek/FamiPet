document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       STORAGE (local only for share counters & groups)
    ===================================================== */

    const SHARES_KEY = "annCommunityShares";
    const GROUPS_KEY = "annCommunityGroups";


    /* =====================================================
       ELEMENTS
    ===================================================== */

    const postsContainer =
        document.getElementById("postsContainer");

    const searchInput =
        document.getElementById("communitySearch");

    const tabs =
        document.querySelectorAll(".tab");

    const postModal =
        document.getElementById("postModal");

    const commentsModal =
        document.getElementById("commentsModal");

    const commentsList =
        document.getElementById("commentsList");

    const commentsPostTitle =
        document.getElementById("commentsPostTitle");

    const commentInput =
        document.getElementById("commentInput");

    const addCommentBtn =
        document.getElementById("addCommentBtn");

    const notificationBtn =
        document.getElementById("notificationBtn");

    let activeFilter = "all";
    let activePostId = null;

    let allPosts = [];


    /* =====================================================
       CURRENT USER
    ===================================================== */

    const famipetUser =
        (typeof FamiPetAPI !== "undefined" &&
            FamiPetAPI.getUser()) || {};

    const currentUser = {
        id: famipetUser.id || null,
        name: famipetUser.name || "Pet Parent",
        initials: famipetUser.initials ||
            (famipetUser.name
                ? famipetUser.name
                    .split(" ")
                    .map(p => p[0] || "")
                    .join("")
                    .toUpperCase()
                    .slice(0, 2)
                : "PP"),
        avatar: famipetUser.avatar ||
            "../assets/images/dashboard/user-profile.svg"
    };

    const currentUserId =
        currentUser.id;


    /* =====================================================
       STORAGE HELPERS
    ===================================================== */

    function getStorage(key, fallback) {

        try {

            const data =
                localStorage.getItem(key);

            return data
                ? JSON.parse(data)
                : fallback;

        } catch {

            return fallback;

        }

    }


    function setStorage(key, value) {

        localStorage.setItem(
            key,
            JSON.stringify(value)
        );

    }


    /* =====================================================
       ESCAPE HTML
    ===================================================== */

    function escapeHTML(text = "") {

        const div =
            document.createElement("div");

        div.textContent = text;

        return div.innerHTML;

    }


    /* =====================================================
       TOAST SYSTEM
       NO ALERTS
    ===================================================== */

    function showToast(message, type = "success") {

        let container =
            document.getElementById(
                "annToastContainer"
            );


        if (!container) {

            container =
                document.createElement("div");

            container.id =
                "annToastContainer";

            container.className =
                "ann-toast-container";

            document.body.appendChild(
                container
            );

        }


        const toast =
            document.createElement("div");

        toast.className =
            `ann-toast ${type}`;


        let icon =
            "fa-circle-check";


        if (type === "error") {

            icon = "fa-circle-exclamation";

        }

        if (type === "info") {

            icon = "fa-circle-info";

        }


        toast.innerHTML = `

            <i class="fa-solid ${icon}"></i>

            <span>
                ${escapeHTML(message)}
            </span>

            <button type="button"
                    class="toast-close">
                <i class="fa-solid fa-xmark"></i>
            </button>

        `;


        container.appendChild(
            toast
        );


        toast
            .querySelector(".toast-close")
            .addEventListener(
                "click",
                () => toast.remove()
            );


        setTimeout(() => {

            toast.classList.add(
                "toast-hide"
            );

            setTimeout(
                () => toast.remove(),
                300
            );

        }, 3000);

    }


    /* =====================================================
       CONFIRMATION MODAL
    ===================================================== */

    function showConfirm(
        title,
        message,
        onConfirm
    ) {

        const old =
            document.getElementById(
                "annConfirmModal"
            );


        if (old) {

            old.remove();

        }


        const overlay =
            document.createElement("div");

        overlay.id =
            "annConfirmModal";

        overlay.className =
            "ann-confirm-overlay";


        overlay.innerHTML = `

            <div class="ann-confirm-modal">

                <div class="ann-confirm-icon">
                    <i class="fa-solid fa-circle-question"></i>
                </div>

                <h3>
                    ${escapeHTML(title)}
                </h3>

                <p>
                    ${escapeHTML(message)}
                </p>

                <div class="ann-confirm-actions">

                    <button
                        type="button"
                        class="ann-confirm-cancel"
                    >
                        Cancel
                    </button>

                    <button
                        type="button"
                        class="ann-confirm-ok"
                    >
                        Continue
                    </button>

                </div>

            </div>

        `;


        document.body.appendChild(
            overlay
        );


        overlay
            .querySelector(".ann-confirm-cancel")
            .addEventListener(
                "click",
                () => overlay.remove()
            );


        overlay
            .querySelector(".ann-confirm-ok")
            .addEventListener(
                "click",
                () => {

                    overlay.remove();

                    onConfirm();

                }
            );


        overlay.addEventListener(
            "click",
            event => {

                if (
                    event.target ===
                    overlay
                ) {

                    overlay.remove();

                }

            }
        );

    }


    /* =====================================================
       STATIC POST IDs
       Gives every existing post its own ID
    ===================================================== */

    function assignPostIds() {

        const cards =
            postsContainer.querySelectorAll(
                ".post-card"
            );


        cards.forEach(
            (card, index) => {

                if (
                    !card.dataset.postId
                ) {

                    card.dataset.postId =
                        `community-static-${index + 1}`;

                }

            }
        );

    }


    /* =====================================================
       FIX ALL EXISTING POSTS
    ===================================================== */

    function normalizeExistingPosts() {

        const cards =
            postsContainer.querySelectorAll(
                ".post-card"
            );


        cards.forEach(
            card => {

                /* -----------------------------------------
                   MAKE EVERY FIRST ACTION A LIKE BUTTON
                ----------------------------------------- */

                const footer =
                    card.querySelector(
                        ".post-footer"
                    );


                if (!footer) {

                    return;

                }


                let likeBtn =
                    footer.querySelector(
                        ".like-btn"
                    );


                if (!likeBtn) {

                    const buttons =
                        footer.querySelectorAll(
                            "button"
                        );


                    if (buttons.length > 0) {

                        likeBtn =
                            buttons[0];

                        likeBtn.classList.add(
                            "like-btn"
                        );

                    }

                }


                if (likeBtn) {

                    likeBtn.type =
                        "button";

                }


                /* -----------------------------------------
                   GIVE COMMENT BUTTON CLASS
                ----------------------------------------- */

                let commentBtn =
                    footer.querySelector(
                        ".comment-btn"
                    );


                if (!commentBtn) {

                    const buttons =
                        footer.querySelectorAll(
                            "button"
                        );


                    if (buttons.length > 1) {

                        commentBtn =
                            buttons[1];

                        commentBtn.classList.add(
                            "comment-btn"
                        );

                    }

                }


                /* -----------------------------------------
                   GIVE SHARE BUTTON CLASS
                ----------------------------------------- */

                let shareBtn =
                    footer.querySelector(
                        ".share-btn"
                    );


                if (!shareBtn) {

                    const buttons =
                        footer.querySelectorAll(
                            "button"
                        );


                    if (buttons.length > 2) {

                        shareBtn =
                            buttons[2];

                        shareBtn.classList.add(
                            "share-btn"
                        );

                    }

                }


                /* -----------------------------------------
                   IMPORTANT:
                   REMOVE FAKE COMMENT COUNTS
                ----------------------------------------- */

                if (commentBtn) {

                    const span =
                        commentBtn.querySelector(
                            "span"
                        );


                    if (span) {

                        span.textContent =
                            getCommentCount(
                                card.dataset.postId
                            );

                    }

                }


                const commentsText =
                    footer.querySelector(
                        ".comments"
                    );


                if (commentsText) {

                    commentsText.textContent =
                        `${getCommentCount(
                            card.dataset.postId
                        )} Comments`;

                }

            }
        );

    }


    /* =====================================================
       POST DATA (BACKEND)
    ===================================================== */

    function findPost(postId) {

        return allPosts.find(
            post =>
                post.id === postId
        );

    }


    const CATEGORY_TO_TYPE = {
        general: "discussion",
        "pet-care": "tip",
        adoption: "story",
        "lost-found": "discussion",
        health: "tip",
        training: "tip",
        other: "discussion"
    };


    const TYPE_TO_CATEGORY = {
        discussion: "general",
        story: "adoption",
        question: "general",
        tip: "pet-care"
    };


    function mapPost(post) {

        const author =
            post.user &&
                (post.user._id || post.user.id);

        const likesArr =
            Array.isArray(post.likes)
                ? post.likes
                : [];


        const commentsArr =
            Array.isArray(post.comments)
                ? post.comments.map(
                    comment => ({

                        user:
                            comment.user &&
                                (comment.user.name ||
                                    comment.user.email)
                            || "User",

                        text:
                            comment.text || "",

                        createdAt:
                            new Date(
                                comment.createdAt
                            ).getTime() || Date.now()

                    })
                )
                : [];


        return {

            id:
                post._id || post.id,

            type:
                CATEGORY_TO_TYPE[
                    post.category
                ] || "discussion",

            user:
                post.user &&
                    (post.user.name ||
                        post.user.email)
                || "Community Member",

            avatar:
                (post.user &&
                    post.user.avatar) ||
                "../assets/images/dashboard/user-profile.svg",

            title:
                post.title ||
                "Untitled Post",

            content:
                post.content || "",

            image:
                post.image || "",

            createdAt:
                new Date(
                    post.createdAt
                ).getTime() || Date.now(),

            likesCount:
                likesArr.length,

            liked:
                likesArr.some(
                    u => (u._id || u) ===
                        currentUserId
                ),

            ownerId:
                author || null,

            comments:
                commentsArr

        };

    }


    async function loadPosts() {

        try {

            const data =
                await FamiPetAPI.get(
                    "/community"
                );


            const posts =
                (data && data.posts) || [];


            postsContainer
                .querySelectorAll(
                    ".post-card"
                )
                .forEach(
                    card =>
                        card.remove()
                );


            allPosts =
                posts.map(
                    post => {

                        const mapped =
                            mapPost(post);

                        mapped.isOwner =
                            !!(mapped.ownerId &&
                                mapped.ownerId ===
                                currentUserId);

                        return mapped;

                    }
                );


            renderUserPosts();


            attachAllInteractions();


            applyFilters();

        }
        catch (error) {

            showToast(
                error.message ||
                    "Could not load community posts.",
                "error"
            );

        }

    }


    /* =====================================================
       COMMENTS
    ===================================================== */

    function getComments() {

        const map = {};

        allPosts.forEach(
            post => {

                map[post.id] =
                    post.comments || [];

            }
        );

        return map;

    }


    function getCommentCount(
        postId
    ) {

        const post =
            findPost(postId);


        if (!post) {

            return 0;

        }


        return (
            post.comments
                ? post.comments.length
                : 0
        );

    }


    /* =====================================================
       LIKE BUTTON
    ===================================================== */

    function attachLikeButton(
        button
    ) {

        if (!button) {

            return;

        }


        if (
            button.dataset.likeBound ===
            "true"
        ) {

            return;

        }


        button.dataset.likeBound =
            "true";


        const card =
            button.closest(
                ".post-card"
            );


        if (!card) {

            return;

        }


        const postId =
            card.dataset.postId;


        const countSpan =
            button.querySelector(
                "span"
            );


        const icon =
            button.querySelector(
                "i"
            );


        if (!countSpan) {

            return;

        }


        const post =
            findPost(postId);


        /*
         * Restore saved count + liked state
         * from the fetched backend post.
         */

        if (post) {

            countSpan.textContent =
                post.likesCount || 0;


            if (post.liked) {

                button.classList.add(
                    "liked"
                );


                if (icon) {

                    icon.className =
                        "fa-solid fa-heart";

                }

            }

        }


        button.addEventListener(
            "click",
            async event => {

                event.preventDefault();

                event.stopPropagation();


                if (!post) {

                    return;

                }


                try {

                    const result =
                        await FamiPetAPI.put(
                            `/community/${postId}/like`
                        );


                    const likes =
                        (result &&
                            result.likes) ||
                        [];


                    post.likesCount =
                        likes.length;


                    post.liked =
                        likes.some(
                            u => (u._id || u) ===
                                currentUserId
                        );


                    countSpan.textContent =
                        post.likesCount;


                    if (post.liked) {

                        button.classList.add(
                            "liked"
                        );


                        if (icon) {

                            icon.className =
                                "fa-solid fa-heart";

                        }

                    }

                    else {

                        button.classList.remove(
                            "liked"
                        );


                        if (icon) {

                            icon.className =
                                "fa-regular fa-heart";

                        }

                    }

                }
                catch (error) {

                    showToast(
                        error.message ||
                            "Could not update like.",
                        "error"
                    );

                }

            }
        );

    }


    /* =====================================================
       COMMENTS BUTTON
    ===================================================== */

    function attachCommentButton(
        button
    ) {

        if (!button) {

            return;

        }


        if (
            button.dataset.commentBound ===
            "true"
        ) {

            return;

        }


        button.dataset.commentBound =
            "true";


        button.addEventListener(
            "click",
            () => {

                const card =
                    button.closest(
                        ".post-card"
                    );


                if (!card) {

                    return;

                }


                openComments(
                    card
                );

            }
        );

    }


    /* =====================================================
       OPEN COMMENTS
    ===================================================== */

    function openComments(
        card
    ) {

        activePostId =
            card.dataset.postId;


        const title =
            card.querySelector(
                ".post-content h2"
            )?.textContent.trim()
            || "Community Post";


        if (commentsPostTitle) {

            commentsPostTitle.textContent =
                title;

        }


        renderComments();


        commentsModal?.classList.add(
            "show"
        );


        document.body.style.overflow =
            "hidden";

    }


    /* =====================================================
       RENDER COMMENTS
    ===================================================== */

    function renderComments() {

        if (!commentsList) {

            return;

        }


        if (!activePostId) {

            return;

        }


        const post =
            findPost(activePostId);


        const postComments =
            (post &&
                post.comments) ||
            [];


        /*
         * THIS IS THE IMPORTANT FIX:
         * If there are no actual comments,
         * show 0 comments.
         */

        if (
            postComments.length === 0
        ) {

            commentsList.innerHTML = `

                <div class="no-comments">

                    <i
                        class="fa-regular
                        fa-comment-dots"
                    ></i>

                    <p>
                        No comments yet.
                    </p>

                    <small>
                        Be the first to join
                        the conversation!
                    </small>

                </div>

            `;

            return;

        }


        commentsList.innerHTML =
            postComments
                .map(
                    comment => `

                    <div class="comment-item">

                        <strong>
                            ${escapeHTML(
                                comment.user
                            )}
                        </strong>

                        <p>
                            ${escapeHTML(
                                comment.text
                            )}
                        </p>

                        <small>
                            ${formatTime(
                                comment.createdAt
                            )}
                        </small>

                    </div>

                `
                )
                .join("");

    }


    /* =====================================================
       ADD COMMENT
    ===================================================== */

    function addComment() {

        if (!activePostId) {

            return;

        }


        const text =
            commentInput?.value.trim();


        if (!text) {

            showToast(
                "Please write a comment first.",
                "error"
            );

            return;

        }


        async function run() {

            await FamiPetAPI.post(
                `/community/${activePostId}/comments`,
                { text }
            );


            const post =
                findPost(activePostId);


            if (post) {

                post.comments =
                    (post.comments || [])
                        .concat({

                            user:
                                currentUser.name,

                            text:
                                text,

                            createdAt:
                                Date.now()

                        });

            }

        }


        run()
            .then(() => {

                commentInput.value =
                    "";


                renderComments();


                updateCommentCount(
                    activePostId
                );


                showToast(
                    "Comment added successfully.",
                    "success"
                );

            })
            .catch(error => {

                showToast(
                    error.message ||
                        "Could not add comment.",
                    "error"
                );

            });

    }


    /* =====================================================
       UPDATE COMMENT COUNT
    ===================================================== */

    function updateCommentCount(
        postId
    ) {

        const card =
            postsContainer.querySelector(
                `[data-post-id="${postId}"]`
            );


        if (!card) {

            return;

        }


        const count =
            getCommentCount(
                postId
            );


        const button =
            card.querySelector(
                ".comment-btn"
            );


        const span =
            button?.querySelector(
                "span"
            );


        if (span) {

            span.textContent =
                count;

        }


        const text =
            card.querySelector(
                ".comments"
            );


        if (text) {

            text.textContent =
                `${count} Comments`;

        }

    }


    /* =====================================================
       SHARE
    ===================================================== */

    function attachShareButton(
        button
    ) {

        if (!button) {

            return;

        }


        if (
            button.dataset.shareBound ===
            "true"
        ) {

            return;

        }


        button.dataset.shareBound =
            "true";


        button.addEventListener(
            "click",
            async () => {

                const card =
                    button.closest(
                        ".post-card"
                    );


                if (!card) {

                    return;

                }


                const title =
                    card.querySelector(
                        ".post-content h2"
                    )?.textContent.trim()
                    || "Famipet Community Post";


                const shareText =
                    `${title} — Famipet Community`;


                try {

                    if (
                        navigator.share
                    ) {

                        await navigator.share({

                            title:
                                "Famipet Community",

                            text:
                                shareText

                        });

                    }

                    else if (
                        navigator.clipboard
                    ) {

                        await navigator.clipboard.writeText(
                            shareText
                        );


                        showToast(
                            "Post link/text copied!",
                            "success"
                        );

                    }

                    else {

                        showToast(
                            "Post ready to share!",
                            "info"
                        );

                    }

                }

                catch {

                    /*
                     * User cancelled native
                     * sharing.
                     */

                    return;

                }


                const postId =
                    card.dataset.postId;


                const shares =
                    getStorage(
                        SHARES_KEY,
                        {}
                    );


                shares[postId] =
                    (shares[postId] || 0) + 1;


                setStorage(
                    SHARES_KEY,
                    shares
                );


                const span =
                    button.querySelector(
                        "span"
                    );


                if (span) {

                    span.textContent =
                        shares[postId];

                }

            }
        );

    }


    /* =====================================================
       MORE MENU
    ===================================================== */

    function attachMoreButton(
        button
    ) {

        if (!button) {

            return;

        }


        if (
            button.dataset.moreBound ===
            "true"
        ) {

            return;

        }


        button.dataset.moreBound =
            "true";


        button.addEventListener(
            "click",
            event => {

                event.stopPropagation();


                const card =
                    button.closest(
                        ".post-card"
                    );


                if (!card) {

                    return;

                }


                document
                    .querySelectorAll(
                        ".post-actions-menu"
                    )
                    .forEach(
                        menu =>
                            menu.remove()
                    );


                const menu =
                    document.createElement(
                        "div"
                    );


                menu.className =
                    "post-actions-menu";


                if (
                    card.classList.contains(
                        "user-created"
                    )
                ) {

                    menu.innerHTML = `

                        <button
                            type="button"
                            class="delete-post-action"
                        >

                            <i
                                class="fa-regular
                                fa-trash-can"
                            ></i>

                            Delete Post

                        </button>

                    `;


                    menu
                        .querySelector(
                            ".delete-post-action"
                        )
                        .addEventListener(
                            "click",
                            () => {

                                showConfirm(

                                    "Delete Post?",

                                    "Are you sure you want to delete this post?",

                                    () => {

                                        deletePost(
                                            card.dataset.postId
                                        );

                                    }

                                );

                            }
                        );

                }

                else {

                    menu.innerHTML = `

                        <button
                            type="button"
                            class="report-post-action"
                        >

                            <i
                                class="fa-regular
                                fa-flag"
                            ></i>

                            Report Post

                        </button>

                    `;


                    menu
                        .querySelector(
                            ".report-post-action"
                        )
                        .addEventListener(
                            "click",
                            () => {

                                menu.remove();


                                showToast(
                                    "Post has been reported for review.",
                                    "info"
                                );

                            }
                        );

                }


                card.appendChild(
                    menu
                );

            }
        );

    }


    /* =====================================================
       DELETE USER POST
    ===================================================== */

    function deletePost(
        postId
    ) {

        FamiPetAPI.del(
            `/community/${postId}`
        )
            .then(() => {

                allPosts =
                    allPosts.filter(
                        post =>
                            post.id !== postId
                    );


                const card =
                    postsContainer.querySelector(
                        `[data-post-id="${postId}"]`
                    );


                card?.remove();


                showToast(
                    "Post deleted successfully.",
                    "success"
                );


                applyFilters();

            })
            .catch(error => {

                showToast(
                    error.message ||
                        "Could not delete post.",
                    "error"
                );

            });

    }


    /* =====================================================
       CREATE USER POST
    ===================================================== */

    function createPostElement(
        post
    ) {

        const article =
            document.createElement(
                "article"
            );


        article.className =
            post.isOwner
                ? "post-card user-created"
                : "post-card";


        article.dataset.type =
            post.type;


        article.dataset.postId =
            post.id;


        const comments =
            getCommentCount(
                post.id
            );


        const shares =
            getStorage(
                SHARES_KEY,
                {}
            );


        article.innerHTML = `

            <div class="post-header">

                <div class="post-user">

                    <img
                        src="${post.avatar}"
                        alt="${escapeHTML(
                            post.user
                        )}"
                    >

                    <div>

                        <strong>
                            ${escapeHTML(
                                post.user
                            )}
                        </strong>

                        <span>
                            ${formatTime(
                                post.createdAt
                            )}
                            •
                            ${typeLabel(
                                post.type
                            )}
                        </span>

                    </div>

                </div>


                <button
                    class="more-post"
                    type="button"
                >

                    <i
                        class="fa-solid
                        fa-ellipsis"
                    ></i>

                </button>

            </div>


            <div class="post-body">

                <div class="post-content">

                    <h2>
                        ${escapeHTML(
                            post.title
                        )}
                    </h2>

                    <p>
                        ${escapeHTML(
                            post.content
                        ).replace(
                            /\n/g,
                            "<br>"
                        )}
                    </p>

                    <div class="post-tags">

                        <span
                            class="${typeTagClass(
                                post.type
                            )}"
                        >
                            ${typeLabel(
                                post.type
                            )}
                        </span>

                        <span
                            class="green-tag"
                        >
                            Pet Care
                        </span>

                    </div>

                </div>

                ${
                    post.image
                    ? `
                        <img
                            class="post-image"
                            src="${post.image}"
                            alt="Post image"
                        >
                    `
                    : ""
                }

            </div>


            <div class="post-footer">

                <button
                    class="like-btn"
                    type="button"
                >

                    <i
                        class="fa-regular
                        fa-heart"
                    ></i>

                    <span>
                        ${post.likesCount || 0}
                    </span>

                </button>


                <button
                    class="comment-btn"
                    type="button"
                >

                    <i
                        class="fa-regular
                        fa-comment"
                    ></i>

                    <span>
                        ${comments}
                    </span>

                </button>


                <button
                    class="share-btn"
                    type="button"
                >

                    <i
                        class="fa-solid
                        fa-share"
                    ></i>

                    <span>
                        ${shares[post.id] || 0}
                    </span>

                </button>


                <span class="comments">
                    ${comments} Comments
                </span>

            </div>

        `;


        return article;

    }


    /* =====================================================
       RENDER USER POSTS
    ===================================================== */

    function renderUserPosts() {

        document
            .querySelectorAll(
                ".post-card.user-created"
            )
            .forEach(
                card =>
                    card.remove()
            );


        document
            .getElementById("noPosts")
            ?.remove();


        allPosts
            .slice()
            .reverse()
            .forEach(
                post => {

                    postsContainer.prepend(
                        createPostElement(
                            post
                        )
                    );

                }
            );

    }


    /* =====================================================
       ATTACH ALL POST EVENTS
    ===================================================== */

    function attachAllInteractions() {

        postsContainer
            .querySelectorAll(
                ".post-card"
            )
            .forEach(
                card => {

                    const like =
                        card.querySelector(
                            ".like-btn"
                        );


                    const comment =
                        card.querySelector(
                            ".comment-btn"
                        );


                    const share =
                        card.querySelector(
                            ".share-btn"
                        );


                    const more =
                        card.querySelector(
                            ".more-post"
                        );


                    attachLikeButton(
                        like
                    );


                    attachCommentButton(
                        comment
                    );


                    attachShareButton(
                        share
                    );


                    attachMoreButton(
                        more
                    );


                    updateCommentCount(
                        card.dataset.postId
                    );

                }
            );

    }


    /* =====================================================
       SEARCH + FILTER
    ===================================================== */

/* =====================================================
   SEARCH + FILTER
===================================================== */

function applyFilters() {

    const search =
        searchInput?.value
            .toLowerCase()
            .trim() || "";


    /* ---------------------------------------------
       SEARCH POSTS
    --------------------------------------------- */

    const cards =
        postsContainer.querySelectorAll(
            ".post-card"
        );


    let visiblePosts = 0;


    cards.forEach(card => {

        const matchesType =
            activeFilter === "all" ||
            card.dataset.type === activeFilter;


        const matchesSearch =
            !search ||
            card.textContent
                .toLowerCase()
                .includes(search);


        const show =
            matchesType &&
            matchesSearch;


        card.style.display =
            show ? "" : "none";


        if (show) {

            visiblePosts++;

        }

    });


    /* ---------------------------------------------
       SEARCH PEOPLE
    --------------------------------------------- */

    const people =
        document.querySelectorAll(
            ".people-item, .person-item, .member-item"
        );


    people.forEach(person => {

        const matches =
            !search ||
            person.textContent
                .toLowerCase()
                .includes(search);


        person.style.display =
            matches ? "" : "none";

    });


    /* ---------------------------------------------
       SEARCH COMMUNITIES / GROUPS
    --------------------------------------------- */

    const groups =
        document.querySelectorAll(
            ".group-item, .community-item"
        );


    groups.forEach(group => {

        const matches =
            !search ||
            group.textContent
                .toLowerCase()
                .includes(search);


        group.style.display =
            matches ? "" : "none";

    });


    /* ---------------------------------------------
       NO POSTS MESSAGE
    --------------------------------------------- */

    let noPosts =
        document.getElementById(
            "noPosts"
        );


    if (visiblePosts === 0) {

        if (!noPosts) {

            noPosts =
                document.createElement(
                    "div"
                );


            noPosts.id =
                "noPosts";


            noPosts.className =
                "no-posts";


            noPosts.innerHTML = `

                <i
                    class="fa-regular
                    fa-face-frown"
                ></i>

                <p>
                    No matching posts found.
                </p>

            `;


            postsContainer.appendChild(
                noPosts
            );

        }

    }

    else {

        noPosts?.remove();

    }

}

    searchInput?.addEventListener(
        "input",
        applyFilters
    );


    tabs.forEach(
        tab => {

            tab.addEventListener(
                "click",
                () => {

                    tabs.forEach(
                        item =>
                            item.classList.remove(
                                "active"
                            )
                    );


                    tab.classList.add(
                        "active"
                    );


                    activeFilter =
                        tab.dataset.filter ||
                        "all";


                    applyFilters();

                }
            );

        }
    );


    /* =====================================================
       MODAL CLOSE
    ===================================================== */

    document
        .getElementById(
            "closeCommentsModal"
        )
        ?.addEventListener(
            "click",
            () => {

                commentsModal?.classList.remove(
                    "show"
                );

                document.body.style.overflow =
                    "";

            }
        );


    commentsModal?.addEventListener(
        "click",
        event => {

            if (
                event.target ===
                commentsModal
            ) {

                commentsModal.classList.remove(
                    "show"
                );

                document.body.style.overflow =
                    "";

            }

        }
    );


    addCommentBtn?.addEventListener(
        "click",
        addComment
    );


    commentInput?.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter"
            ) {

                event.preventDefault();

                addComment();

            }

        }
    );


    /* =====================================================
       CREATE POST MODAL
    ===================================================== */

    function openPostModal(
        type = "discussion"
    ) {

        postModal?.classList.add(
            "show"
        );


        document.body.style.overflow =
            "hidden";


        const typeSelect =
            document.getElementById(
                "modalPostType"
            );


        const titleInput =
            document.getElementById(
                "modalPostTitle"
            );


        const content =
            document.getElementById(
                "modalPostContent"
            );


        if (typeSelect) {

            typeSelect.value =
                type;

        }


        if (titleInput) {

            titleInput.value =
                "";

        }


        if (content) {

            content.value =
                "";

        }

    }


    function closePostModal() {

        postModal?.classList.remove(
            "show"
        );


        document.body.style.overflow =
            "";

    }


    document
        .getElementById(
            "newPostBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openPostModal(
                    "discussion"
                )
        );


    document
        .getElementById(
            "storyBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openPostModal(
                    "story"
                )
        );


    document
        .getElementById(
            "questionBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openPostModal(
                    "question"
                )
        );


    document
        .getElementById(
            "photoBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openPostModal(
                    "discussion"
                )
        );


    document
        .getElementById(
            "postBtn"
        )
        ?.addEventListener(
            "click",
            () =>
                openPostModal(
                    "discussion"
                )
        );


    document
        .getElementById(
            "closePostModal"
        )
        ?.addEventListener(
            "click",
            closePostModal
        );


    document
        .getElementById(
            "cancelPostModal"
        )
        ?.addEventListener(
            "click",
            closePostModal
        );


    /* =====================================================
       PUBLISH POST
    ===================================================== */

    document
        .getElementById(
            "publishPostBtn"
        )
        ?.addEventListener(
            "click",
            publishPost
        );


    async function publishPost() {

        const title =
            document
                .getElementById(
                    "modalPostTitle"
                )
                ?.value.trim();


        const content =
            document
                .getElementById(
                    "modalPostContent"
                )
                ?.value.trim();


        const type =
            document
                .getElementById(
                    "modalPostType"
                )
                ?.value ||
            "discussion";


        if (!content) {

            showToast(
                "Please write something before publishing.",
                "error"
            );

            return;

        }


        const imageInput =
            document.getElementById(
                "postImageInput"
            );


        let image = "";


        if (
            imageInput &&
            imageInput.files &&
            imageInput.files.length > 0
        ) {

            try {

                image =
                    await fileToDataURL(
                        imageInput.files[0]
                    );

            }
            catch {

                showToast(
                    "The image could not be loaded.",
                    "error"
                );

                return;

            }

        }


        const payload = {

            title:
                title ||
                typeLabel(type),

            content:
                content,

            category:
                TYPE_TO_CATEGORY[
                    type
                ] || "general",

            image

        };


        try {

            await FamiPetAPI.post(
                "/community",
                payload
            );


            closePostModal();


            await loadPosts();


            showToast(
                "Your post was published successfully!",
                "success"
            );

        }
        catch (error) {

            showToast(
                error.message ||
                    "Could not publish your post.",
                "error"
            );

        }

    }


    function fileToDataURL(file) {

        return new Promise(
            (resolve, reject) => {

                const reader =
                    new FileReader();


                reader.onload =
                    () => resolve(
                        reader.result
                    );


                reader.onerror =
                    reject;


                reader.readAsDataURL(file);

            }
        );

    }


    /* =====================================================
       TYPE LABEL
    ===================================================== */

    function typeLabel(
        type
    ) {

        const labels = {

            discussion:
                "Discussion",

            story:
                "Story",

            question:
                "Question",

            tip:
                "Tips & Advice"

        };


        return labels[type] ||
            "Discussion";

    }


    function typeTagClass(
        type
    ) {

        if (
            type === "story"
        ) {

            return "purple-tag";

        }


        if (
            type === "question"
        ) {

            return "pink-tag";

        }


        return "green-tag";

    }


    /* =====================================================
       TIME
    ===================================================== */

    function formatTime(
        timestamp
    ) {

        const seconds =
            Math.floor(
                (
                    Date.now() -
                    timestamp
                ) / 1000
            );


        if (
            seconds < 60
        ) {

            return "Just now";

        }


        const minutes =
            Math.floor(
                seconds / 60
            );


        if (
            minutes < 60
        ) {

            return `${minutes} min ago`;

        }


        const hours =
            Math.floor(
                minutes / 60
            );


        if (
            hours < 24
        ) {

            return `${hours} hour${
                hours === 1
                    ? ""
                    : "s"
            } ago`;

        }


        const days =
            Math.floor(
                hours / 24
            );


        return `${days} day${
            days === 1
                ? ""
                : "s"
        } ago`;

    }


    /* =====================================================
       GROUPS
    ===================================================== */

    document
        .querySelectorAll(
            ".join-btn"
        )
        .forEach(
            button => {

                const group =
                    button
                        .closest(
                            ".group-item"
                        )
                        ?.querySelector(
                            ".group-info strong"
                        )
                        ?.textContent
                        .trim();


                if (!group) {

                    return;

                }


                const joined =
                    getStorage(
                        GROUPS_KEY,
                        {}
                    );


                if (
                    joined[group]
                ) {

                    button.textContent =
                        "Joined";

                    button.classList.add(
                        "joined"
                    );

                }


                button.addEventListener(
                    "click",
                    () => {

                        const groups =
                            getStorage(
                                GROUPS_KEY,
                                {}
                            );


                        groups[group] =
                            !groups[group];


                        setStorage(
                            GROUPS_KEY,
                            groups
                        );


                        if (
                            groups[group]
                        ) {

                            button.textContent =
                                "Joined";

                            button.classList.add(
                                "joined"
                            );


                            showToast(
                                `Joined ${group}!`,
                                "success"
                            );

                        }

                        else {

                            button.textContent =
                                "Join";

                            button.classList.remove(
                                "joined"
                            );


                            showToast(
                                `Left ${group}.`,
                                "info"
                            );

                        }

                    }
                );

            }
        );


    /* =====================================================
       NOTIFICATIONS
       NO ALERT
    ===================================================== */

    notificationBtn?.addEventListener(
        "click",
        () => {

            let panel =
                document.getElementById(
                    "notificationPanel"
                );


            if (panel) {

                panel.remove();

                return;

            }


            panel =
                document.createElement(
                    "div"
                );


            panel.id =
                "notificationPanel";


            panel.className =
                "notification-panel";


            panel.innerHTML = `

                <div class="notification-panel-header">

                    <strong>
                        Notifications
                    </strong>

                    <button
                        type="button"
                        id="closeNotificationPanel"
                    >
                        <i
                            class="fa-solid
                            fa-xmark"
                        ></i>
                    </button>

                </div>


                <div class="notification-item">

                    <i
                        class="fa-solid
                        fa-heart"
                    ></i>

                    <div>

                        <strong>
                            Community activity
                        </strong>

                        <span>
                            New activity is waiting
                            for you.
                        </span>

                    </div>

                </div>


                <div class="notification-item">

                    <i
                        class="fa-solid
                        fa-users"
                    ></i>

                    <div>

                        <strong>
                            Popular groups
                        </strong>

                        <span>
                            Check out the latest
                            discussions.
                        </span>

                    </div>

                </div>


                <div class="notification-item">

                    <i
                        class="fa-solid
                        fa-paw"
                    ></i>

                    <div>

                        <strong>
                            Famipet Community
                        </strong>

                        <span>
                            Keep sharing and helping
                            fellow pet parents!
                        </span>

                    </div>

                </div>

            `;


            document.body.appendChild(
                panel
            );


            panel
                .querySelector(
                    "#closeNotificationPanel"
                )
                .addEventListener(
                    "click",
                    () =>
                        panel.remove()
                );

        }
    );


    /* =====================================================
       THEME
    ===================================================== */

    document
        .getElementById(
            "themeBtn"
        )
        ?.addEventListener(
            "click",
            () => {

                document.body.classList.toggle(
                    "soft-mode"
                );

            }
        );


    /* =====================================================
       CLOSE MENUS
    ===================================================== */

    document.addEventListener(
        "click",
        event => {

            if (
                !event.target.closest(
                    ".more-post"
                ) &&
                !event.target.closest(
                    ".post-actions-menu"
                )
            ) {

                document
                    .querySelectorAll(
                        ".post-actions-menu"
                    )
                    .forEach(
                        menu =>
                            menu.remove()
                    );

            }

        }
    );


    /* =====================================================
       INITIALIZE
    ===================================================== */

    assignPostIds();

    normalizeExistingPosts();

    attachAllInteractions();

    loadPosts();

});