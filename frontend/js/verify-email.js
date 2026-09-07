/* =========================================================
   FAMIPET - EMAIL VERIFICATION
   Reads ?token= from the URL and calls the backend.
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {

    const statusIcon = document.getElementById("statusIcon");
    const statusTitle = document.getElementById("statusTitle");
    const statusMessage = document.getElementById("statusMessage");
    const statusAction = document.getElementById("statusAction");

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (!token) {

        statusIcon.className = "status-icon error";
        statusIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        statusTitle.textContent = "Invalid Link";
        statusMessage.textContent = "This verification link is missing or invalid. Please request a new verification email.";

        statusAction.style.display = "inline-block";
        statusAction.href = "login.html";

        return;

    }

    try {

        const data = await FamiPetAPI.get("/auth/verify-email/" + encodeURIComponent(token), { auth: false });

        statusIcon.className = "status-icon success";
        statusIcon.innerHTML = '<i class="fa-solid fa-circle-check"></i>';
        statusTitle.textContent = "Email Verified!";
        statusMessage.textContent = data.message || "Your email has been verified successfully. You can now login.";

        statusAction.style.display = "inline-block";
        statusAction.href = "login.html";

    } catch (err) {

        let msg = (err && err.data && err.data.message) || "The verification link is invalid or has expired.";

        if (/expired|valid/i.test(msg)) {
            msg = "The verification link is invalid or has expired. Please request a new verification email.";
        }

        statusIcon.className = "status-icon error";
        statusIcon.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>';
        statusTitle.textContent = "Verification Failed";
        statusMessage.textContent = msg;

        statusAction.style.display = "inline-block";
        statusAction.href = "login.html";
        statusAction.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Back to Login';

    }

});