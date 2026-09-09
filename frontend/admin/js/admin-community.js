/* =========================================================
   ADMIN - COMMUNITY POSTS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("communityBody");


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function showToast(message, isError) {

        const old =
            document.querySelector(".admin-toast");

        if (old) {
            old.remove();
        }

        const toast =
            document.createElement("div");

        toast.className =
            "admin-toast";

        toast.innerHTML = `
            <i class="fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"}"></i>
            <span>${escapeHTML(message)}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(
            () => toast.remove(),
            3000
        );
    }


    function statusPill(status) {

        const s = Boolean(status);

        if (s) {
            return '<span class="pill green">Active</span>';
        }

        return '<span class="pill gray">Hidden</span>';
    }


    async function loadPosts() {

        try {

            const data =
                await FamiPetAPI.get("/admin/community");

            const posts =
                data.posts || [];

            if (!posts.length) {

                body.innerHTML =
                    `<tr><td colspan="6" class="admin-empty">
                        <i class="fa-solid fa-comments"></i>
                        <p>No community posts yet.</p>
                    </td></tr>`;

                return;
            }

            body.innerHTML =
                posts.map(p => {

                    const active =
                        Boolean(p.isActive);

                    return `

                        <tr>

                            <td>
                                <strong>${escapeHTML((p.user && p.user.name) || "Unknown")}</strong>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML((p.user && p.user.email) || "")}
                                </div>
                            </td>

                            <td>
                                <strong>${escapeHTML(p.title || "Untitled")}</strong>
                            </td>

                            <td>
                                <span class="pill lavender">${escapeHTML(p.category || "General")}</span>
                            </td>

                            <td style="max-width:240px;">
                                <span style="font-size:0.78rem;color:#64748b;">
                                    ${escapeHTML(p.content || "")}
                                </span>
                            </td>

                            <td>${statusPill(p.isActive)}</td>

                            <td>

                                <button
                                    class="admin-btn-sm ${active ? "btn-reject" : "btn-approve"}"
                                    data-status="${active ? "false" : "true"}"
                                    data-id="${escapeHTML(p._id)}"
                                >
                                    ${active ? "Unpublish" : "Publish"}
                                </button>

                                <button
                                    class="admin-btn-sm btn-danger"
                                    data-delete="${escapeHTML(p._id)}"
                                >
                                    Delete
                                </button>

                            </td>

                        </tr>

                    `;

                }).join("");

        } catch (err) {

            console.error(err);

            body.innerHTML =
                `<tr><td colspan="6" class="admin-empty">
                    Could not load posts: ${escapeHTML(err.message || "Unknown error")}
                </td></tr>`;
        }
    }


    body.addEventListener(
        "click",
        (event) => {

            const statusBtn =
                event.target.closest(
                    "[data-status]"
                );

            const deleteBtn =
                event.target.closest(
                    "[data-delete]"
                );

            if (statusBtn) {

                const id =
                    statusBtn.dataset.id;

                const isActive =
                    statusBtn.dataset.status === "true";

                const verb =
                    isActive ? "publish" : "unpublish";

                if (!confirm(`${verb[0].toUpperCase() + verb.slice(1)} this post?`)) return;

                FamiPetAPI.put(
                    "/admin/community/" + id + "/status",
                    { isActive }
                ).then(() => {

                    showToast(
                        `Post ${verb}ed.`
                    );

                    loadPosts();

                }).catch((err) => {

                    showToast(
                        err.message || "Could not update the post.",
                        true
                    );
                });

                return;
            }

            if (deleteBtn) {

                const id =
                    deleteBtn.dataset.delete;

                if (!confirm("Delete this post permanently?")) return;

                FamiPetAPI.del(
                    "/admin/community/" + id
                ).then(() => {

                    showToast("Post deleted.");

                    loadPosts();

                }).catch((err) => {

                    showToast(
                        err.message || "Could not delete the post.",
                        true
                    );
                });
            }
        }
    );


    loadPosts();

});