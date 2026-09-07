/* =========================================================
   ADMIN - USERS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("usersBody");

    const currentUser =
        FamiPetAPI.getUser() || {};


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function showToast(message) {

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
            <i class="fa-solid fa-circle-check"></i>
            <span>${escapeHTML(message)}</span>
        `;

        document.body.appendChild(toast);

        setTimeout(
            () => toast.remove(),
            3000
        );
    }


    async function loadUsers() {

        try {

            const data =
                await FamiPetAPI.get("/admin/users");

            const users =
                data.users || [];

            if (!users.length) {

                body.innerHTML =
                    `<tr><td colspan="6" class="admin-empty">
                        <i class="fa-solid fa-users"></i>
                        <p>No users registered yet.</p>
                    </td></tr>`;

                return;
            }

            body.innerHTML =
                users.map(u => `

                    <tr>

                        <td>
                            <strong>${escapeHTML(u.name)}</strong>
                        </td>

                        <td>${escapeHTML(u.email)}</td>

                        <td>${escapeHTML(u.phone || "—")}</td>

                        <td>
                            <span class="pill ${u.role === "admin" ? "lavender" : "green"}">
                                ${escapeHTML(u.role)}
                            </span>
                        </td>

                        <td>
                            ${
                                u.isBlocked
                                    ? '<span class="pill red">Blocked</span>'
                                    : u.isVerified
                                        ? '<span class="pill green">Verified</span>'
                                        : '<span class="pill amber">Unverified</span>'
                            }
                        </td>

                        <td>

                            ${
                                u.role !== "admin"
                                    ? `
                                        <button
                                            class="admin-btn-sm btn-block"
                                            data-action="block"
                                            data-id="${escapeHTML(u._id)}"
                                        >
                                            ${u.isBlocked ? "Unblock" : "Block"}
                                        </button>

                                        <button
                                            class="admin-btn-sm btn-danger"
                                            data-action="delete"
                                            data-id="${escapeHTML(u._id)}"
                                        >
                                            Delete
                                        </button>
                                    `
                                    : '<span style="font-size:0.75rem;color:#8a96a8;">Protected</span>'
                            }

                        </td>

                    </tr>

                `).join("");

        } catch (err) {

            console.error(err);

            body.innerHTML =
                `<tr><td colspan="6" class="admin-empty">
                    Could not load users: ${escapeHTML(err.message || "Unknown error")}
                </td></tr>`;
        }
    }


    body.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    "[data-action]"
                );

            if (!button) return;

            const id =
                button.dataset.id;

            const action =
                button.dataset.action;

            if (action === "block") {

                FamiPetAPI.put(
                    "/admin/users/" + id + "/block",
                    {}
                ).then((res) => {

                    showToast(
                        res.message || "User status updated."
                    );

                    loadUsers();

                }).catch((err) => {

                    alert(
                        err.message || "Could not update user."
                    );
                });
            }

            if (action === "delete") {

                const ok =
                    confirm(
                        "Delete this user account? This cannot be undone."
                    );

                if (!ok) return;

                FamiPetAPI.del(
                    "/admin/users/" + id
                ).then(() => {

                    showToast(
                        "User deleted."
                    );

                    loadUsers();

                }).catch((err) => {

                    alert(
                        err.message || "Could not delete user."
                    );
                });
            }
        }
    );


    if (currentUser.role === "admin") {
        loadUsers();
    }

});