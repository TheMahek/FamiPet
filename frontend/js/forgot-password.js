/* =========================================================
   FAMIPET - FORGOT PASSWORD
   ========================================================= */

const forgotForm = document.getElementById("forgotForm");
const emailInput = document.getElementById("email");
const emailError = document.getElementById("emailError");
const forgotBtn = document.getElementById("forgotBtn");

forgotForm.addEventListener("submit", async (e) => {

    e.preventDefault();

    emailError.textContent = "";

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(emailInput.value.trim())) {
        emailError.textContent = "Please enter a valid email.";
        return;
    }

    forgotBtn.disabled = true;

    forgotBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Sending...
    `;

    try {

        await FamiPetAPI.post("/auth/forgot-password", {
            email: emailInput.value.trim(),
        }, { auth: false });

        forgotBtn.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Reset Link Sent
        `;

        forgotBtn.style.background = "linear-gradient(135deg,#38C976,#2DBD69)";

        emailInput.style.borderColor = "";

        emailError.style.color = "#38C976";
        emailError.textContent = "If the email is registered, a reset link has been sent. Please check your inbox.";

    } catch (err) {

        forgotBtn.disabled = false;

        forgotBtn.innerHTML = `
            <i class="fa-solid fa-paper-plane"></i>
            Send Reset Link
        `;

        emailError.style.color = "";
        emailError.textContent = err.message || "Something went wrong. Please try again.";

    }

});