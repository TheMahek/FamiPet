/* =========================================================
   FAMIPET - DIGITAL PET ID / QR
   ========================================================= */

document.addEventListener("DOMContentLoaded", () => {

    const section =
        document.getElementById("petIdSection");

    const petSelect =
        document.getElementById("petSelect");

    const petPreview =
        document.getElementById("petPreview");

    const previewName =
        document.getElementById("previewName");

    const previewBreed =
        document.getElementById("previewBreed");

    const previewImg =
        petPreview.querySelector("img");

    const generateBtn =
        document.getElementById("generateQrBtn");

    const downloadBtn =
        document.getElementById("downloadIdBtn");

    const idPlaceholder =
        document.getElementById("idPlaceholder");

    const idCard =
        document.getElementById("idCard");

    const idPhoto =
        document.getElementById("idPhoto");

    const idPetName =
        document.getElementById("idPetName");

    const idBreed =
        document.getElementById("idBreed");

    const idSpecies =
        document.getElementById("idSpecies");

    const idAge =
        document.getElementById("idAge");

    const idOwner =
        document.getElementById("idOwner");

    const idQr =
        document.getElementById("idQr");

    let pets = [];
    let currentPet = null;
    let ownerName = "";


    function escapeHTML(value) {

        const div =
            document.createElement("div");

        div.textContent =
            value ?? "";

        return div.innerHTML;
    }


    function capFirst(s) {

        return String(s || "")
            .trim()
            .replace(/^\w/, c => c.toUpperCase());
    }


    function petImage(pet) {

        if (
            pet.images &&
            pet.images.length &&
            pet.images[0]
        ) {

            return pet.images[0];
        }

        return pet.species === "cat"
            ? "../assets/images/my-pet/cat.png"
            : "../assets/images/my-pet/dog1.png";
    }


    function refreshPreview() {

        const pet =
            pets.find(p => p._id === petSelect.value);

        currentPet = pet || null;

        if (!currentPet) {

            petPreview.style.display = "none";
            generateBtn.disabled = true;
            return;
        }

        previewName.textContent =
            currentPet.name;

        previewBreed.textContent =
            (currentPet.breed && currentPet.breed.name)
                ? `${capFirst(currentPet.species)} • ${currentPet.breed.name}`
                : capFirst(currentPet.species);

        previewImg.src =
            petImage(currentPet);

        petPreview.style.display = "flex";
        generateBtn.disabled = false;
    }


    function showIdCard(pet, qrCode) {

        idPhoto.src =
            petImage(pet);

        idPetName.textContent =
            pet.name;

        idBreed.textContent =
            (pet.breed && pet.breed.name)
                ? pet.breed.name
                : "";

        idSpecies.textContent =
            capFirst(pet.species);

        idAge.textContent =
            `${pet.age} ${pet.age === 1 ? "year" : "years"}`;

        idOwner.textContent =
            ownerName || "Pet Parent";

        idQr.src =
            qrCode;

        idPlaceholder.style.display = "none";

        idCard.style.display = "block";

        downloadBtn.style.display = "flex";
    }


    async function loadPets() {

        try {

            const me =
                await FamiPetAPI.get("/auth/me");

            ownerName =
                (me.user && me.user.name) || "";

            const data =
                await FamiPetAPI.get("/pets/my");

            pets =
                data.pets || [];

        } catch (error) {

            console.error(
                "Could not load pets:",
                error
            );

            pets = [];
        }

        if (!pets.length) {

            section.querySelector(".dashboard-card");

            const container =
                document.getElementById("petIdSection");

            container.innerHTML = `
                <div class="petid-empty">
                    <i class="fa-solid fa-paw"></i>
                    <h3>No pets yet</h3>
                    <p style="margin-top:8px;">
                        Add a pet first to generate its Digital ID.
                        <a href="mypet.html" style="color:#ff5c8a;font-weight:600;">Add your first pet →</a>
                    </p>
                </div>
            `;

            return;
        }

        petSelect.innerHTML =
            '<option value="">Choose a pet...</option>' +
            pets.map(p =>
                `<option value="${escapeHTML(p._id)}">
                    ${escapeHTML(p.name)} (${escapeHTML(capFirst(p.species))})
                </option>`
            ).join("");

        petSelect.disabled = false;
    }


    function generateQr() {

        if (!currentPet) return;

        const oldText =
            generateBtn.innerHTML;

        generateBtn.disabled = true;

        generateBtn.innerHTML =
            '<i class="fa-solid fa-circle-notch fa-spin"></i> Generating...';

        FamiPetAPI.get(
            "/pets/" + currentPet._id + "/qr"
        ).then((data) => {

            if (data && data.qrCode) {

                showIdCard(currentPet, data.qrCode);

            } else {

                alert(
                    "Could not generate the QR code. Please try again."
                );
            }

        }).catch((err) => {

            console.error(err);

            alert(
                err.message ||
                "Could not generate the QR code. Please try again."
            );

        }).finally(() => {

            generateBtn.innerHTML =
                oldText;

            if (currentPet) {
                generateBtn.disabled = false;
            }
        });
    }


    function downloadIdCard() {

        if (!currentPet) return;

        const name =
            (currentPet.name || "pet")
                .replace(/\s+/g, "-")
                .toLowerCase();

        try {

            const cardClone =
                idCard.cloneNode(true);

            const canvas =
                document.createElement("canvas");

            const width = cardClone.offsetWidth || 460;
            const height = cardClone.offsetHeight || 420;

            canvas.width = width * 2;
            canvas.height = height * 2;

            const ctx =
                canvas.getContext("2d");

            const xml =
                new XMLSerializer()
                    .serializeToString(cardClone);

            const svg =
                "data:image/svg+xml;charset=utf-8," +
                encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
                        <foreignObject width="100%" height="100%">
                            ${xml}
                        </foreignObject>
                    </svg>`
                );

            const img =
                new Image();

            img.onload = () => {

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                const link =
                    document.createElement("a");

                link.download =
                    `famipet-${name}-id.png`;

                link.href =
                    canvas.toDataURL("image/png");

                link.click();
            };

            img.src = svg;

        } catch (error) {

            console.warn(error);

            window.print();
        }
    }


    petSelect.addEventListener(
        "change",
        refreshPreview
    );

    generateBtn.addEventListener(
        "click",
        generateQr
    );

    downloadBtn.addEventListener(
        "click",
        downloadIdCard
    );


    loadPets();

});