// ======================================================
// PASSWORD TOGGLE
// ======================================================

const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");

const togglePassword = document.getElementById("togglePassword");
const toggleConfirmPassword = document.getElementById("toggleConfirmPassword");

togglePassword.addEventListener("click", () => {

    const type = password.type === "password" ? "text" : "password";
    password.type = type;

    togglePassword.innerHTML =
        type === "password"
            ? '<i class="fa-regular fa-eye"></i>'
            : '<i class="fa-regular fa-eye-slash"></i>';
});

toggleConfirmPassword.addEventListener("click", () => {

    const type = confirmPassword.type === "password" ? "text" : "password";
    confirmPassword.type = type;

    toggleConfirmPassword.innerHTML =
        type === "password"
            ? '<i class="fa-regular fa-eye"></i>'
            : '<i class="fa-regular fa-eye-slash"></i>';
});

// ======================================================
// PASSWORD STRENGTH
// ======================================================

const strengthBar = document.getElementById("strengthBar");
const strengthText = document.getElementById("strengthText");

password.addEventListener("input", () => {

    const value = password.value;

    let score = 0;

    if (value.length >= 8) score++;
    if (/[a-z]/.test(value)) score++;
    if (/[A-Z]/.test(value)) score++;
    if (/\d/.test(value)) score++;
    if (/[!@#$%^&*(),.?":{}|<>]/.test(value)) score++;

    // Empty
    if (value.length === 0) {
        strengthBar.style.width = "0%";
        strengthBar.style.background = "#E5E7EB";
        strengthText.textContent = "";
        return;
    }

    // Weak
    if (score <= 2) {
        strengthBar.style.width = "33%";
        strengthBar.style.background = "#EF4444";
        strengthText.textContent = "Weak Password";
        strengthText.style.color = "#EF4444";
    }

    // Medium
    else if (score <= 4) {
        strengthBar.style.width = "66%";
        strengthBar.style.background = "#F59E0B";
        strengthText.textContent = "Medium Password";
        strengthText.style.color = "#F59E0B";
    }

    // Strong
    else {
        strengthBar.style.width = "100%";
        strengthBar.style.background = "#22C55E";
        strengthText.textContent = "Strong Password";
        strengthText.style.color = "#22C55E";
    }

});


// ======================================================
// CONFIRM PASSWORD
// ======================================================

const confirmPasswordError = document.getElementById("confirmPasswordError");

confirmPassword.addEventListener("keyup", () => {

    if (confirmPassword.value === "") {

        confirmPasswordError.innerHTML = "";
        return;

    }

    if (password.value !== confirmPassword.value) {

        confirmPasswordError.innerHTML = "Passwords do not match";

    } else {

        confirmPasswordError.innerHTML = "";

    }

});


// ======================================================
// ROLE CARD SELECTION
// ======================================================

const roleCards = document.querySelectorAll(".role-card");

roleCards.forEach(card => {

    card.addEventListener("click", () => {

        roleCards.forEach(c => c.classList.remove("active"));

        card.classList.add("active");

        card.querySelector("input").checked = true;

    });

});

// ======================================================
// FORM VALIDATION
// ======================================================

const signupForm = document.getElementById("signupForm");
const successToast = document.getElementById("successToast");

const fullName = document.getElementById("fullName");
const email = document.getElementById("email");
const phone = document.getElementById("phone");
const terms = document.getElementById("terms");

const nameError = document.getElementById("nameError");
const emailError = document.getElementById("emailError");
const phoneError = document.getElementById("phoneError");
const passwordError = document.getElementById("passwordError");
const termsError = document.getElementById("termsError");
const signupBtn = document.getElementById("signupBtn");

signupForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    nameError.textContent = "";
    emailError.textContent = "";
    phoneError.textContent = "";
    passwordError.textContent = "";
    confirmPasswordError.textContent = "";
    termsError.textContent = "";

    let valid = true;

    if (fullName.value.trim().length < 2) {
        nameError.textContent = "Please enter your full name.";
        valid = false;
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.value.trim())) {
        emailError.textContent = "Please enter a valid email.";
        valid = false;
    }

    if (phone.value.trim().length < 6) {
        phoneError.textContent = "Please enter a valid phone number.";
        valid = false;
    }

    if (password.value.trim().length < 6) {
        passwordError.textContent = "Password must be at least 6 characters.";
        valid = false;
    }

    if (password.value !== confirmPassword.value) {
        confirmPasswordError.textContent = "Passwords do not match.";
        valid = false;
    }

    if (!terms.checked) {
        termsError.textContent = "Please accept the Terms & Privacy Policy.";
        valid = false;
    }

    if (!valid) return;

    signupBtn.disabled = true;

    signupBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Creating...
    `;

    try {

        await FamiPetAPI.post("/auth/register", {
            name: fullName.value.trim(),
            email: email.value.trim(),
            password: password.value,
            phone: phone.value.trim(),
        });

        successToast.classList.add("show");

        setTimeout(() => {
            window.location.href = "login.html";
        }, 3000);

    } catch (err) {

        signupBtn.disabled = false;

        signupBtn.innerHTML = `
            <i class="fa-solid fa-user-plus"></i>
            Create Account
        `;

        if (err.data && err.data.message) {

            const msg = err.data.message.toLowerCase();

            if (msg.includes("email")) {
                emailError.textContent = err.data.message;
            } else {
                passwordError.textContent = err.data.message;
            }

        } else {

            passwordError.textContent = err.message || "Registration failed. Please try again.";

        }

    }

});