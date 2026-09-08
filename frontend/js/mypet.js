document.addEventListener("DOMContentLoaded", () => {

    /* =====================================================
       Famipet - MY PETS PAGE
       Functional JavaScript
       ===================================================== */


    /* =====================================================
       1. ELEMENTS
       ===================================================== */

    const petsGrid = document.querySelector(".pets-grid");

    const petSearchInput = document.querySelector(
        ".search-pets-input input"
    );

    const globalSearchInput = document.querySelector(
        ".search-bar input"
    );

    const filterTabs = document.querySelectorAll(".tab-btn");

    const addPetTopButton = document.querySelector(
        ".header-right .btn-pink"
    );

    const addPetBottomCard = document.querySelector(
        ".add-pet-dashed-card"
    );


    const notificationButton = document.querySelector(
        ".badge-btn"
    );


    /* =====================================================
       2. PET DATA
       ===================================================== */

    const defaultPets = [
        {
            id: "bruno-001",
            name: "Bruno",
            species: "Dog",
            breed: "Labrador Retriever",
            gender: "Male",
            age: "2 Years",
            weight: "24 kg",
            vaccinated: "Yes",
            health: "Good",
            image: "../assets/images/my-pet/dog1.png",
            appointment: true,
            notes: "Bruno is friendly, playful and loves going for walks."
        },

        {
            id: "luna-002",
            name: "Luna",
            species: "Cat",
            breed: "Persian Cat",
            gender: "Female",
            age: "1 Year",
            weight: "4.2 kg",
            vaccinated: "Yes",
            health: "Good",
            image: "../assets/images/my-pet/cat.png",
            appointment: false,
            notes: "Luna is calm, affectionate and loves her little fish toy."
        }
    ];


    let pets = [];

    let currentFilter = "All";
    let currentSearch = "";


    /* =====================================================
       3. BACKEND DATA LAYER
       ===================================================== */

    function capFirst(s) {

        return String(s || "")

            .trim()

            .replace(
                /^\w/,
                (c) => c.toUpperCase()
            );
    }


    function toFrontendPet(p) {

        return {

            id: p._id,

            name: p.name,

            breed:
                (p.breed && p.breed.name) ||
                p.breed ||
                "",

            species:
                capFirst(p.species),

            gender:
                capFirst(p.gender),

            age:
                `${p.age} ${
                    p.age === 1
                        ? "Year"
                        : "Years"
                }`,

            weight:
                `${p.weight} kg`,

            vaccinated:
                p.vaccinated
                    ? "Yes"
                    : "No",

            health:
                "Good",

            appointment:
                !!p.appointment,

            image:
                (p.images && p.images.length)
                    ? p.images[0]
                    : getSpeciesImage(
                        capFirst(p.species)
                    ),

            notes:
                p.description || "",

            qrCode:
                p.qrCode || ""
        };
    }


    function parsePetAge(input) {

        const raw =
            String(input || "").trim();

        const match =
            raw.match(/(\d+(?:\.\d+)?)/);

        return match ? parseFloat(match[1]) : NaN;

    }


    function buildPetPayload(fp) {

        return {

            name: fp.name,

            species:
                String(fp.species).toLowerCase(),

            breed: fp.breed,

            gender:
                String(fp.gender).toLowerCase(),

            age: parsePetAge(fp.age),

            weight:
                parseFloat(fp.weight) || 0,

            vaccinated:
                fp.vaccinated === "Yes",

            description:
                fp.notes || ""
        };
    }


    async function fetchMyPets() {

        try {

            const data =
                await FamiPetAPI.get("/pets/my");

            pets =
                (data.pets || []).map(
                    toFrontendPet
                );

            currentFilter = "All";

            currentSearch = "";

            renderPets();

        } catch (error) {

            console.error(
                "Could not load pets:",
                error
            );
        }
    }


    function createPetOnBackend(fp, imageData) {

        const payload =
            buildPetPayload(fp);

        if (imageData) {

            payload.images =
                [imageData];
        }

        return FamiPetAPI.post(
            "/pets",
            payload
        ).then(res => res.pet);
    }


    function updatePetOnBackend(id, fp, imageData) {

        const payload =
            buildPetPayload(fp);

        if (imageData) {

            payload.images =
                [imageData];
        }

        return FamiPetAPI.put(
            "/pets/" + id,
            payload
        ).then(res => res.pet);
    }


    function deletePetOnBackend(id) {

        return FamiPetAPI.del(
            "/pets/" + id
        );
    }


    /* =====================================================
       4. HELPER FUNCTIONS
       ===================================================== */

    function generateId() {

        return "pet-" +
            Date.now() +
            "-" +
            Math.floor(Math.random() * 1000);
    }


    function getGenderIcon(gender) {

        if (gender === "Female") {
            return "fa-venus";
        }

        return "fa-mars";
    }


    function getSpeciesImage(species) {

        if (species === "Dog") {
            return "../assets/images/my-pet/dog1.png";
        }

        if (species === "Cat") {
            return "../assets/images/my-pet/cat.png";
        }

        if (species === "Bird") {
            return "../assets/images/my-pet/pet-tip.png";
        }

        return "../assets/images/dashboard/cute-pet.svg";
    }


    function escapeHTML(text) {

        const div = document.createElement("div");

        div.textContent = text;

        return div.innerHTML;
    }


    /* =====================================================
       5. RENDER PETS
       ===================================================== */

    function renderPets() {

        petsGrid.innerHTML = "";

        let filteredPets = pets.filter((pet) => {

            const matchesFilter =
                currentFilter === "All" ||
                pet.species === currentFilter;

            const searchText = currentSearch.toLowerCase();

            const matchesSearch =
                pet.name.toLowerCase().includes(searchText) ||
                pet.breed.toLowerCase().includes(searchText) ||
                pet.species.toLowerCase().includes(searchText);

            return matchesFilter && matchesSearch;
        });


        /* ---------------------------------------------
           No Results
        --------------------------------------------- */

        if (filteredPets.length === 0) {

            petsGrid.innerHTML = `
                <div style="
                    grid-column: 1 / -1;
                    text-align: center;
                    padding: 60px 20px;
                    background: white;
                    border-radius: 20px;
                ">

                    <i
                        class="fa-solid fa-paw"
                        style="
                            font-size: 40px;
                            color: #ff4d6d;
                            margin-bottom: 15px;
                        "
                    ></i>

                    <h3>No pets found</h3>

                    <p style="
                        color: #8a96a8;
                        margin-top: 8px;
                    ">
                        Try another search or filter.
                    </p>

                </div>
            `;

            updateStatistics();

            return;
        }


        /* ---------------------------------------------
           Create Cards
        --------------------------------------------- */

        filteredPets.forEach((pet) => {

            const card = createPetCard(pet);

            petsGrid.appendChild(card);

        });


        updateStatistics();
    }


    /* =====================================================
       6. CREATE PET CARD
       ===================================================== */

    function createPetCard(pet) {

        const card = document.createElement("div");

        card.className = "pet-card";

        card.dataset.petId = pet.id;


        card.innerHTML = `

            <div class="pet-image">

                <img
                    src="${escapeHTML(pet.image)}"
                    alt="${escapeHTML(pet.name)}"
                />

            </div>


            <div class="pet-details">

                <div class="pet-header">

                    <div>

                        <h3 class="pet-name">

                            ${escapeHTML(pet.name)}

                            <span class="gender ${
                                pet.gender === "Female"
                                    ? "female"
                                    : "male"
                            }">

                                <i class="fa-solid ${
                                    getGenderIcon(pet.gender)
                                }"></i>

                            </span>

                        </h3>


                        <p class="pet-breed">

                            ${escapeHTML(pet.breed)}

                        </p>

                    </div>


                    <div class="pet-header-right">

                        <span class="badge-status green-badge">

                            <i class="fa-regular fa-heart"></i>

                            ${escapeHTML(pet.health)}

                        </span>


                        <button
                            class="more-btn"
                            type="button"
                            title="More options"
                        >

                            <i class="fa-solid fa-ellipsis-vertical"></i>

                        </button>

                    </div>

                </div>


                <div class="info-list">

                    <div class="info-row">

                        <span class="info-label">

                            <i class="fa-regular fa-calendar"></i>

                            Age

                        </span>

                        <span class="info-value">

                            ${escapeHTML(pet.age)}

                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">

                            <i class="fa-solid fa-scale-balanced"></i>

                            Weight

                        </span>

                        <span class="info-value">

                            ${escapeHTML(pet.weight)}

                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">

                            <i class="fa-solid fa-syringe"></i>

                            Vaccinated

                        </span>

                        <span class="info-value ${
                            pet.vaccinated === "Yes"
                                ? "status-yes"
                                : ""
                        }">

                            ${escapeHTML(pet.vaccinated)}

                        </span>

                    </div>


                    <div class="info-row">

                        <span class="info-label">

                            <i class="fa-regular fa-circle-check"></i>

                            Health Status

                        </span>

                        <span class="info-value status-good">

                            ${escapeHTML(pet.health)}

                        </span>

                    </div>

                </div>


                <div class="card-actions">

                    <button
                        class="btn btn-outline-pink view-details-btn"
                        type="button"
                    >

                        <i class="fa-regular fa-eye"></i>

                        View Details

                    </button>


                    <button
                        class="btn btn-icon-blue edit-pet-btn"
                        type="button"
                        title="Edit Pet"
                    >

                        <i class="fa-solid fa-pen"></i>

                    </button>

                </div>

            </div>

        `;


        /* ---------------------------------------------
           View Details
        --------------------------------------------- */

        const viewButton = card.querySelector(
            ".view-details-btn"
        );

        viewButton.addEventListener("click", () => {

            viewPetDetails(pet.id);

        });


        /* ---------------------------------------------
           Edit
        --------------------------------------------- */

        const editButton = card.querySelector(
            ".edit-pet-btn"
        );

        editButton.addEventListener("click", () => {

            editPet(pet.id);

        });


        /* ---------------------------------------------
           Three Dots
        --------------------------------------------- */

        const moreButton = card.querySelector(
            ".more-btn"
        );

        moreButton.addEventListener("click", () => {

            showPetMenu(pet.id);

        });


        return card;
    }

/* =====================================================
   ADD NEW PET MODAL
===================================================== */

function addNewPet() {

    openPetModal();

}


/* =====================================================
   CREATE PET MODAL
===================================================== */

function openPetModal(editingPet = null) {

    const isEditing = editingPet !== null;

    const modal = document.createElement("div");

    modal.className = "pet-modal-overlay";

    modal.id = "petModal";


    modal.innerHTML = `

        <div class="pet-modal">

            <!-- HEADER -->

            <div class="pet-modal-header">

                <div class="pet-modal-title">

                    <div class="pet-modal-icon">
                        <i class="fa-solid fa-paw"></i>
                    </div>

                    <div>

                        <h2>
                            ${isEditing
                                ? "Edit Pet"
                                : "Add New Pet"}
                        </h2>

                        <p>
                            ${
                                isEditing
                                    ? "Update your pet's information"
                                    : "Add your furry friend to Famipet"
                            }
                        </p>

                    </div>

                </div>


                <button
                    type="button"
                    class="pet-modal-close"
                    id="closePetModal"
                >

                    <i class="fa-solid fa-xmark"></i>

                </button>

            </div>


            <!-- BODY -->

            <form id="petForm">

                <div class="pet-modal-body">


                    <!-- PHOTO -->

                    <div class="pet-photo-section">

                        <div
                            class="pet-photo-preview"
                            id="petPhotoPreview"
                        >

                            ${
                                isEditing && editingPet.image
                                    ? `
                                        <img
                                            src="${editingPet.image}"
                                            alt="Pet"
                                        >
                                      `
                                    : `
                                        <i class="fa-solid fa-camera"></i>
                                      `
                            }

                        </div>


                        <div class="pet-photo-info">

                            <h4>Pet Photo</h4>

                            <p>
                                Add a cute photo of your pet
                            </p>


                            <label class="pet-photo-label">

                                <i class="fa-solid fa-upload"></i>

                                Choose Photo

                                <input
                                    type="file"
                                    id="petPhoto"
                                    accept="image/*"
                                >

                            </label>

                        </div>

                    </div>


                    <!-- FORM -->

                    <div class="pet-form-grid">


                        <!-- NAME -->

                        <div class="pet-form-group">

                            <label>
                                Pet Name <span>*</span>
                            </label>

                            <input
                                type="text"
                                id="petName"
                                placeholder="e.g. Bruno"
                                value="${
                                    isEditing
                                        ? editingPet.name
                                        : ""
                                }"
                                required
                            >

                        </div>


                        <!-- SPECIES -->

                      <!-- SPECIES -->

<div class="pet-form-group">

    <label>
        Species <span>*</span>
    </label>

    <select
        id="petSpecies"
        required
    >

        <option value="">
            Choose species
        </option>

        <option value="Dog">
            🐶 Dog
        </option>

        <option value="Cat">
            🐱 Cat
        </option>

        <option value="Bird">
            🐦 Bird
        </option>

        <option value="Other">
            🐾 Other
        </option>

    </select>

    <input
        type="text"
        id="customSpecies"
        placeholder="Enter your pet's species"
        style="display: none; margin-top: 10px;"
    >

</div>


                        <!-- BREED -->

                       <!-- BREED -->

<div class="pet-form-group">

    <label>
        Breed <span>*</span>
    </label>

    <select
        id="petBreed"
        required
    >

        <option value="">
            Choose species first
        </option>

    </select>

    <input
        type="text"
        id="customBreed"
        placeholder="Enter your pet's breed"
        style="display: none; margin-top: 10px;"
    >

</div>


                        <!-- GENDER -->

                        <div class="pet-form-group">

                            <label>
                                Gender <span>*</span>
                            </label>

                            <select
                                id="petGender"
                                required
                            >

                                <option value="">
                                    Choose gender
                                </option>

                                <option value="Male">
                                    ♂ Male
                                </option>

                                <option value="Female">
                                    ♀ Female
                                </option>

                            </select>

                        </div>


                        <!-- AGE -->

                        <div class="pet-form-group">

                            <label>
                                Age <span>*</span>
                            </label>

                            <input
                                list="ageOptions"
                                id="petAge"
                                placeholder="Choose or type age"
                                value="${
                                    isEditing
                                        ? editingPet.age
                                        : ""
                                }"
                                required
                            >

                            <datalist id="ageOptions">

                                <option value="2 Months">
                                <option value="4 Months">
                                <option value="6 Months">
                                <option value="1 Year">
                                <option value="2 Years">
                                <option value="3 Years">
                                <option value="4 Years">
                                <option value="5 Years">
                                <option value="6 Years">
                                <option value="7 Years">
                                <option value="8 Years">
                                <option value="9 Years">
                                <option value="10 Years">

                            </datalist>

                            <span class="form-hint">
                                Choose an age or type your own
                            </span>

                        </div>


                        <!-- WEIGHT -->

                        <div class="pet-form-group">

                            <label>
                                Weight <span>*</span>
                            </label>

                            <input
                                list="weightOptions"
                                id="petWeight"
                                placeholder="Choose or type weight"
                                value="${
                                    isEditing
                                        ? editingPet.weight
                                        : ""
                                }"
                                required
                            >

                            <datalist id="weightOptions">

                                <option value="1 kg">
                                <option value="2 kg">
                                <option value="3 kg">
                                <option value="4 kg">
                                <option value="5 kg">
                                <option value="7 kg">
                                <option value="10 kg">
                                <option value="15 kg">
                                <option value="20 kg">
                                <option value="25 kg">
                                <option value="30 kg">
                                <option value="35 kg">
                                <option value="40 kg">

                            </datalist>

                            <span class="form-hint">
                                Choose a weight or type your own
                            </span>

                        </div>


                        <!-- VACCINATION -->

                        <div class="pet-form-group">

                            <label>
                                Vaccination <span>*</span>
                            </label>

                            <select
                                id="petVaccinated"
                                required
                            >

                                <option value="">
                                    Choose status
                                </option>

                                <option value="Yes">
                                    ✓ Vaccinated
                                </option>

                                <option value="No">
                                    Not Vaccinated
                                </option>

                            </select>

                        </div>


                        <!-- HEALTH -->

                        <div class="pet-form-group">

                            <label>
                                Health Status <span>*</span>
                            </label>

                            <select
                                id="petHealth"
                                required
                            >

                                <option value="">
                                    Choose health status
                                </option>

                                <option value="Good">
                                    💚 Good
                                </option>

                                <option value="Healthy">
                                    💚 Healthy
                                </option>

                                <option value="Needs Attention">
                                    🟡 Needs Attention
                                </option>

                                <option value="Poor">
                                    🔴 Poor
                                </option>

                            </select>

                        </div>


                        <!-- APPOINTMENT -->

                        <div class="pet-form-group">

                            <label>
                                Upcoming Appointment
                            </label>

                            <input
                                type="date"
                                id="petAppointment"
                            >

                            <span class="form-hint">
                                Optional
                            </span>

                        </div>


                        <!-- NOTES -->

                        <div class="pet-form-group full-width">

                            <label>
                                Notes
                            </label>

                            <textarea
                                id="petNotes"
                                placeholder="Anything you'd like to remember about your pet..."
                            >${
                                isEditing
                                    ? editingPet.notes || ""
                                    : ""
                            }</textarea>

                            <span class="form-hint">
                                Optional
                            </span>

                        </div>

                    </div>

                </div>


                <!-- FOOTER -->

                <div class="pet-modal-footer">

                    <button
                        type="button"
                        class="pet-modal-btn pet-modal-cancel"
                        id="cancelPetModal"
                    >

                        Cancel

                    </button>


                    <button
                        type="submit"
                        class="pet-modal-btn pet-modal-submit"
                    >

                        <i class="fa-solid fa-plus"></i>

                        ${
                            isEditing
                                ? "Save Changes"
                                : "Add Pet"
                        }

                    </button>

                </div>

            </form>

        </div>

    `;


    document.body.appendChild(modal);


    /* =================================================
       SHOW MODAL
    ================================================= */

    requestAnimationFrame(() => {

        modal.classList.add("show");

    });


    /* =================================================
       ELEMENTS
    ================================================= */

    const form =
        modal.querySelector("#petForm");

    const closeButton =
        modal.querySelector("#closePetModal");

    const cancelButton =
        modal.querySelector("#cancelPetModal");

    const speciesSelect =
        modal.querySelector("#petSpecies");

    const breedSelect =
        modal.querySelector("#petBreed");

    const customSpeciesInput =
    modal.querySelector("#customSpecies");

const customBreedInput =
    modal.querySelector("#customBreed");

    const photoInput =
        modal.querySelector("#petPhoto");

    const photoPreview =
        modal.querySelector("#petPhotoPreview");


    /* =================================================
       SET EDIT VALUES
    ================================================= */

    if (isEditing) {

        speciesSelect.value =
            editingPet.species;

        updateBreedOptions(
            editingPet.species,
            editingPet.breed
        );


        modal.querySelector("#petGender").value =
            editingPet.gender;

        modal.querySelector("#petVaccinated").value =
            editingPet.vaccinated;

        modal.querySelector("#petHealth").value =
            editingPet.health;


        if (editingPet.appointmentDate) {

            modal.querySelector("#petAppointment").value =
                editingPet.appointmentDate;

        }

    }


    /* =================================================
       SPECIES → BREED DROPDOWN
    ================================================= */
speciesSelect.addEventListener(
    "change",
    () => {

        const selectedSpecies =
            speciesSelect.value;


        /* =========================================
           OTHER SPECIES
        ========================================= */

        if (selectedSpecies === "Other") {

            customSpeciesInput.style.display =
                "block";

            customSpeciesInput.required =
                true;

            customSpeciesInput.focus();


            /* Reset breed */

            breedSelect.innerHTML = `
                <option value="">
                    Enter species first
                </option>
            `;

            breedSelect.disabled = true;

        }

        /* =========================================
           NORMAL SPECIES
        ========================================= */

        else {

            customSpeciesInput.style.display =
                "none";

            customSpeciesInput.required =
                false;

            customSpeciesInput.value = "";


            breedSelect.disabled = false;


            updateBreedOptions(
                selectedSpecies
            );

        }

    }
);
/* =================================================
   CUSTOM SPECIES → BREED
================================================= */

customSpeciesInput.addEventListener(
    "input",
    () => {

        const customSpecies =
            customSpeciesInput.value.trim();


        if (!customSpecies) {

            breedSelect.innerHTML = `
                <option value="">
                    Enter species first
                </option>
            `;

            breedSelect.disabled = true;

            return;
        }


        breedSelect.disabled = false;


        updateBreedOptions(
            customSpecies
        );

    }
);

breedSelect.addEventListener(
    "change",
    () => {

        if (breedSelect.value === "Other") {

            customBreedInput.style.display =
                "block";

            customBreedInput.required =
                true;

        } else {

            customBreedInput.style.display =
                "none";

            customBreedInput.required =
                false;

            customBreedInput.value = "";

        }

    }
);


    /* =================================================
       PHOTO PREVIEW
    ================================================= */

    photoInput.addEventListener(
        "change",
        () => {

            const file =
                photoInput.files[0];

            if (!file) {
                return;
            }


            const reader =
                new FileReader();


            reader.onload = (event) => {

                photoPreview.innerHTML = `
                    <img
                        src="${event.target.result}"
                        alt="Pet Preview"
                    >
                `;

            };


            reader.readAsDataURL(file);

        }
    );


    /* =================================================
       CLOSE
    ================================================= */

    function closeModal() {

        modal.classList.remove("show");

        setTimeout(() => {

            modal.remove();

        }, 250);

    }


    closeButton.addEventListener(
        "click",
        closeModal
    );


    cancelButton.addEventListener(
        "click",
        closeModal
    );


    /* Click outside */

    modal.addEventListener(
        "click",
        (event) => {

            if (event.target === modal) {

                closeModal();

            }

        }
    );


    /* ESC */

    document.addEventListener(
        "keydown",
        function escapeHandler(event) {

            if (
                event.key === "Escape" &&
                document.getElementById("petModal")
            ) {

                closeModal();

                document.removeEventListener(
                    "keydown",
                    escapeHandler
                );

            }

        }
    );


    /* =================================================
       SUBMIT
    ================================================= */

    form.addEventListener(
        "submit",
        (event) => {

            event.preventDefault();


            const name =
                modal.querySelector("#petName").value.trim();

let species =
    speciesSelect.value;

let breed =
    breedSelect.value;


/* -----------------------------
   CUSTOM SPECIES
----------------------------- */

if (species === "Other") {

    species =
        customSpeciesInput.value.trim();

}


/* -----------------------------
   CUSTOM BREED
----------------------------- */

if (breed === "Other") {

    breed =
        customBreedInput.value.trim();

}

            const gender =
                modal.querySelector("#petGender").value;

            const age =
                modal.querySelector("#petAge").value.trim();

            const weight =
                modal.querySelector("#petWeight").value.trim();

            const vaccinated =
                modal.querySelector("#petVaccinated").value;

            const health =
                modal.querySelector("#petHealth").value;

            const appointmentDate =
                modal.querySelector("#petAppointment").value;

            const notes =
                modal.querySelector("#petNotes").value.trim();


            /* =========================================
               VALIDATION
            ========================================= */

            const parsedAge =
                parsePetAge(age);

            const parsedWeight =
                parseFloat(weight);


            if (
                !name ||
                !species ||
                !breed ||
                !gender ||
                !age ||
                !weight ||
                !vaccinated ||
                !health
            ) {

                let errorMessage =
                    modal.querySelector(".pet-form-error");

                if (!errorMessage) {
                    errorMessage = document.createElement("div");
                    errorMessage.className = "pet-form-error";
                    errorMessage.setAttribute("role", "alert");

                    const form = modal.querySelector("#petForm");
                    const firstField = form.querySelector(".form-group");

                    if (firstField) {
                        firstField.parentNode.insertBefore(
                            errorMessage,
                            firstField
                        );
                    } else {
                        form.prepend(errorMessage);
                    }
                }

                errorMessage.textContent =
                    "Please fill all required fields.";

                return;

            }


            /* =========================================
               NUMERIC VALIDATION
               The backend requires a numeric age. If the
               value cannot be parsed to a number, stop here
               instead of sending NaN and causing a 400.
            ========================================= */

            if (
                typeof parsedAge !== "number" ||
                Number.isNaN(parsedAge) ||
                parsedAge < 0
            ) {

                let errorMessage =
                    modal.querySelector(".pet-form-error");

                if (!errorMessage) {
                    errorMessage = document.createElement("div");
                    errorMessage.className = "pet-form-error";
                    errorMessage.setAttribute("role", "alert");

                    const form = modal.querySelector("#petForm");
                    const firstField = form.querySelector(".form-group");

                    if (firstField) {
                        firstField.parentNode.insertBefore(
                            errorMessage,
                            firstField
                        );
                    } else {
                        form.prepend(errorMessage);
                    }
                }

                errorMessage.textContent =
                    "Please enter a valid numeric age.";

                return;

            }


            /* =========================================
               IMAGE
            ========================================= */

            const selectedFile =
                photoInput.files[0];


            if (isEditing) {

                /* =====================================
                   EDIT EXISTING PET
                ===================================== */

                editingPet.name =
                    name;

                editingPet.species =
                    species;

                editingPet.breed =
                    breed;

                editingPet.gender =
                    gender;

                editingPet.age =
                    age;

                editingPet.weight =
                    weight;

                editingPet.vaccinated =
                    vaccinated;

                editingPet.health =
                    health;

                editingPet.appointmentDate =
                    appointmentDate;

                editingPet.appointment =
                    appointmentDate !== "";

                editingPet.notes =
                    notes;


                if (selectedFile) {

                    const reader =
                        new FileReader();

                    reader.onload = (event) => {

                        const imageData =
                            event.target.result;

                        editingPet.image =
                            imageData;

                        updatePetOnBackend(
                            editingPet.id,
                            editingPet,
                            imageData
                        ).then((saved) => {

                            pets = pets.map(p =>
                                p.id === saved._id
                                    ? toFrontendPet(saved)
                                    : p
                            );

                            renderPets();

                        }).catch((err) => {

                            console.error(err);

                            alert(
                                "Could not update pet: " +
                                (err.message || "Unknown error")
                            );

                        });

                    };

                    reader.readAsDataURL(
                        selectedFile
                    );

                } else {

                    updatePetOnBackend(
                        editingPet.id,
                        editingPet
                    ).then((saved) => {

                        pets = pets.map(p =>
                            p.id === saved._id
                                ? toFrontendPet(saved)
                                : p
                        );

                        renderPets();

                    }).catch((err) => {

                        console.error(err);

                        alert(
                            "Could not update pet: " +
                            (err.message || "Unknown error")
                        );

                    });

                }


            }

            else {

                /* =====================================
                   ADD NEW PET
                ===================================== */

                const newPet = {

                    id: generateId(),

                    name: name,

                    species: species,

                    breed: breed,

                    gender: gender,

                    age: age,

                    weight: weight,

                    vaccinated: vaccinated,

                    health: health,

                    image:
                        getSpeciesImage(species),

                    appointment:
                        appointmentDate !== "",

                    appointmentDate:
                        appointmentDate,

                    notes:
                        notes

                };


                if (selectedFile) {

                    const reader =
                        new FileReader();


                    reader.onload = (event) => {

                        const imageData =
                            event.target.result;

                        newPet.image =
                            imageData;

                        createPetOnBackend(
                            newPet,
                            imageData
                        ).then((saved) => {

                            pets.unshift(
                                toFrontendPet(saved)
                            );

                            renderPets();

                        }).catch((err) => {

                            console.error(err);

                            alert(
                                "Could not add pet: " +
                                (err.message || "Unknown error")
                            );

                        });

                    };


                    reader.readAsDataURL(
                        selectedFile
                    );

                }

else {

    createPetOnBackend(newPet)
        .then((saved) => {

            pets.unshift(
                toFrontendPet(saved)
            );

            renderPets();

        })
        .catch((err) => {

            console.error(err);

            alert(
                "Could not add pet: " +
                (err.message || "Unknown error")
            );

        });

}

}


            closeModal();

        }
    );

}


/* =====================================================
   BREED OPTIONS
===================================================== */

/* =====================================================
   BREED OPTIONS
===================================================== */

function updateBreedOptions(
    species,
    selectedBreed = ""
) {

    const breedSelect =
        document.querySelector("#petBreed");

    if (!breedSelect) {
        return;
    }


    /* =================================================
       BREED DATABASE
    ================================================= */

    const breeds = {

        Dog: [
            "Labrador Retriever",
            "Golden Retriever",
            "German Shepherd",
            "Beagle",
            "Pug",
            "Shih Tzu",
            "Pomeranian",
            "Rottweiler",
            "Husky",
            "Dachshund",
            "Cocker Spaniel",
            "Indie / Indian Pariah",
            "Other"
        ],

        Cat: [
            "Persian",
            "Siamese",
            "Maine Coon",
            "British Shorthair",
            "Ragdoll",
            "Bengal",
            "Bombay",
            "Himalayan",
            "Indie / Domestic Shorthair",
            "Other"
        ],

        Bird: [
            "Parrot",
            "Budgerigar",
            "Cockatiel",
            "Lovebird",
            "Finch",
            "Canary",
            "Macaw",
            "Other"
        ],

        Rabbit: [
            "Holland Lop",
            "Netherland Dwarf",
            "Mini Rex",
            "Lionhead",
            "Flemish Giant",
            "English Angora",
            "Other"
        ],

        Hamster: [
            "Syrian Hamster",
            "Dwarf Hamster",
            "Roborovski Hamster",
            "Chinese Hamster",
            "Campbell's Dwarf",
            "Winter White Dwarf",
            "Other"
        ],

        "Guinea Pig": [
            "American",
            "Abyssinian",
            "Peruvian",
            "Silkie",
            "Teddy",
            "Texel",
            "Other"
        ],

        Turtle: [
            "Red-Eared Slider",
            "Painted Turtle",
            "Box Turtle",
            "Snapping Turtle",
            "Musk Turtle",
            "Spotted Turtle",
            "Other"
        ],

        Fish: [
            "Goldfish",
            "Betta",
            "Guppy",
            "Molly",
            "Angelfish",
            "Tetra",
            "Gourami",
            "Other"
        ]

    };


    /* =================================================
       RESET
    ================================================= */

    breedSelect.innerHTML = `
        <option value="">
            Choose breed
        </option>
    `;


    if (!species) {
        breedSelect.innerHTML = `
            <option value="">
                Choose species first
            </option>
        `;

        return;
    }


    /* =================================================
       FIND BREEDS
    ================================================= */

    const matchedBreeds =
        breeds[species];


    /* =================================================
       IF SPECIES IS KNOWN
    ================================================= */

    if (matchedBreeds) {

        matchedBreeds.forEach(
            (breed) => {

                const option =
                    document.createElement("option");

                option.value = breed;

                option.textContent = breed;

                if (breed === selectedBreed) {
                    option.selected = true;
                }

                breedSelect.appendChild(option);

            }
        );

        return;
    }


    /* =================================================
       UNKNOWN CUSTOM SPECIES
       Example: Chinchilla, Gecko, Iguana...
    ================================================= */

    breedSelect.innerHTML = `
        <option value="">
            Enter or choose breed
        </option>

        <option value="Other">
            Other
        </option>
    `;


    if (selectedBreed === "Other") {

        breedSelect.value = "Other";

    }

}

    /* =====================================================
       8. VIEW PET DETAILS
       ===================================================== */

/* =====================================================
   VIEW PET DETAILS
===================================================== */

function viewPetDetails(id) {

    const pet = pets.find(
        (item) => item.id === id
    );

    if (!pet) {
        return;
    }

    /* Remove any existing details modal */

    const existingModal =
        document.querySelector(".pet-details-overlay");

    if (existingModal) {
        existingModal.remove();
    }


    /* =================================================
       CREATE MODAL
    ================================================= */

    const modal =
        document.createElement("div");

    modal.className =
        "pet-details-overlay";


    modal.innerHTML = `

        <div class="pet-details-modal">

            <!-- HEADER -->

            <div class="pet-details-header">

                <div class="pet-details-title">

                    <div class="pet-details-icon">

                        <i class="fa-solid fa-paw"></i>

                    </div>

                    <div>

                        <h2>Pet Details</h2>

                        <p>
                            Complete information about your pet
                        </p>

                    </div>

                </div>


                <button
                    type="button"
                    class="pet-details-close"
                    aria-label="Close"
                >

                    <i class="fa-solid fa-xmark"></i>

                </button>

            </div>


            <!-- PET PROFILE -->

            <div class="pet-details-profile">

                <div class="pet-details-image">

                    <img
                        src="${escapeHTML(pet.image)}"
                        alt="${escapeHTML(pet.name)}"
                    >

                </div>


                <div class="pet-details-name">

                    <h3>

                        ${escapeHTML(pet.name)}

                        <span
                            class="gender ${
                                pet.gender === "Female"
                                    ? "female"
                                    : "male"
                            }"
                        >

                            <i
                                class="fa-solid ${
                                    getGenderIcon(pet.gender)
                                }"
                            ></i>

                        </span>

                    </h3>


                    <p>
                        ${escapeHTML(pet.breed)}
                    </p>


                    <span class="pet-details-health">

                        <i class="fa-regular fa-heart"></i>

                        ${escapeHTML(pet.health)}

                    </span>

                </div>

            </div>


            <!-- DETAILS GRID -->

            <div class="pet-details-grid">

                <div class="detail-box">

                    <div class="detail-label">

                        <i class="fa-regular fa-calendar"></i>

                        Age

                    </div>

                    <strong>
                        ${escapeHTML(pet.age)}
                    </strong>

                </div>


                <div class="detail-box">

                    <div class="detail-label">

                        <i class="fa-solid fa-scale-balanced"></i>

                        Weight

                    </div>

                    <strong>
                        ${escapeHTML(pet.weight)}
                    </strong>

                </div>


                <div class="detail-box">

                    <div class="detail-label">

                        <i class="fa-solid fa-syringe"></i>

                        Vaccinated

                    </div>

                    <strong
                        class="${
                            pet.vaccinated === "Yes"
                                ? "detail-success"
                                : "detail-warning"
                        }"
                    >

                        ${escapeHTML(pet.vaccinated)}

                    </strong>

                </div>


                <div class="detail-box">

                    <div class="detail-label">

                        <i class="fa-solid fa-paw"></i>

                        Species

                    </div>

                    <strong>
                        ${escapeHTML(pet.species)}
                    </strong>

                </div>

            </div>


            <!-- APPOINTMENT -->

            <div class="detail-section">

                <h4>

                    <i class="fa-regular fa-calendar-check"></i>

                    Upcoming Appointment

                </h4>


                <p>

                    ${
                        pet.appointment
                            ? "You have an upcoming appointment scheduled."
                            : "No upcoming appointment."
                    }

                </p>

            </div>


            <!-- NOTES -->

            <div class="detail-section">

                <h4>

                    <i class="fa-regular fa-note-sticky"></i>

                    About ${escapeHTML(pet.name)}

                </h4>


                <p>

                    ${escapeHTML(
                        pet.notes ||
                        "No notes added yet."
                    )}

                </p>

            </div>


            <!-- DIGITAL PET ID / QR -->

            ${
                pet.qrCode
                    ? `
                <div class="detail-section petid-qr-section">

                    <h4>

                        <i class="fa-solid fa-qrcode"></i>

                        Digital Pet ID

                    </h4>

                    <div
                        class="petid-qr-box"
                        style="
                            display:flex;
                            gap:1rem;
                            align-items:center;
                        "
                    >

                        <img
                            src="${escapeHTML(pet.qrCode)}"
                            alt="Pet ID QR Code"
                            class="petid-qr-img"
                            style="
                                width:110px;
                                height:110px;
                                border:1px solid #eee;
                                border-radius:12px;
                                flex-shrink:0;
                            "
                        />

                        <div style="font-size:0.85rem;color:#64748b;line-height:1.5;">

                            <p style="margin-bottom:0.35rem;">
                                Scan this code to view
                                <strong>${escapeHTML(pet.name)}'s</strong>
                                digital ID.
                            </p>

                            <a
                                href="pet-id.html"
                                style="color:#ff5c8a;font-weight:600;"
                            >
                                Open digital ID →
                            </a>

                        </div>

                    </div>

                </div>
                    `
                    : ""
            }


            <!-- FOOTER -->

            <div class="pet-details-footer">

                <button
                    type="button"
                    class="pet-details-close-btn"
                >

                    Close

                </button>

            </div>

        </div>

    `;


    /* =================================================
       ADD TO PAGE
    ================================================= */

    document.body.appendChild(modal);


    /* =================================================
       SHOW MODAL
    ================================================= */

    requestAnimationFrame(() => {

        modal.classList.add("show");

    });


    /* =================================================
       CLOSE BUTTON
    ================================================= */

    const closeModal = () => {

        modal.classList.remove("show");

        setTimeout(() => {

            modal.remove();

        }, 250);

    };


    modal
        .querySelector(".pet-details-close")
        .addEventListener(
            "click",
            closeModal
        );


    modal
        .querySelector(".pet-details-close-btn")
        .addEventListener(
            "click",
            closeModal
        );


    /* =================================================
       CLICK OUTSIDE
    ================================================= */

    modal.addEventListener(
        "click",
        (event) => {

            if (
                event.target === modal
            ) {

                closeModal();

            }

        }
    );


    /* =================================================
       ESC KEY
    ================================================= */

    const escapeHandler =
        (event) => {

            if (
                event.key === "Escape"
            ) {

                closeModal();

                document.removeEventListener(
                    "keydown",
                    escapeHandler
                );

            }

        };


    document.addEventListener(
        "keydown",
        escapeHandler
    );

}

    /* =====================================================
       9. EDIT PET
       ===================================================== */
/* =====================================================
   9. EDIT PET
===================================================== */

function editPet(id) {

    const pet = pets.find(
        (item) => item.id === id
    );

    if (!pet) {
        return;
    }

    // Open the same proper modal used for adding a pet
    openPetModal(pet);

}


    /* =====================================================
       10. THREE DOT MENU
       ===================================================== */

    /* =====================================================
   THREE DOT PET MENU
===================================================== */

function showPetMenu(id) {

    // Remove any existing menu
    document.querySelectorAll(".pet-action-menu").forEach(menu => {
        menu.remove();
    });

    const card = document.querySelector(
        `.pet-card[data-pet-id="${id}"]`
    );

    if (!card) return;

    const moreButton = card.querySelector(".more-btn");

    if (!moreButton) return;

    const menu = document.createElement("div");

    menu.className = "pet-action-menu";

    menu.innerHTML = `
        <button type="button" data-action="view">
            <i class="fa-regular fa-eye"></i>
            <span>View Details</span>
        </button>

        <button type="button" data-action="edit">
            <i class="fa-solid fa-pen"></i>
            <span>Edit Pet</span>
        </button>

        <div class="menu-divider"></div>

        <button
            type="button"
            class="delete-action"
            data-action="delete"
        >
            <i class="fa-regular fa-trash-can"></i>
            <span>Delete Pet</span>
        </button>
    `;

    document.body.appendChild(menu);


    /* ---------------------------------------------
       Position menu
    --------------------------------------------- */

    const buttonRect =
        moreButton.getBoundingClientRect();

    menu.style.position = "fixed";

    menu.style.top =
        `${buttonRect.bottom + 8}px`;

    menu.style.left =
        `${buttonRect.right - 160}px`;


    /* ---------------------------------------------
       Menu actions
    --------------------------------------------- */

    menu.querySelectorAll("button").forEach(button => {

        button.addEventListener("click", () => {

            const action =
                button.dataset.action;

            menu.remove();


            if (action === "view") {

                viewPetDetails(id);

            }

            else if (action === "edit") {

                editPet(id);

            }

            else if (action === "delete") {

                deletePet(id);

            }

        });

    });


    /* ---------------------------------------------
       Close when clicking outside
    --------------------------------------------- */

    setTimeout(() => {

        document.addEventListener(
            "click",
            function closeMenu(event) {

                if (
                    !menu.contains(event.target) &&
                    !moreButton.contains(event.target)
                ) {

                    menu.remove();

                    document.removeEventListener(
                        "click",
                        closeMenu
                    );

                }

            }
        );

    }, 0);
}

    /* =====================================================
       11. DELETE PET
       ===================================================== */

   /* =====================================================
   DELETE PET
===================================================== */

function deletePet(id) {

    const pet = pets.find(
        item => item.id === id
    );

    if (!pet) return;


    /* ---------------------------------------------
       Create confirmation modal
    --------------------------------------------- */

    const overlay =
        document.createElement("div");

    overlay.className =
        "pet-delete-overlay";


    overlay.innerHTML = `

        <div class="pet-delete-modal">

            <div class="delete-icon">

                <i class="fa-regular fa-trash-can"></i>

            </div>


            <h3>
                Delete ${escapeHTML(pet.name)}?
            </h3>


            <p>
                Are you sure you want to remove
                <strong>${escapeHTML(pet.name)}</strong>
                from your pets?
                This action cannot be undone.
            </p>


            <div class="delete-modal-actions">

                <button
                    type="button"
                    class="delete-cancel-btn"
                    id="deleteCancelBtn"
                >
                    Cancel
                </button>


                <button
                    type="button"
                    class="delete-confirm-btn"
                    id="deleteConfirmBtn"
                >
                    <i class="fa-regular fa-trash-can"></i>
                    Delete Pet
                </button>

            </div>

        </div>

    `;


    document.body.appendChild(overlay);


    /* ---------------------------------------------
       Show
    --------------------------------------------- */

    requestAnimationFrame(() => {

        overlay.classList.add("show");

    });


    /* ---------------------------------------------
       Cancel
    --------------------------------------------- */

    const closeDeleteModal = () => {

        overlay.classList.remove("show");

        setTimeout(() => {

            overlay.remove();

        }, 220);

    };


    document
        .getElementById("deleteCancelBtn")
        .addEventListener(
            "click",
            closeDeleteModal
        );


    /* ---------------------------------------------
       Confirm Delete
    --------------------------------------------- */

    document
        .getElementById("deleteConfirmBtn")
        .addEventListener(
            "click",
            () => {

                deletePetOnBackend(id)
                    .then(() => {

                        pets = pets.filter(
                            item => item.id !== id
                        );

                        renderPets();

                        closeDeleteModal();

                    })
                    .catch((err) => {

                        console.error(err);

                        closeDeleteModal();

                        alert(
                            "Could not delete pet: " +
                            (err.message || "Unknown error")
                        );

                    });

            }
        );


    /* ---------------------------------------------
       Click outside
    --------------------------------------------- */

    overlay.addEventListener(
        "click",
        event => {

            if (event.target === overlay) {

                closeDeleteModal();

            }

        }
    );

}

    /* =====================================================
       12. SEARCH
       ===================================================== */

    function performSearch(value) {

        currentSearch =
            value.trim();

        renderPets();
    }


    if (petSearchInput) {

        petSearchInput.addEventListener(
            "input",
            (event) => {

                currentSearch =
                    event.target.value;

                if (globalSearchInput) {

                    globalSearchInput.value =
                        event.target.value;
                }

                renderPets();
            }
        );
    }


    if (globalSearchInput) {

        globalSearchInput.addEventListener(
            "input",
            (event) => {

                currentSearch =
                    event.target.value;

                if (petSearchInput) {

                    petSearchInput.value =
                        event.target.value;
                }

                renderPets();
            }
        );
    }


    /* =====================================================
       13. CATEGORY FILTERS
       ===================================================== */

    filterTabs.forEach((tab) => {

        tab.addEventListener(
            "click",
            () => {

                filterTabs.forEach((item) => {

                    item.classList.remove(
                        "active"
                    );

                });


                tab.classList.add(
                    "active"
                );


                const text =
                    tab.textContent.trim();


                if (text.includes("Dogs")) {

                    currentFilter = "Dog";

                }

                else if (text.includes("Cats")) {

                    currentFilter = "Cat";

                }

                else if (text.includes("Birds")) {

                    currentFilter = "Bird";

                }

                else if (text.includes("Others")) {

                    currentFilter = "Other";

                }

                else {

                    currentFilter = "All";

                }


                renderPets();

            }
        );

    });


    /* =====================================================
       14. STATISTICS
       ===================================================== */

    function updateStatistics() {

        const statCards =
            document.querySelectorAll(
                ".stat-card"
            );


        if (statCards.length < 4) {
            return;
        }


        /* ---------------------------------------------
           Total Pets
        --------------------------------------------- */

        const totalPets =
            pets.length;


        statCards[0].querySelector(
            ".stat-value"
        ).textContent =
            totalPets;


        /* ---------------------------------------------
           Healthy Pets
        --------------------------------------------- */

        const healthyPets =
            pets.filter((pet) => {

                return (
                    pet.health.toLowerCase() ===
                        "good" ||

                    pet.health.toLowerCase() ===
                        "healthy" ||

                    pet.health.toLowerCase() ===
                        "excellent"
                );

            }).length;


        statCards[1].querySelector(
            ".stat-value"
        ).textContent =
            healthyPets;


        /* ---------------------------------------------
           Vaccinated
        --------------------------------------------- */

        const vaccinatedPets =
            pets.filter((pet) => {

                return pet.vaccinated === "Yes";

            }).length;


        statCards[2].querySelector(
            ".stat-value"
        ).textContent =
            vaccinatedPets;


        /* ---------------------------------------------
           Upcoming Appointments
        --------------------------------------------- */

        const appointments =
            pets.filter((pet) => {

                return pet.appointment === true;

            }).length;


        statCards[3].querySelector(
            ".stat-value"
        ).textContent =
            appointments;
    }


    /* =====================================================
       15. ADD PET BUTTONS
       ===================================================== */

    if (addPetTopButton) {

        addPetTopButton.addEventListener(
            "click",
            (event) => {

                event.preventDefault();

                addNewPet();

            }
        );
    }


    if (addPetBottomCard) {

        addPetBottomCard.addEventListener(
            "click",
            () => {

                addNewPet();

            }
        );
    }

    /* =====================================================
       17. NOTIFICATION BUTTON
       ===================================================== */

    if (notificationButton) {

        notificationButton.addEventListener(
            "click",
            () => {

                let notificationPanel =
                    document.getElementById("petNotificationPanel");

                if (!notificationPanel) {
                    notificationPanel = document.createElement("div");
                    notificationPanel.id = "petNotificationPanel";
                    notificationPanel.className = "pet-notification-panel";

                    notificationPanel.innerHTML = `
                        <div class="pet-notification-header">
                            <strong>Notifications</strong>
                            <button type="button" class="pet-notification-close" aria-label="Close notifications">&times;</button>
                        </div>
                        <div class="pet-notification-item">
                            <span class="notification-dot"></span>
                            <span>Bruno has an upcoming appointment.</span>
                        </div>
                        <div class="pet-notification-item">
                            <span class="notification-dot"></span>
                            <span>Remember to check your pets' health records.</span>
                        </div>
                        <div class="pet-notification-item">
                            <span class="notification-dot"></span>
                            <span>Keep your pets hydrated today!</span>
                        </div>
                    `;

                    document.body.appendChild(notificationPanel);

                    notificationPanel
                        .querySelector(".pet-notification-close")
                        .addEventListener("click", () => {
                            notificationPanel.remove();
                        });
                }

                notificationPanel.classList.toggle("show");
            }
        );
    }


    /* =====================================================
       18. INITIAL LOAD
       ===================================================== */

    fetchMyPets();

});