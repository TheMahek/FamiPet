const form = document.getElementById("loginForm");

const email = document.getElementById("email");
const password = document.getElementById("password");

const emailError = document.getElementById("emailError");
const passwordError = document.getElementById("passwordError");

const loginBtn = document.getElementById("loginBtn");

const toggle = document.querySelector(".toggle-password");

console.log("Login JS Loaded");

// ===============================
// PASSWORD TOGGLE
// ===============================

toggle.addEventListener("click", () => {

    if(password.type === "password"){

        password.type = "text";

        toggle.innerHTML = '<i class="fa-regular fa-eye-slash"></i>';

    }else{

        password.type = "password";

        toggle.innerHTML = '<i class="fa-regular fa-eye"></i>';

    }

});

// ===============================
// LOGIN
// ===============================

form.addEventListener("submit", async (e) => {

    e.preventDefault();

    emailError.textContent = "";
    passwordError.textContent = "";

    email.style.borderColor = "";
    password.style.borderColor = "";

    let valid = true;

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailPattern.test(email.value.trim())) {

        emailError.textContent = "Please enter a valid email.";

        email.style.borderColor = "#EF4444";

        valid = false;

    }

    if (password.value.trim().length < 6) {

        passwordError.textContent = "Password must be at least 6 characters.";

        password.style.borderColor = "#EF4444";

        valid = false;

    }

    if (!valid) return;

    loginBtn.disabled = true;

    loginBtn.innerHTML = `
        <i class="fa-solid fa-spinner fa-spin"></i>
        Logging In...
    `;

    try {

        const data = await FamiPetAPI.post("/auth/login", {
            email: email.value.trim(),
            password: password.value,
        });

        FamiPetAPI.setToken(data.token);
        FamiPetAPI.setUser(data.user);

        loginBtn.innerHTML = `
            <i class="fa-solid fa-check"></i>
            Login Successful
        `;

        loginBtn.style.background =
            "linear-gradient(135deg,#38C976,#2DBD69)";

        loginBtn.style.transform = "scale(1.02)";

        setTimeout(() => {

            if (data.user && data.user.role === "admin") {
                window.location.href = "../admin/dashboard.html";
            } else {
                window.location.href = "dashboard.html";
            }

        }, 800);

    } catch (err) {

        loginBtn.disabled = false;

        loginBtn.innerHTML = `
            <i class="fa-solid fa-right-to-bracket"></i>
            Login
        `;

        loginBtn.style.background = "";
        loginBtn.style.transform = "";

        const msg = err.message || "Login failed. Please try again.";

        if (err.data && err.data.isVerified === false) {

            passwordError.textContent = "Please verify your email before logging in.";

            const resendBox = document.querySelector(".form-options");

            if (resendBox && !document.getElementById("resendVerifyLink")) {

                const link = document.createElement("a");

                link.id = "resendVerifyLink";

                link.href = "#";

                link.style.cssText = "display:block;text-align:right;font-size:12px;margin-top:4px;";

                link.textContent = "Resend verification email";

                link.addEventListener("click", async (ev) => {

                    ev.preventDefault();

                    link.disabled = true;

                    link.textContent = "Sending...";

                    try {

                        await FamiPetAPI.post("/auth/resend-verification", { email: email.value.trim() });

                        link.textContent = "Verification email sent! Check your inbox.";

                    } catch (e) {

                        link.textContent = e.message || "Could not send verification email.";

                    }

                });

                resendBox.appendChild(link);

            }

            return;

        }

        if (err.status === 403 && (msg || "").toLowerCase().includes("blocked")) {

            emailError.textContent = msg;

            return;

        }

        passwordError.textContent = msg;

    }

});