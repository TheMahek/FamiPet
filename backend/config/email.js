const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

// A mail transport exists only when the deployment supplies SMTP credentials
// (EMAIL_USER + EMAIL_PASS). EMAIL_SERVICE is optional and defaults to gmail.
// With these unset, sendEmail() refuses to send (returns false) and the auth
// flows fail with an intentional, configured error instead of pretending a
// message was delivered.
const isEmailConfigured = () => Boolean(
  process.env.EMAIL_USER && process.env.EMAIL_PASS
);

const transporter = nodemailer.createTransport({
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendEmail = async (to, subject, html) => {
  if (!isEmailConfigured()) {
    logger.warn('Email transport is not configured (EMAIL_USER/EMAIL_PASS unset). Mail not sent.');
    return false;
  }
  try {
    await transporter.sendMail({
      from: `"FamiPet" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch (error) {
    logger.error('Email send error:', error);
    return false;
  }
};

module.exports = { transporter, isEmailConfigured, sendEmail };
