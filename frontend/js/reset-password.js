/* =========================================================
   FAMIPET - RESET PASSWORD
   Reads ?token= from the URL and calls the backend.
   ========================================================= */

const resetForm = document.getElementById("resetForm");
const password = document.getElementById("password");
const confirmPassword = document.getElementById("confirmPassword");
const passwordError = document.getElementById("passwordError");
const confirmPasswordError = document.getElementById("confirmPasswordError");
const resetBtn = document.getElementById("resetBtn");

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

const params = new URLSearchParams(window.location.search);
const token = params.get("token");

resetForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    passwordError.textContent = "";
    confirmPasswordError.textContent = "";

    let valid = true;

    if (password.value.trim().length < 6) {
        passwordError.textContent = "Password must be at least 6 characters.";
        valid = false;
    }

    if (password.value !== confirmPassword.value) {
        confirmPasswordError.textContent = "Passwords do not match.";
        valid = false;
    }

    if (!token) {
        passwordError.textContent = "This reset link is missing or invalid.";
        valid = false;
    }

    if (!valid) return;

    resetBtn.disabled = true;

    resetBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Resetting...
    `;

    try {

        const data = await FamiPetAPI.post("/auth/reset-password/" + encodeURIComponent(token), {
            password: password.value,
        }, { auth: false });

        if (data.token) {
            FamiPetAPI.setToken(data.token);
        }

        resetBtn.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Password Updated
        `;

        resetBtn.style.background = "linear-gradient(135deg,#38C976,#2DBD69)";

        passwordError.style.color = "#38C976";
        passwordError.textContent = "Password reset successful! Redirecting...";

        setTimeout(() => {
            window.location.href = "login.html";
        }, 2000);

    } catch (err) {

        resetBtn.disabled = false;

        resetBtn.innerHTML = `
            <i class="fa-solid fa-key"></i>
            Reset Password
        `;

        passwordError.style.color = "";
        passwordError.textContent = (err && err.data && err.data.message) || "The reset link is invalid or has expired.";

    }

});