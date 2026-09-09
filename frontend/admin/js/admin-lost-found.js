/* =========================================================
   ADMIN - LOST & FOUND REPORTS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("lostFoundBody");


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

        const s = String(status || "active");

        if (s === "resolved") {
            return '<span class="pill green">Resolved</span>';
        }

        return '<span class="pill amber">Active</span>';
    }


    function typePill(type) {

        const t = String(type || "");

        if (t === "found") {
            return '<span class="pill lavender">Found</span>';
        }

        return '<span class="pill red">Lost</span>';
    }


    function speciesLabel(species) {

        return String(species || "other")
            .replace(/^\w/, c => c.toUpperCase());
    }


    async function loadReports() {

        try {

            const data =
                await FamiPetAPI.get("/admin/lost-found");

            const reports =
                data.reports || [];

            if (!reports.length) {

                body.innerHTML =
                    `<tr><td colspan="6" class="admin-empty">
                        <i class="fa-solid fa-magnifying-glass"></i>
                        <p>No lost &amp; found reports yet.</p>
                    </td></tr>`;

                return;
            }

            body.innerHTML =
                reports.map(r => {

                    const resolved =
                        String(r.status) === "resolved";

                    return `

                        <tr>

                            <td>
                                ${typePill(r.type)}
                            </td>

                            <td>
                                <strong>${escapeHTML(r.petName)}</strong>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML(speciesLabel(r.species))}
                                    ${r.breed ? " • " + escapeHTML(r.breed) : ""}
                                </div>
                            </td>

                            <td>
                                <div>${escapeHTML(r.contactName || "—")}</div>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML(r.contactPhone || "")}
                                </div>
                            </td>

                            <td>
                                <div>${escapeHTML(r.location || "—")}</div>
                                <div style="font-size:0.72rem;color:#8a96a8;">
                                    ${escapeHTML(r.description || "")}
                                </div>
                            </td>

                            <td>${statusPill(r.status)}</td>

                            <td>

                                <button
                                    class="admin-btn-sm ${resolved ? "btn-unblock" : "btn-approve"}"
                                    data-status="${resolved ? "active" : "resolved"}"
                                    data-id="${escapeHTML(r._id)}"
                                >
                                    ${resolved ? "Reopen" : "Resolve"}
                                </button>

                                <button
                                    class="admin-btn-sm btn-danger"
                                    data-delete="${escapeHTML(r._id)}"
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
                    Could not load reports: ${escapeHTML(err.message || "Unknown error")}
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

                const status =
                    statusBtn.dataset.status;

                if (!confirm(`Mark this report as ${status}?`)) return;

                FamiPetAPI.put(
                    "/admin/lost-found/" + id + "/status",
                    { status }
                ).then(() => {

                    showToast(
                        `Report marked ${status}.`
                    );

                    loadReports();

                }).catch((err) => {

                    showToast(
                        err.message || "Could not update the report.",
                        true
                    );
                });

                return;
            }

            if (deleteBtn) {

                const id =
                    deleteBtn.dataset.delete;

                if (!confirm("Delete this report permanently?")) return;

                FamiPetAPI.del(
                    "/admin/lost-found/" + id
                ).then(() => {

                    showToast("Report deleted.");

                    loadReports();

                }).catch((err) => {

                    showToast(
                        err.message || "Could not delete the report.",
                        true
                    );
                });
            }
        }
    );


    loadReports();

});