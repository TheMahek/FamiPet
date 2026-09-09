/* =========================================================
   FAMIPET - BREED DETAILS PAGE
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const wrap =
        document.getElementById("breedDetailContent");


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


    function breedImage(breed) {

        if (
            breed.images &&
            breed.images.length &&
            breed.images[0]
        ) {

            return breed.images[0];
        }

        if (breed.species === "cat") {

            return "../assets/images/my-pet/cat.png";
        }

        if (breed.species === "bird") {

            return "../assets/images/my-pet/pet-tip.png";
        }

        return "../assets/images/my-pet/dog1.png";
    }


    function breedTag(text) {

        return `<span class="breed-tag">${escapeHTML(text)}</span>`;
    }


    function tile(icon, label, value) {

        if (!value) return "";

        return `
            <div class="detail-tile">

                <div class="tile-icon">
                    <i class="fa-solid ${icon}"></i>
                </div>

                <strong>${escapeHTML(label)}</strong>

                <span>${escapeHTML(value)}</span>

            </div>
        `;
    }


    function section(title, icon, content) {

        if (!content) return "";

        return `
            <div class="breed-section">

                <h3>
                    <i class="fa-solid ${icon}"></i>
                    ${escapeHTML(title)}
                </h3>

                ${content}

            </div>
        `;
    }


    function render(breed) {

        const temperament =
            Array.isArray(breed.temperament)
                ? breed.temperament
                : [];

        const diseases =
            Array.isArray(breed.commonDiseases)
                ? breed.commonDiseases
                : [];

        wrap.innerHTML = `

            <div class="breed-detail-hero">

                <img
                    src="${escapeHTML(breedImage(breed))}"
                    alt="${escapeHTML(breed.name)}"
                />

                <div>

                    <h2>
                        ${escapeHTML(breed.name)}
                    </h2>

                    <span class="species-pill">
                        ${escapeHTML(speciesLabel(breed.species))}
                    </span>

                </div>

            </div>

            <div class="detail-grid">

                ${tile("fa-location-dot", "Origin", breed.origin)}
                ${tile("fa-heart", "Lifespan", breed.lifespan)}
                ${tile("fa-weight-scale", "Weight", breed.weightRange)}
                ${tile("fa-ruler-vertical", "Height", breed.heightRange)}

            </div>

            ${section(
                "Temperament",
                "fa-face-smile",
                temperament.map(breedTag).join("")
            )}

            ${section(
                "Description",
                "fa-pen",
                escapeHTML(breed.description)
            )}

            ${section(
                "Exercise",
                "fa-person-running",
                escapeHTML(breed.exerciseRequirements)
            )}

            ${section(
                "Grooming",
                "fa-shower",
                escapeHTML(breed.groomingGuide)
            )}

            ${section(
                "Suitable Environment",
                "fa-house",
                escapeHTML(breed.suitableEnvironment)
            )}

            ${section(
                "Common Health Concerns",
                "fa-heart-pulse",
                diseases.map(breedTag).join("")
            )}

        `;
    }


    function showProblem(title, message) {

        wrap.innerHTML = `
            <div class="breeds-empty">
                <i class="fa-solid fa-paw"></i>
                <h3>${escapeHTML(title)}</h3>
                <p style="margin-top:8px;">
                    ${escapeHTML(message)}
                </p>
                <a class="back-link" href="breeds.html" style="text-decoration:none;">
                    <i class="fa-solid fa-arrow-left"></i>
                    Back to All Breeds
                </a>
            </div>
        `;
    }


    async function loadBreed() {

        try {

            if (typeof FamiPetAPI === "undefined") {

                showProblem(
                    "Could not load breed",
                    "The app is not ready. Please try again."
                );

                return;
            }

            const params =
                new URLSearchParams(
                    window.location.search
                );

            const id =
                params.get("id");

            if (!id) {

                showProblem(
                    "No breed selected",
                    "Please pick a breed from the list."
                );

                return;
            }

            const data =
                await FamiPetAPI.get(
                    "/breeds/" + id
                );

            if (!data || !data.breed) {

                showProblem(
                    "Breed not found",
                    "This breed may no longer be available."
                );

                return;
            }

            render(data.breed);

        } catch (error) {

            console.error(
                "Could not load breed details:",
                error
            );

            showProblem(
                "Could not load breed",
                error.message ||
                    "Please check your connection and try again."
            );
        }
    }


    loadBreed();

});