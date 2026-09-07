require("dotenv").config();

const { transporter } = require("./config/email");

async function testEmail() {
  try {
    await transporter.verify();
    console.log("✅ Email configuration is working!");
  } catch (error) {
    console.error("❌ Email configuration failed:");
    console.error(error.message);
  }
}

testEmail();
