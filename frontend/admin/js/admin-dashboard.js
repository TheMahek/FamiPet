/* =========================================================
   ADMIN - DASHBOARD
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const statsGrid =
        document.getElementById("statsGrid");

    const recentBody =
        document.getElementById("recentUsersBody");


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    const statConfig = [
        { key: "totalUsers", label: "Total Users", icon: "fa-users", color: "pink" },
        { key: "totalPets", label: "Total Pets", icon: "fa-paw", color: "green" },
        { key: "availablePets", label: "Available Pets", icon: "fa-heart", color: "lavender" },
        { key: "adoptedPets", label: "Adopted Pets", icon: "fa-house", color: "cyan" },
        { key: "pendingAdoptions", label: "Pending Adoptions", icon: "fa-file-lines", color: "amber" },
        { key: "lostFoundReports", label: "Lost & Found", icon: "fa-magnifying-glass", color: "pink" },
    ];


    async function loadDashboard() {

        try {

            const data =
                await FamiPetAPI.get("/admin/dashboard");

            const stats =
                data.stats || {};

            statsGrid.innerHTML =
                statConfig.map(item => `

                    <div class="stat-card">

                        <div class="stat-icon ${item.color}">

                            <i class="fa-solid ${item.icon}"></i>

                        </div>

                        <div>

                            <h4>${item.label}</h4>

                            <div class="stat-val">
                                ${Number(stats[item.key] || 0)}
                            </div>

                        </div>

                    </div>

                `).join("");

        } catch (err) {

            console.error(err);

            statsGrid.innerHTML =
                `<div class="admin-empty admin-card">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Could not load statistics: ${escapeHTML(err.message || "Unknown error")}</p>
                </div>`;
        }
    }


    async function loadRecentUsers() {

        try {

            const data =
                await FamiPetAPI.get("/admin/users/recent");

            const users =
                data.users || [];

            if (!users.length) {

                recentBody.innerHTML =
                    `<tr><td colspan="4" class="admin-empty">
                        <i class="fa-solid fa-users"></i>
                        <p>No users registered yet.</p>
                    </td></tr>`;

                return;
            }

            recentBody.innerHTML =
                users.map(u => `

                    <tr>

                        <td>
                            <strong>${escapeHTML(u.name)}</strong>
                        </td>

                        <td>${escapeHTML(u.email)}</td>

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

                    </tr>

                `).join("");

        } catch (err) {

            console.error(err);

            recentBody.innerHTML =
                `<tr><td colspan="4" class="admin-empty">
                    Could not load recent users.
                </td></tr>`;
        }
    }


    loadDashboard();
    loadRecentUsers();

});