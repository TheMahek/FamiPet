/* =========================================================
   FAMIPET - PET BREEDS PAGE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const grid =
        document.getElementById("breedsGrid");

    const searchInput =
        document.getElementById("breedSearch");

    const filterTabs =
        document.querySelectorAll("#breedFilterTabs .tab-btn");

    let allBreeds = [];
    let currentSpecies = "all";
    let currentSearch = "";


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function speciesLabel(species) {

        return String(species || "")
            .replace(/^\w/, c => c.toUpperCase());
    }


    function breedTag(text) {

        return `<span class="breed-tag">${escapeHTML(text)}</span>`;
    }


    function breedImage(breed, species) {

        if (
            breed.images &&
            breed.images.length &&
            breed.images[0]
        ) {

            return breed.images[0];
        }

        if (species === "cat") {

            return "../assets/images/my-pet/cat.png";
        }

        if (species === "bird") {

            return "../assets/images/my-pet/pet-tip.png";
        }

        return "../assets/images/my-pet/dog1.png";
    }


    function renderBreeds() {

        const filtered =
            allBreeds.filter((breed) => {

                const matchesSpecies =
                    currentSpecies === "all" ||
                    breed.species === currentSpecies;

                const matchesSearch =
                    !currentSearch ||
                    breed.name
                        .toLowerCase()
                        .includes(currentSearch) ||
                    (breed.origin || "")
                        .toLowerCase()
                        .includes(currentSearch);

                return matchesSpecies && matchesSearch;
            });


        if (!allBreeds.length) {

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No breeds found</h3>
                    <p style="margin-top:8px;">
                        Try another search or filter.
                    </p>
                </div>
            `;

            return;
        }


        if (!filtered.length) {

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No breeds found</h3>
                    <p style="margin-top:8px;">
                        Try another search or filter.
                    </p>
                </div>
            `;

            return;
        }


        grid.innerHTML =
            filtered.map((breed) => {

                const temperament =
                    Array.isArray(breed.temperament)
                        ? breed.temperament
                        : [];

                const diseases =
                    Array.isArray(breed.commonDiseases)
                        ? breed.commonDiseases
                        : [];

                const infoRow = (label, value) =>
                    value
                        ? `<div class="breed-info-row">
                               <strong>${escapeHTML(label)}</strong>
                               <span>${escapeHTML(value)}</span>
                           </div>`
                        : "";

                return `

                <article class="breed-card" data-id="${escapeHTML(breed._id)}">

                    <div class="breed-card-img">

                        <img
                            src="${escapeHTML(breedImage(breed, breed.species))}"
                            alt="${escapeHTML(breed.name)}"
                            loading="lazy"
                        />

                    </div>


                    <div class="breed-card-body">

                        <div class="breed-card-top">

                            <h3>
                                ${escapeHTML(breed.name)}
                            </h3>

                            <span class="species-pill">
                                ${escapeHTML(speciesLabel(breed.species))}
                            </span>

                        </div>


                        <div class="breed-meta">

                            ${
                                breed.origin
                                    ? `<span><i class="fa-solid fa-location-dot"></i> ${escapeHTML(breed.origin)}</span>`
                                    : ""
                            }

                            ${
                                breed.lifespan
                                    ? `<span><i class="fa-solid fa-heart"></i> ${escapeHTML(breed.lifespan)}</span>`
                                    : ""
                            }

                            ${
                                breed.weightRange
                                    ? `<span><i class="fa-solid fa-weight-scale"></i> ${escapeHTML(breed.weightRange)}</span>`
                                    : ""
                            }

                        </div>


                        ${
                            breed.description
                                ? `<p class="breed-desc">${escapeHTML(breed.description)}</p>`
                                : ""
                        }


                        <div class="breed-card-detail">

                            <div class="breed-detail-grid">

                                ${infoRow("Origin", breed.origin)}
                                ${infoRow("Lifespan", breed.lifespan)}
                                ${infoRow("Weight", breed.weightRange)}
                                ${infoRow("Height", breed.heightRange)}

                            </div>

                            ${
                                temperament.length
                                    ? `<div class="breed-info-block">
                                           <h4><i class="fa-solid fa-face-smile"></i> Temperament</h4>
                                           <div>${temperament.map(breedTag).join("")}</div>
                                       </div>`
                                    : ""
                            }

                            ${infoRow("Exercise", breed.exerciseRequirements).replace("breed-info-row", "breed-info-row full")}
                            ${infoRow("Grooming", breed.groomingGuide).replace("breed-info-row", "breed-info-row full")}
                            ${infoRow("Suitable Environment", breed.suitableEnvironment).replace("breed-info-row", "breed-info-row full")}

                            ${
                                diseases.length
                                    ? `<div class="breed-info-block">
                                           <h4><i class="fa-solid fa-heart-pulse"></i> Common Health Concerns</h4>
                                           <div>${diseases.map(breedTag).join("")}</div>
                                       </div>`
                                    : ""
                            }

                            <a
                                class="breed-full-link"
                                href="breed-details.html?id=${encodeURIComponent(breed._id)}"
                            >
                                <i class="fa-solid fa-up-right-from-square"></i>
                                Open Full Page
                            </a>

                        </div>


                        <button
                            class="breed-toggle-btn"
                            type="button"
                            aria-expanded="false"
                        >

                            <span class="show-label">
                                View Details
                            </span>

                            <span class="hide-label">
                                Hide Details
                            </span>

                            <i class="fa-solid fa-chevron-down"></i>

                        </button>

                    </div>

                </article>

                `;

            }).join("");
    }


    async function loadBreeds() {

        try {

            const data =
                await FamiPetAPI.get("/breeds");

            allBreeds =
                data.breeds || [];

            renderBreeds();

        } catch (error) {

            console.error(
                "Could not load breeds:",
                error
            );

            grid.innerHTML = `
                <div class="breeds-empty" style="grid-column:1/-1;">
                    <i class="fa-solid fa-paw"></i>
                    <h3>Could not load breeds</h3>
                    <p style="margin-top:8px;">
                        Please check your connection and try again.
                    </p>
                </div>
            `;
        }
    }


    grid.addEventListener(
        "click",
        (event) => {

            if (event.target.closest("a")) return;

            const card =
                event.target.closest(".breed-card");

            if (!card) return;

            const wasExpanded =
                card.classList.contains("expanded");

            grid.querySelectorAll(
                ".breed-card.expanded"
            ).forEach((other) => {

                other.classList.remove("expanded");

                const otherBtn =
                    other.querySelector(
                        ".breed-toggle-btn"
                    );

                if (otherBtn) {

                    otherBtn.setAttribute(
                        "aria-expanded",
                        "false"
                    );
                }
            });

            if (wasExpanded) return;

            card.classList.add("expanded");

            const btn =
                card.querySelector(
                    ".breed-toggle-btn"
                );

            if (btn) {

                btn.setAttribute(
                    "aria-expanded",
                    "true"
                );
            }
        }
    );


    if (searchInput) {

        searchInput.addEventListener(
            "input",
            (event) => {

                currentSearch =
                    event.target.value
                        .trim()
                        .toLowerCase();

                renderBreeds();
            }
        );
    }


    filterTabs.forEach((tab) => {

        tab.addEventListener(
            "click",
            () => {

                filterTabs.forEach((t) =>
                    t.classList.remove("active")
                );

                tab.classList.add("active");

                currentSpecies =
                    tab.dataset.species;

                renderBreeds();
            }
        );
    });


    loadBreeds();

});