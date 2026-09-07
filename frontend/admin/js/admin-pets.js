/* =========================================================
   ADMIN - PETS
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const body =
        document.getElementById("petsBody");


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


    function statusPill(pet) {

        if (pet.adopted) {
            return '<span class="pill green">Adopted</span>';
        }

        if (pet.status === "available") {
            return '<span class="pill lavender">Available</span>';
        }

        if (pet.status === "lost") {
            return '<span class="pill red">Lost</span>';
        }

        if (pet.status === "inactive") {
            return '<span class="pill gray">Inactive</span>';
        }

        return `<span class="pill amber">${escapeHTML(pet.status || "—")}</span>`;
    }


    async function loadPets() {

        try {

            const data =
                await FamiPetAPI.get("/admin/pets");

            const pets =
                data.pets || [];

            if (!pets.length) {

                body.innerHTML =
                    `<tr><td colspan="7" class="admin-empty">
                        <i class="fa-solid fa-paw"></i>
                        <p>No pets added yet.</p>
                    </td></tr>`;

                return;
            }

            body.innerHTML =
                pets.map(p => `

                    <tr>

                        <td>
                            <strong>${escapeHTML(p.name)}</strong>
                        </td>

                        <td>
                            <span class="pill gray">
                                ${escapeHTML(String(p.species || "").replace(/^\w/, c => c.toUpperCase()))}
                            </span>
                        </td>

                        <td>${escapeHTML(p.breed || "—")}</td>

                        <td>${p.age ? escapeHTML(String(p.age)) : "—"}</td>

                        <td>${statusPill(p)}</td>

                        <td>
                            ${
                                p.owner
                                    ? `<strong>${escapeHTML(p.owner.name)}</strong><br/>
                                       <span style="font-size:0.72rem;color:#8a96a8;">${escapeHTML(p.owner.email || "")}</span>`
                                    : '<span style="color:#8a96a8;">—</span>'
                            }
                        </td>

                        <td>

                            <button
                                class="admin-btn-sm btn-danger"
                                data-delete="${escapeHTML(p.id)}"
                            >
                                Delete
                            </button>

                        </td>

                    </tr>

                `).join("");

        } catch (err) {

            console.error(err);

            body.innerHTML =
                `<tr><td colspan="7" class="admin-empty">
                    Could not load pets: ${escapeHTML(err.message || "Unknown error")}
                </td></tr>`;
        }
    }


    body.addEventListener(
        "click",
        (event) => {

            const button =
                event.target.closest(
                    "[data-delete]"
                );

            if (!button) return;

            const id =
                button.dataset.delete;

            const ok =
                confirm(
                    "Delete this pet listing? This cannot be undone."
                );

            if (!ok) return;

            FamiPetAPI.del(
                "/admin/pets/" + id
            ).then(() => {

                showToast(
                    "Pet deleted."
                );

                loadPets();

            }).catch((err) => {

                alert(
                    err.message || "Could not delete pet."
                );
            });
        }
    );


    loadPets();

});