/**
 * =========================================================
 * FAMIPET - ADOPTION PAGE
 * =========================================================
 *
 * Keeps the existing design.
 * Adds:
 *
 * 1. Add New Pet
 * 2. View Details
 * 3. Proceed with Adoption
 * 4. Pet Owner Information
 * 5. Adoption Application Form
 * 6. LocalStorage for added pets and adoption records
 *
 * =========================================================
 */


/* =========================================================
   PET DATA
   ========================================================= */

const defaultPetsData = [
  {
    id: 1,
    name: "Bruno",
    gender: "male",
    type: "dog",
    typeLabel: "Dog",
    breed: "Labrador Retriever",
    age: "2 Years",
    location: "Mumbai, Maharashtra",
    image: "../assets/images/adoption/pet1.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Rahul Sharma",
    ownerPhone: "+91 98765 43210",
    ownerEmail: "rahul@example.com"
  },

  {
    id: 2,
    name: "Luna",
    gender: "female",
    type: "cat",
    typeLabel: "Cat",
    breed: "Persian",
    age: "1 Year",
    location: "Thane, Maharashtra",
    image: "../assets/images/adoption/pet2.jpg",
    vaccinated: true,
    healthy: true,
    liked: true,

    ownerName: "Priya Mehta",
    ownerPhone: "+91 98765 12345",
    ownerEmail: "priya@example.com"
  },

  {
    id: 3,
    name: "Coco",
    gender: "male",
    type: "dog",
    typeLabel: "Dog",
    breed: "Corgi",
    age: "1.5 Years",
    location: "Pune, Maharashtra",
    image: "../assets/images/adoption/pet3.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Amit Patil",
    ownerPhone: "+91 99887 77665",
    ownerEmail: "amit@example.com"
  },

  {
    id: 4,
    name: "Milo",
    gender: "male",
    type: "cat",
    typeLabel: "Cat",
    breed: "Indian Shorthair",
    age: "8 Months",
    location: "Navi Mumbai, Maharashtra",
    image: "../assets/images/adoption/pet4.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Sneha Joshi",
    ownerPhone: "+91 98765 44556",
    ownerEmail: "sneha@example.com"
  },

  {
    id: 5,
    name: "Snowy",
    gender: "female",
    type: "dog",
    typeLabel: "Dog",
    breed: "Bichon Frise",
    age: "5 Months",
    location: "Mumbai, Maharashtra",
    image: "../assets/images/adoption/pet5.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Neha Shah",
    ownerPhone: "+91 98765 33445",
    ownerEmail: "neha@example.com"
  },

  {
    id: 6,
    name: "Shadow",
    gender: "male",
    type: "cat",
    typeLabel: "Cat",
    breed: "Bombay Cat",
    age: "2 Years",
    location: "Kalyan, Maharashtra",
    image: "../assets/images/adoption/pet6.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Rohan Desai",
    ownerPhone: "+91 99887 22110",
    ownerEmail: "rohan@example.com"
  },

  {
    id: 7,
    name: "Max",
    gender: "male",
    type: "dog",
    typeLabel: "Dog",
    breed: "Golden Pup",
    age: "1 Year",
    location: "Mumbai, Maharashtra",
    image: "../assets/images/adoption/pet7.jpg",
    vaccinated: true,
    healthy: true,
    liked: true,

    ownerName: "Karan Mehta",
    ownerPhone: "+91 98765 77889",
    ownerEmail: "karan@example.com"
  },

  {
    id: 8,
    name: "Bunbun",
    gender: "female",
    type: "others",
    typeLabel: "Others",
    breed: "Holland Lop",
    age: "6 Months",
    location: "Pune, Maharashtra",
    image: "../assets/images/adoption/pet8.jpg",
    vaccinated: true,
    healthy: true,
    liked: false,

    ownerName: "Pooja Kulkarni",
    ownerPhone: "+91 99887 66554",
    ownerEmail: "pooja@example.com"
  }
];


/* =========================================================
   LOAD PETS
   ========================================================= */

let petsData = [];


/* =========================================================
   STATE
   ========================================================= */

let selectedCategory = "all";
let searchQuery = "";
let sortBy = "newest";


/* =========================================================
   ELEMENTS
   ========================================================= */

const petsGrid =
  document.getElementById("petsGrid");

const emptyState =
  document.getElementById("emptyState");

const searchInput =
  document.getElementById("searchInput");

const categoryCards =
  document.querySelectorAll(".cat-card");

const sortSelect =
  document.getElementById("sortSelect");


/* =========================================================
   DETAIL MODAL
   ========================================================= */

const detailModal =
  document.getElementById("detailModal");

const modalCloseBtn =
  document.getElementById("modalCloseBtn");

const modalBody =
  document.getElementById("modalBody");


/* =========================================================
   ADD NEW PET BUTTON
   ========================================================= */

const addPetBtn =
  document.getElementById("addPetBtn");


/* =========================================================
   BACKEND DATA LAYER
   ========================================================= */

function capFirst(s) {

  return String(s || "")

    .trim()

    .replace(
      /^\w/,
      (c) => c.toUpperCase()
    );

}


function adoptionType(s) {

  const t =
    String(s || "")
      .toLowerCase();

  if (
    t === "dog" ||
    t === "cat"
  ) {
    return t;
  }

  return "others";

}


function toFrontendPet(p, favs) {

  const favSet =
    new Set(
      (favs || []).map(f =>
        (f && (f._id || f))
      )
    );

  const label =
    adoptionType(p.species) === "dog"
      ? "Dog"
      : adoptionType(p.species) === "cat"
        ? "Cat"
        : "Others";

  return {

    id: p._id,

    name: p.name,

    gender: p.gender,

    type: adoptionType(p.species),

    typeLabel: label,

    breed:
      (p.breed && p.breed.name) ||
      p.breed ||
      "",

    age:
      `${p.age} ${
        p.age === 1
          ? "Year"
          : "Years"
      }`,

    location: "",

    image:
      (p.images && p.images.length)
        ? p.images[0]
        : "../assets/images/adoption/pet1.jpg",

    vaccinated:
      !!p.vaccinated,

    healthy: true,

    liked:
      favSet.has(p._id),

    _createdTs:
      new Date(p.createdAt).getTime() || 0,

    ownerName:
      (p.owner && p.owner.name) ||
      "Pet Owner",

    ownerPhone:
      (p.owner && p.owner.phone) ||
      "",

    ownerEmail:
      (p.owner && p.owner.email) ||
      ""
  };

}


async function fetchAdoptablePets() {

  try {

    const petRes =
      await FamiPetAPI.get(
        "/pets?status=available"
      );

    let favs = [];

    try {

      const me =
        await FamiPetAPI.get(
          "/auth/me"
        );

      favs =
        me.user &&
        Array.isArray(me.user.favorites)
          ? me.user.favorites
          : [];

    } catch (e) { /* keep empty */ }


    petsData =
      (petRes.pets || []).map(p =>
        toFrontendPet(p, favs)
      );

    renderPetCards();

  } catch (err) {

    console.error(
      "Could not load adoption pets:",
      err
    );

  }

}


async function toggleFavoriteOnBackend(id) {

  const res =
    await FamiPetAPI.post(
      "/users/favorites/" + id
    );

  return !!res.isFavorite;

}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHTML(value) {

  const div =
    document.createElement("div");

  div.textContent =
    value ?? "";

  return div.innerHTML;

}


/* =========================================================
   RENDER PET CARDS
   ========================================================= */

function renderPetCards() {

  let filtered =
    petsData.filter((pet) => {

      const matchesCat =
        selectedCategory === "all" ||
        pet.type === selectedCategory;

      const searchableText = `
        ${pet.name}
        ${pet.breed}
        ${pet.location}
      `.toLowerCase();

      const matchesSearch =
        searchableText.includes(searchQuery);

      return matchesCat && matchesSearch;

    });


  /* SORT */

  if (sortBy === "name") {

    filtered.sort(
      (a, b) =>
        a.name.localeCompare(b.name)
    );

  } else if (sortBy === "oldest") {

    filtered.sort(
      (a, b) =>
        (a._createdTs || 0) -
        (b._createdTs || 0)
    );

  } else {

    filtered.sort(
      (a, b) =>
        (b._createdTs || 0) -
        (a._createdTs || 0)
    );

  }


  petsGrid.innerHTML = "";


  if (filtered.length === 0) {

    emptyState.classList.remove("hidden");

    return;

  }


  emptyState.classList.add("hidden");


  filtered.forEach((pet) => {
const card =
    document.createElement("div");

card.className =
    "pet-card";

card.dataset.petId =
    pet.id;


    const genderSymbol =
      pet.gender === "male"
        ? "mars"
        : "venus";


    const heartClass =
      pet.liked
        ? "fa-solid"
        : "fa-regular";


    card.innerHTML = `

      <div class="card-media">

        <img
          src="${escapeHTML(pet.image)}"
          alt="${escapeHTML(pet.name)}"
          loading="lazy"
          onerror="
            this.src='../assets/images/adoption/pet1.jpg'
          "
        />

        <span class="type-badge ${escapeHTML(pet.type)}">
          ${escapeHTML(pet.typeLabel)}
        </span>


        <button
          class="fav-btn ${pet.liked ? "liked" : ""}"
          onclick="toggleLike('${pet.id}')"
          aria-label="Favorite"
          type="button"
        >

          <i class="${heartClass} fa-heart"></i>

        </button>

      </div>


      <div class="card-content">

        <div class="pet-title-row">

          <h3>
            ${escapeHTML(pet.name)}
          </h3>

          <i
            class="fa-solid fa-${genderSymbol} gender-icon ${escapeHTML(pet.gender)}"
          ></i>

        </div>


        <p class="pet-subinfo">

          ${escapeHTML(pet.breed)}
          •
          ${escapeHTML(pet.age)}

        </p>


        <div class="pet-location">

          <i class="fa-solid fa-location-dot"></i>

          <span>
            ${escapeHTML(pet.location)}
          </span>

        </div>


        <div class="card-pill-tags">

          ${
            pet.vaccinated
              ? `
                <span class="badge-tag badge-vaccinated">
                  <i class="fa-solid fa-circle-check"></i>
                  Vaccinated
                </span>
              `
              : ""
          }


          ${
            pet.healthy
              ? `
                <span class="badge-tag badge-healthy">
                  <i class="fa-regular fa-heart"></i>
                  Healthy
                </span>
              `
              : ""
          }

        </div>


<button
    class="view-details-btn"
    onclick="openDetails('${pet.id}')"
    type="button"
>
    <i class="fa-regular fa-eye"></i>
    View Details
</button>

<button
    class="delete-pet-btn"
    onclick="deletePet('${pet.id}')"
    type="button"
>
    <i class="fa-regular fa-trash-can"></i>
    Delete Pet
</button>

      </div>

    `;


    petsGrid.appendChild(card);

  });

}



/* =========================================================
   FAVORITE
   ========================================================= */

window.toggleLike = async function(id) {

  const target =
    petsData.find(
      pet => pet.id === id
    );


  if (!target) return;


  try {

    const isFav =
      await toggleFavoriteOnBackend(id);

    target.liked =
      isFav;

    renderPetCards();

  } catch (err) {

    console.error(err);

    showToast(
      "Could not update favorite: " +
      (err.message || "Unknown error")
    );

  }

};

/* =========================================================
   DELETE PET - INLINE CONFIRMATION
   ========================================================= */

window.deletePet = function(id) {

    const pet = petsData.find(
        item => item.id === id
    );

    if (!pet) return;

    const card = document.querySelector(
        `.pet-card[data-pet-id="${id}"]`
    );

    if (!card) return;

    /* Prevent showing confirmation twice */
    if (card.querySelector(".delete-confirm-box")) {
        return;
    }

    const confirmBox =
        document.createElement("div");

    confirmBox.className =
        "delete-confirm-box";

    confirmBox.innerHTML = `

        <div class="delete-confirm-text">

            <i class="fa-solid fa-triangle-exclamation"></i>

            <span>
                Remove ${escapeHTML(pet.name)}
                from adoption?
            </span>

        </div>

        <div class="delete-confirm-actions">

            <button
                type="button"
                class="delete-cancel-btn"
            >
                Cancel
            </button>

            <button
                type="button"
                class="delete-confirm-btn"
            >
                <i class="fa-regular fa-trash-can"></i>
                Delete
            </button>

        </div>

    `;

    card.appendChild(confirmBox);


    /* CANCEL */

    confirmBox
        .querySelector(".delete-cancel-btn")
        .addEventListener(
            "click",
            () => {
                confirmBox.remove();
            }
        );


    /* DELETE */

    confirmBox
        .querySelector(".delete-confirm-btn")
        .addEventListener(
            "click",
            async () => {

                try {

                    await FamiPetAPI.del(
                        "/pets/" + id
                    );

                    petsData =
                        petsData.filter(
                            item => item.id !== id
                        );

                    renderPetCards();

                    showToast(
                        `${pet.name} has been removed from adoption.`
                    );

                } catch (err) {

                    console.error(err);

                    showToast(
                        "Could not delete pet: " +
                        (err.message || "Unknown error")
                    );

                }

            }
        );

};


/* =========================================================
   OPEN PET DETAILS
   ========================================================= */

window.openDetails = function(id) {

  const target =
    petsData.find(
      pet => pet.id === id
    );


  if (!target) return;


  modalBody.innerHTML = `

    <div style="text-align:center;">

      <img
        src="${escapeHTML(target.image)}"
        alt="${escapeHTML(target.name)}"
        style="
          width:120px;
          height:120px;
          border-radius:50%;
          object-fit:cover;
          margin-bottom:1rem;
        "
      />


      <h2
        style="
          font-size:1.5rem;
          font-weight:800;
          margin-bottom:0.25rem;
        "
      >
        ${escapeHTML(target.name)}
      </h2>


      <p
        style="
          color:#64748b;
          font-size:0.9rem;
          margin-bottom:1.5rem;
        "
      >
        ${escapeHTML(target.breed)}
        •
        ${escapeHTML(target.age)}
        •
        ${escapeHTML(target.location)}
      </p>


      <p
        style="
          font-size:0.9rem;
          line-height:1.6;
          color:#334155;
          margin-bottom:1.5rem;
        "
      >
        ${escapeHTML(target.name)}
        is a healthy, fully-vaccinated pet waiting
        for a loving companion.
        Give them the home they deserve today!
      </p>


      <button
        id="proceedAdoptionBtn"
        type="button"
        style="
          width:100%;
          padding:0.75rem;
          border-radius:50px;
          background:#f43f5e;
          color:#fff;
          font-weight:700;
          box-shadow:0 4px 14px rgba(244,63,94,0.3);
          cursor:pointer;
        "
      >

        Proceed with Adoption

      </button>

    </div>

  `;


  detailModal.classList.add("open");


  /* IMPORTANT:
     Proceed now opens adoption form
  */

  document
    .getElementById("proceedAdoptionBtn")
    .addEventListener(
      "click",
      () => {

        openAdoptionForm(target);

      }
    );

};


/* =========================================================
   CLOSE DETAIL MODAL
   ========================================================= */

function closeDetailModal() {

  detailModal.classList.remove("open");

}


window.closeDetailModal =
  closeDetailModal;


modalCloseBtn.addEventListener(
  "click",
  closeDetailModal
);


detailModal.addEventListener(
  "click",
  (event) => {

    if (
      event.target === detailModal
    ) {

      closeDetailModal();

    }

  }
);


/* =========================================================
   ADD NEW PET
   ========================================================= */

addPetBtn.addEventListener(
  "click",
  openAddPetForm
);


/* =========================================================
   CREATE MODAL
   ========================================================= */
/* =========================================================
   CREATE MODAL
   ========================================================= */

function createModal() {

    const overlay =
        document.createElement("div");

    overlay.className =
        "modal-backdrop open";

    overlay.style.zIndex =
        "1100";


    const sheet =
        document.createElement("div");

    sheet.className =
        "modal-sheet";


    /* Add the close button directly into the HTML
       so it does not get destroyed by innerHTML */

    sheet.innerHTML = `

        <button
            class="modal-close dynamic-modal-close"
            type="button"
            aria-label="Close"
        >
            <i class="fa-solid fa-xmark"></i>
        </button>

    `;


    overlay.appendChild(sheet);

    document.body.appendChild(overlay);


    /* =====================================================
       CLOSE MODAL
       ===================================================== */

    function close() {

        overlay.classList.remove("open");

        setTimeout(() => {

            overlay.remove();

        }, 150);

    }


    /* =====================================================
       CLOSE BUTTON
       ===================================================== */

    const closeButton =
        sheet.querySelector(
            ".dynamic-modal-close"
        );


    closeButton.addEventListener(
        "click",
        close
    );


    /* =====================================================
       CLICK OUTSIDE MODAL
       ===================================================== */

    overlay.addEventListener(
        "click",
        event => {

            if (
                event.target === overlay
            ) {

                close();

            }

        }
    );


    return {
        overlay,
        sheet,
        close
    };

}

/* =========================================================
   ADD PET FORM
   ========================================================= */

function openAddPetForm() {

  const modal =
    createModal();


  modal.sheet.innerHTML += `

    <div style="padding-top:0.5rem;">

      <div style="text-align:center;margin-bottom:1.5rem;">

        <div
          style="
            width:55px;
            height:55px;
            margin:0 auto 0.7rem;
            border-radius:50%;
            background:#fff1f2;
            color:#f43f5e;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:1.3rem;
          "
        >

          <i class="fa-solid fa-paw"></i>

        </div>


        <h2
          style="
            font-size:1.5rem;
            font-weight:800;
            color:#1e293b;
          "
        >
          Add New Pet
        </h2>


        <p
          style="
            color:#64748b;
            font-size:0.85rem;
            margin-top:0.35rem;
          "
        >
          Add a pet that is looking for a loving home.
        </p>

      </div>


      <form id="addAdoptionPetForm">

        <div class="adoption-form-grid">

          <label>
            <span>Pet Name *</span>

            <input
              name="name"
              required
              placeholder="e.g. Bruno"
            />

          </label>


          <label>
            <span>Pet Type *</span>

            <select
              name="type"
              required
            >

              <option value="">
                Select type
              </option>

              <option value="dog">
                Dog
              </option>

              <option value="cat">
                Cat
              </option>

              <option value="others">
                Others
              </option>

            </select>

          </label>


          <label>
            <span>Breed *</span>

            <input
              name="breed"
              required
              placeholder="e.g. Labrador Retriever"
            />

          </label>


          <label>
            <span>Age *</span>

            <input
              name="age"
              required
              placeholder="e.g. 2 Years"
            />

          </label>


          <label>
            <span>Gender *</span>

            <select
              name="gender"
              required
            >

              <option value="">
                Select gender
              </option>

              <option value="male">
                Male
              </option>

              <option value="female">
                Female
              </option>

            </select>

          </label>


          <label>
            <span>Location *</span>

            <input
              name="location"
              required
              placeholder="e.g. Mumbai, Maharashtra"
            />

          </label>


          <label>
            <span>Pet Image</span>

            <input
              name="image"
              type="file"
              accept="image/*"
              id="adoptionPetImage"
            />

          </label>

          <label class="adoption-image-preview-label">
            <span>Preview</span>

            <div
              class="adoption-image-preview"
              id="adoptionImagePreview"
            >
              <i class="fa-solid fa-paw"></i>
            </div>

          </label>


          <label>
            <span>Health Status</span>

            <select name="health">

              <option value="healthy">
                Healthy
              </option>

              <option value="needs-checkup">
                Needs Checkup
              </option>

            </select>

          </label>

        </div>


        <h3 class="adoption-form-heading">

          <i class="fa-solid fa-user"></i>

          Pet Owner Information

        </h3>


        <div class="adoption-form-grid">

          <label>
            <span>Owner Name *</span>

            <input
              name="ownerName"
              required
              placeholder="Full name"
            />

          </label>


          <label>
            <span>Owner Phone *</span>

            <input
              name="ownerPhone"
              type="tel"
              required
              placeholder="+91 98765 43210"
            />

          </label>


          <label>
            <span>Owner Email</span>

            <input
              name="ownerEmail"
              type="email"
              placeholder="owner@email.com"
            />

          </label>

        </div>


        <div class="adoption-form-actions">

          <button
            type="button"
            class="adoption-cancel-btn"
            id="cancelAddPet"
          >
            Cancel
          </button>


          <button
            type="submit"
            class="adoption-submit-btn"
          >

            <i class="fa-solid fa-plus"></i>

            Add Pet

          </button>

        </div>

      </form>

    </div>

  `;


  const form =
    modal.sheet.querySelector(
      "#addAdoptionPetForm"
    );


  form.addEventListener(
    "submit",
    async (event) => {

      event.preventDefault();


      const data =
        new FormData(form);


      const type =
        data.get("type");


      const imageInput =
        form.querySelector(
          "#adoptionPetImage"
        );

      let image =
        data.get("image") ||
        "";

      if (imageInput && imageInput.files && imageInput.files[0]) {

        const file =
          imageInput.files[0];

        image =
          await new Promise((resolve) => {

            const reader =
              new FileReader();

            reader.onload = (event) => {

              resolve(event.target.result);

            };

            reader.readAsDataURL(file);

          });

      }

      image =
        image.trim() ||
        "../assets/images/adoption/pet1.jpg";


      const locationText =
        data.get("location").trim();


      const healthText =
        data.get("health") === "healthy"
          ? "Healthy"
          : "Needs checkup";


      const payload = {

        name:
          data.get("name").trim(),

        species:
          type === "others"
            ? "other"
            : type,

        breed:
          data.get("breed").trim(),

        gender:
          data.get("gender"),

        age: (() => {

          const raw =
            String(data.get("age") || "").trim();

          const match =
            raw.match(/(\d+(?:\.\d+)?)/);

          return match
            ? parseFloat(match[1])
            : Number(raw) || 0;

        })(),

        vaccinated:
          true,

        images:
          [image],

        description:
          [
            locationText
              ? `Location: ${locationText}`
              : "",
            `Health: ${healthText}`
          ].filter(Boolean).join(" | ")
      };


      FamiPetAPI.post(
        "/pets",
        payload
      ).then((res) => {

        const saved =
          res.pet;

        petsData.unshift(
          toFrontendPet(
            saved,
            []
          )
        );

        renderPetCards();

        modal.close();

        showToast(
          "Pet added successfully for adoption."
        );

      }).catch((err) => {

        console.error(err);

        showToast(
          "Could not add pet: " +
          (err.message || "Unknown error")
        );

      });

    }
  );


  modal.sheet
    .querySelector("#cancelAddPet")
    .addEventListener(
      "click",
      modal.close
    );


  const imageInput =
    modal.sheet.querySelector(
      "#adoptionPetImage"
    );

  const imagePreview =
    modal.sheet.querySelector(
      "#adoptionImagePreview"
    );

  if (imageInput && imagePreview) {

    imageInput.addEventListener(
      "change",
      () => {

        const file =
          imageInput.files[0];

        if (!file) {
          return;
        }

        const reader =
          new FileReader();

        reader.onload = (event) => {

          imagePreview.innerHTML =
            `<img
                src="${event.target.result}"
                alt="Pet preview"
                style="
                  width:100%;
                  height:100%;
                  object-fit:cover;
                  border-radius:10px;
                "
              >`;

        };

        reader.readAsDataURL(file);

      }
    );

  }

}


/* =========================================================
   ADOPTION FORM
   ========================================================= */

function openAdoptionForm(pet) {

  /* Close the details modal first */

  closeDetailModal();


  const modal =
    createModal();


  modal.sheet.innerHTML += `

    <div style="padding-top:0.5rem;">

      <div style="text-align:center;margin-bottom:1.25rem;">

        <div
          style="
            width:55px;
            height:55px;
            margin:0 auto 0.7rem;
            border-radius:50%;
            background:#fff1f2;
            color:#f43f5e;
            display:flex;
            align-items:center;
            justify-content:center;
            font-size:1.3rem;
          "
        >

          <i class="fa-solid fa-heart"></i>

        </div>


        <h2
          style="
            font-size:1.5rem;
            font-weight:800;
            color:#1e293b;
          "
        >
          Adoption Application
        </h2>


        <p
          style="
            color:#64748b;
            font-size:0.85rem;
            margin-top:0.35rem;
          "
        >
          Fill in your details to start the adoption process.
        </p>

      </div>


      <!-- PET INFORMATION -->

      <div
        style="
          display:flex;
          align-items:center;
          gap:1rem;
          padding:0.9rem;
          background:#faf8fb;
          border-radius:16px;
          margin-bottom:1.25rem;
        "
      >

        <img
          src="${escapeHTML(pet.image)}"
          alt="${escapeHTML(pet.name)}"
          style="
            width:70px;
            height:70px;
            border-radius:14px;
            object-fit:cover;
          "
        />


        <div>

          <h3
            style="
              font-size:1.05rem;
              font-weight:800;
              color:#1e293b;
            "
          >
            ${escapeHTML(pet.name)}
          </h3>


          <p
            style="
              font-size:0.78rem;
              color:#64748b;
              margin-top:0.2rem;
            "
          >
            ${escapeHTML(pet.breed)}
            •
            ${escapeHTML(pet.age)}
          </p>


          <p
            style="
              font-size:0.75rem;
              color:#64748b;
              margin-top:0.2rem;
            "
          >

            <i class="fa-solid fa-location-dot"></i>

            ${escapeHTML(pet.location)}

          </p>

        </div>

      </div>


      <!-- OWNER INFORMATION -->

      <div
        style="
          background:#fff7f9;
          border:1px solid #ffe0e7;
          border-radius:16px;
          padding:1rem;
          margin-bottom:1.25rem;
        "
      >

        <h3
          style="
            font-size:0.95rem;
            font-weight:800;
            color:#1e293b;
            margin-bottom:0.7rem;
          "
        >

          <i
            class="fa-solid fa-user"
            style="color:#f43f5e;"
          ></i>

          Pet Owner Information

        </h3>


        <div
          style="
            display:grid;
            grid-template-columns:1fr 1fr;
            gap:0.55rem 1rem;
          "
        >

          <div>

            <small
              style="
                display:block;
                color:#94a3b8;
                font-size:0.68rem;
              "
            >
              Owner Name
            </small>

            <strong
              style="
                font-size:0.8rem;
                color:#334155;
              "
            >
              ${escapeHTML(pet.ownerName || "Not provided")}
            </strong>

          </div>


          <div>

            <small
              style="
                display:block;
                color:#94a3b8;
                font-size:0.68rem;
              "
            >
              Phone
            </small>

            <strong
              style="
                font-size:0.8rem;
                color:#334155;
              "
            >
              ${escapeHTML(pet.ownerPhone || "Not provided")}
            </strong>

          </div>


          <div>

            <small
              style="
                display:block;
                color:#94a3b8;
                font-size:0.68rem;
              "
            >
              Email
            </small>

            <strong
              style="
                font-size:0.8rem;
                color:#334155;
              "
            >
              ${escapeHTML(pet.ownerEmail || "Not provided")}
            </strong>

          </div>

        </div>

      </div>


      <!-- ADOPTER FORM -->

      <form id="adoptionApplicationForm">

        <h3 class="adoption-form-heading">

          <i class="fa-solid fa-file-signature"></i>

          Your Information

        </h3>


        <div class="adoption-form-grid">

          <label>
            <span>Full Name *</span>

            <input
              name="adopterName"
              required
              placeholder="Enter your full name"
            />

          </label>


          <label>
            <span>Phone Number *</span>

            <input
              name="adopterPhone"
              type="tel"
              required
              placeholder="+91 98765 43210"
            />

          </label>


          <label>
            <span>Email Address *</span>

            <input
              name="adopterEmail"
              type="email"
              required
              placeholder="you@example.com"
            />

          </label>


          <label>
            <span>City *</span>

            <input
              name="city"
              required
              placeholder="Mumbai"
            />

          </label>


          <label class="full-adoption-field">

            <span>Address *</span>

            <textarea
              name="address"
              required
              rows="3"
              placeholder="Enter your complete address"
            ></textarea>

          </label>


          <label>
            <span>Home Type *</span>

            <select
              name="homeType"
              required
            >

              <option value="">
                Select
              </option>

              <option>
                Apartment
              </option>

              <option>
                Independent House
              </option>

              <option>
                Villa
              </option>

              <option>
                Other
              </option>

            </select>

          </label>


          <label>
            <span>Pet Experience *</span>

            <select
              name="experience"
              required
            >

              <option value="">
                Select
              </option>

              <option>
                First-time pet owner
              </option>

              <option>
                Some experience
              </option>

              <option>
                Experienced pet owner
              </option>

            </select>

          </label>


          <label class="full-adoption-field">

            <span>
              Why do you want to adopt this pet? *
            </span>

            <textarea
              name="reason"
              required
              rows="3"
              placeholder="Tell us why you want to adopt..."
            ></textarea>

          </label>

        </div>


        <div class="adoption-form-actions">

          <button
            type="button"
            class="adoption-cancel-btn"
            id="cancelAdoption"
          >
            Cancel
          </button>


          <button
            type="submit"
            class="adoption-submit-btn"
          >

            <i class="fa-solid fa-check"></i>

            Submit Application

          </button>

        </div>

      </form>

    </div>

  `;


  const form =
    modal.sheet.querySelector(
      "#adoptionApplicationForm"
    );


  form.addEventListener(
    "submit",
    event => {

      event.preventDefault();


      const data =
        new FormData(form);


      const submitBtn =
        form.querySelector(
          "button[type='submit']"
        );

      if (submitBtn) {

        submitBtn.disabled = true;
      }


      const payload = {

        pet:
          String(pet.id),

        fullName:
          data.get("adopterName"),

        phone:
          data.get("adopterPhone"),

        address:
          data.get("address"),

        occupation:
          data.get("homeType"),

        experienceWithPets:
          data.get("experience"),

        reasonForAdoption:
          data.get("reason")
      };


      FamiPetAPI.post(
        "/adoptions",
        payload
      ).then((res) => {

        const adoption =
          res.adoption || {};

        const adoptionRecord = {

          id:
            adoption._id ||
            "FAMI-" + Date.now(),

          petName:
            pet.name,

          status:
            adoption.status || "Pending"
        };


        showAdoptionSuccess(
          modal,
          adoptionRecord
        );

      }).catch((err) => {

        console.error(err);

        if (submitBtn) {
          submitBtn.disabled = false;
        }

        showToast(
          err.message ||
          "Could not submit application. Please try again."
        );

      });

    }
  );


  modal.sheet
    .querySelector("#cancelAdoption")
    .addEventListener(
      "click",
      modal.close
    );

}


/* =========================================================
   ADOPTION SUCCESS
   ========================================================= */

function showAdoptionSuccess(
  modal,
  record
) {

  modal.sheet.innerHTML = `

    <button
      class="modal-close"
      id="successClose"
      type="button"
    >
      &times;
    </button>


    <div
      style="
        text-align:center;
        padding:2rem 0.5rem;
      "
    >

      <div
        style="
          width:65px;
          height:65px;
          margin:0 auto 1rem;
          border-radius:50%;
          background:#e1f7eb;
          color:#10b981;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:1.6rem;
        "
      >

        <i class="fa-solid fa-check"></i>

      </div>


      <h2
        style="
          font-size:1.4rem;
          font-weight:800;
          color:#1e293b;
        "
      >
        Application Submitted!
      </h2>


      <p
        style="
          margin-top:0.6rem;
          color:#64748b;
          font-size:0.85rem;
          line-height:1.6;
        "
      >
        Your adoption application for
        <strong>${escapeHTML(record.petName)}</strong>
        has been recorded successfully.
      </p>


      <div
        style="
          margin:1.25rem auto;
          padding:0.8rem 1rem;
          border-radius:12px;
          background:#f8f6fc;
          max-width:280px;
        "
      >

        <small
          style="
            display:block;
            color:#94a3b8;
            font-size:0.68rem;
          "
        >
          Adoption Record ID
        </small>


        <strong
          style="
            display:block;
            margin-top:0.25rem;
            color:#f43f5e;
            font-size:0.9rem;
          "
        >
          ${escapeHTML(record.id)}
        </strong>

      </div>


      <p
        style="
          color:#64748b;
          font-size:0.75rem;
        "
      >
        Status:
        <strong>Pending</strong>
      </p>


      <button
        id="successClose"
        type="button"
        style="
          margin-top:1.25rem;
          width:100%;
          padding:0.75rem;
          border-radius:50px;
          background:#f43f5e;
          color:white;
          font-weight:700;
          cursor:pointer;
        "
      >
        Done
      </button>

    </div>

  `;


  modal.sheet
    .querySelectorAll("#successClose")
    .forEach(button => {

      button.addEventListener(
        "click",
        modal.close
      );

    });

}


/* =========================================================
   TOAST
   ========================================================= */

function showToast(message) {

  const old =
    document.querySelector(
      ".adoption-toast"
    );


  if (old) {
    old.remove();
  }


  const toast =
    document.createElement("div");


  toast.className =
    "adoption-toast";


  toast.innerHTML = `

    <i class="fa-solid fa-circle-check"></i>

    <span>
      ${escapeHTML(message)}
    </span>

  `;


  Object.assign(
    toast.style,
    {
      position: "fixed",
      top: "25px",
      right: "25px",
      zIndex: "3000",
      background: "#ffffff",
      color: "#334155",
      padding: "0.85rem 1.1rem",
      borderRadius: "12px",
      boxShadow: "0 10px 30px rgba(15,23,42,0.15)",
      border: "1px solid #f1eff5",
      display: "flex",
      alignItems: "center",
      gap: "0.6rem",
      fontSize: "0.8rem"
    }
  );


  toast.querySelector("i").style.color =
    "#10b981";


  document.body.appendChild(
    toast
  );


  setTimeout(
    () => toast.remove(),
    3000
  );

}


/* =========================================================
   CATEGORY FILTER
   ========================================================= */

categoryCards.forEach(
  (card) => {

    card.addEventListener(
      "click",
      () => {

        categoryCards.forEach(
          c =>
            c.classList.remove(
              "active"
            )
        );


        card.classList.add(
          "active"
        );


        selectedCategory =
          card.dataset.category;


        renderPetCards();

      }
    );

  }
);


/* =========================================================
   SEARCH
   ========================================================= */

searchInput.addEventListener(
  "input",
  (event) => {

    searchQuery =
      event.target.value
        .trim()
        .toLowerCase();


    renderPetCards();

  }
);


/* =========================================================
   SORT
   ========================================================= */

sortSelect.addEventListener(
  "change",
  (event) => {

    sortBy =
      event.target.value;


    renderPetCards();

  }
);


/* =========================================================
   INITIAL RENDER
   ========================================================= */

fetchAdoptablePets();