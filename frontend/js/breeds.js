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
            filtered.map((breed) => `

                <article class="breed-card">

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

                    </div>

                </article>

            `).join("");
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


    /* =====================================================
       BREED DETAILS MODAL
    ===================================================== */

    function breedTag(text) {

        return `<span style="
            display:inline-block;
            background:#fff0f5;
            color:#c9184a;
            border:1px solid #ffc2d1;
            border-radius:999px;
            padding:4px 12px;
            font-size:13px;
            margin:4px 6px 4px 0;
        ">${escapeHTML(text)}</span>`;
    }


    function detailRow(label, value) {

        if (!value) return "";

        return `<div style="
            flex:1 1 45%;
            min-width:220px;
            padding:10px 4px;
        "><strong style="display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">${escapeHTML(label)}</strong>
        <span style="color:#1f2937;font-size:14px;line-height:1.5;">${escapeHTML(value)}</span></div>`;
    }


    async function openBreedDetails(breed) {

        let detail = breed;

        try {

            const data =
                await FamiPetAPI.get(
                    "/breeds/" + breed._id
                );

            if (data && data.breed) {

                detail = data.breed;
            }

        } catch (error) { /* fallback to card data */ }


        const temperament =
            Array.isArray(detail.temperament)
                ? detail.temperament
                : [];

        const diseases =
            Array.isArray(detail.commonDiseases)
                ? detail.commonDiseases
                : [];


        const modal =
            document.createElement("div");

        modal.className =
            "breed-detail-overlay";

        modal.style.cssText =
            "position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(15,23,42,.6);backdrop-filter:blur(3px);padding:20px;";


        modal.innerHTML = `

            <div style="
                position:relative;
                width:100%;
                max-width:640px;
                max-height:90vh;
                overflow:auto;
                background:#fff;
                border-radius:18px;
                box-shadow:0 25px 50px rgba(0,0,0,.25);
                padding:28px;
            ">

                <button type="button" data-close aria-label="Close" style="
                    position:absolute;top:14px;right:14px;width:34px;height:34px;
                    border:none;cursor:pointer;border-radius:50%;
                    background:#f3f4f6;color:#374151;font-size:16px;line-height:1;
                ">&times;</button>


                <div style="display:flex;gap:18px;align-items:center;margin-bottom:16px;">

                    <img
                        src="${escapeHTML(breedImage(detail, detail.species))}"
                        alt="${escapeHTML(detail.name)}"
                        style="width:96px;height:96px;object-fit:cover;border-radius:14px;flex-shrink:0;"
                    />

                    <div>

                        <h2 style="margin:0 0 6px;color:#111827;font-size:22px;">
                            ${escapeHTML(detail.name)}
                        </h2>

                        <span style="
                            display:inline-block;background:#eef2ff;color:#4338ca;
                            border-radius:999px;padding:3px 12px;font-size:13px;
                        ">${escapeHTML(speciesLabel(detail.species))}</span>

                    </div>

                </div>


                <div style="display:flex;flex-wrap:wrap;border-top:1px solid #f3f4f6;border-bottom:1px solid #f3f4f6;margin-bottom:16px;padding:6px 0;">

                    ${detailRow("Origin", detail.origin)}
                    ${detailRow("Lifespan", detail.lifespan)}
                    ${detailRow("Weight", detail.weightRange)}
                    ${detailRow("Height", detail.heightRange)}

                </div>


                ${
                    temperament.length
                        ? `<p style="margin:10px 0 4px;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;"><strong>Temperament</strong></p>
                           <div>${temperament.map(breedTag).join("")}</div>`
                        : ""
                }

                ${
                    detail.description
                        ? `<p style="margin:14px 0 0;color:#374151;font-size:14px;line-height:1.6;">${escapeHTML(detail.description)}</p>`
                        : ""
                }

                ${
                    detail.exerciseRequirements
                        ? `<div style="margin-top:16px;"><strong style="display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Exercise</strong><span style="color:#1f2937;font-size:14px;">${escapeHTML(detail.exerciseRequirements)}</span></div>`
                        : ""
                }

                ${
                    detail.groomingGuide
                        ? `<div style="margin-top:12px;"><strong style="display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Grooming</strong><span style="color:#1f2937;font-size:14px;">${escapeHTML(detail.groomingGuide)}</span></div>`
                        : ""
                }

                ${
                    detail.suitableEnvironment
                        ? `<div style="margin-top:12px;"><strong style="display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Suitable Environment</strong><span style="color:#1f2937;font-size:14px;">${escapeHTML(detail.suitableEnvironment)}</span></div>`
                        : ""
                }

                ${
                    diseases.length
                        ? `<div style="margin-top:14px;"><strong style="display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.5px;">Common Health Concerns</strong><div>${diseases.map(breedTag).join("")}</div></div>`
                        : ""
                }

            </div>

        `;


        document.body.appendChild(modal);


        const closeModal = () =>
            modal.remove();


        modal.addEventListener(
            "click",
            (event) => {

                if (
                    event.target === modal ||
                    event.target.closest("[data-close]")
                ) {

                    closeModal();
                }
            }
        );


        document.addEventListener(
            "keydown",
            function onKey(event) {

                if (event.key === "Escape") {

                    closeModal();

                    document.removeEventListener(
                        "keydown",
                        onKey
                    );
                }
            }
        );
    }


    grid.addEventListener(
        "click",
        (event) => {

            const card =
                event.target.closest(".breed-card");

            if (!card) return;

            const name =
                card.querySelector("h3").textContent;

            const breed =
                allBreeds.find(
                    (b) => b.name === name
                );

            if (breed) {

                openBreedDetails(breed);
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