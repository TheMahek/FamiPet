/* =========================================================
   ADMIN - ADOPTIONS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("adoptionsBody");


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


    function statusPill(status) {

        const s = String(status || "Pending");

        if (s === "Approved") {
            return '<span class="pill green">Approved</span>';
        }

        if (s === "Rejected") {
            return '<span class="pill red">Rejected</span>';
        }

        return '<span class="pill amber">Pending</span>';
    }


    async function loadAdoptions() {

        try {

            const data =
                await FamiPetAPI.get("/adoptions");

            const adoptions =
                data.adoptions || [];

            if (!adoptions.length) {

                body.innerHTML =
                    `<tr><td colspan="6" class="admin-empty">
                        <i class="fa-solid fa-heart"></i>
                        <p>No adoption requests yet.</p>
                    </td></tr>`;

                return;
            }

            body.innerHTML =
                adoptions.map(a => {

                    const pending =
                        String(a.status) === "Pending";

                    return `

                        <tr>

                            <td>
                                <strong>${escapeHTML((a.pet && a.pet.name) || "Unknown Pet")}</strong>
                            </td>

                            <td>
                                <strong>${escapeHTML(a.fullName)}</strong>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML((a.user && a.user.name) || "")}
                                </div>
                            </td>

                            <td>
                                <div>${escapeHTML(a.phone || "—")}</div>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML((a.user && a.user.email) || "")}
                                </div>
                            </td>

                            <td style="max-width:220px;">
                                <span style="font-size:0.78rem;color:#64748b;">
                                    ${escapeHTML(a.reasonForAdoption)}
                                </span>
                            </td>

                            <td>${statusPill(a.status)}</td>

                            <td>

                                ${
                                    pending
                                        ? `
                                            <button
                                                class="admin-btn-sm btn-approve"
                                                data-status="Approved"
                                                data-id="${escapeHTML(a._id)}"
                                            >
                                                Approve
                                            </button>

                                            <button
                                                class="admin-btn-sm btn-reject"
                                                data-status="Rejected"
                                                data-id="${escapeHTML(a._id)}"
                                            >
                                                Reject
                                            </button>
                                        `
                                        : '<span style="font-size:0.75rem;color:#8a96a8;">Reviewed</span>'
                                }

                            </td>

                        </tr>

                    `;

                }).join("");

        } catch (err) {

            console.error(err);

            body.innerHTML =
                `<tr><td colspan="6" class="admin-empty">
                    Could not load requests: ${escapeHTML(err.message || "Unknown error")}
                </td></tr>`;
        }
    }


    body.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    "[data-status]"
                );

            if (!button) return;

            const id =
                button.dataset.id;

            const status =
                button.dataset.status;

            const ok =
                confirm(
                    `${status} this adoption request?`
                );

            if (!ok) return;

            FamiPetAPI.put(
                "/adoptions/" + id,
                { status }
            ).then(() => {

                showToast(
                    `Request ${status.toLowerCase()}.`
                );

                loadAdoptions();

            }).catch((err) => {

                alert(
                    err.message ||
                    "Could not update the request."
                );
            });
        }
    );


    loadAdoptions();

});