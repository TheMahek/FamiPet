const nodemailer = require('nodemailer');

// Email transport selection is environment-driven to keep real sends from
// being disturbed while testing:
//   - default          -> real Gmail/SMTP service (production/normal dev)
//   - EMAIL_TRANSPORT=json       -> in-memory sends (test mode, no delivery)
//   - EMAIL_TRANSPORT=quota-sim  -> every send fails like Gmail's daily-limit
//                                   error, to test the quota-handling branch.
const mode = process.env.EMAIL_TRANSPORT || 'smtp';

const quotaSimError = () => {
  const err = new Error(
    'Data command failed: 550-5.4.5 Daily user sending limit exceeded.'
  );
  err.code = 'EENVELOPE';
  err.responseCode = 550;
  err.response =
    '550-5.4.5 Daily user sending limit exceeded. Please try again later.';
  return err;
};

const transporter =
  mode === 'json'
    ? nodemailer.createTransport({ jsonTransport: true })
    : mode === 'quota-sim'
      ? { async sendMail() { throw quotaSimError(); } }
      : nodemailer.createTransport({
          service: process.env.EMAIL_SERVICE || 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS,
          },
        });

if (mode === 'json') {
  console.log('[Email] JSON transport enabled (test mode). No real emails are sent.');
} else if (mode === 'quota-sim') {
  console.log('[Email] Quota-sim transport enabled (test mode). Every send fails with a daily-limit error.');
}

// Sanitizes a nodemailer/SMTP error for logging.
// Never prints credentials, the transporter config, or request internals;
// only the provider's human-readable response text and code are surfaced.
const sanitizeError = (error) => {
  if (!error) return 'Unknown email error.';

  const code =
    error.responseCode || error.code || '';

  // nodemailer SMTPTransport errors carry the provider's reply text.
  const text = error.response
    ? String(error.response)
    : error.message;

  return `SMTP ${code}${
    text ? ` - ${String(text).slice(0, 200)}` : ''
  }`.trim();
};

// Gmail (and most ESPs) rate-limit or cap daily outbound volume.
// Quota/rate errors look like: 421 ... rate limit exceeded,
// or the "You have reached a limit for sending mail." reply.
const isQuotaOrRateLimit = (error) => {
  if (!error) return false;

  const code =
    error.responseCode || error.code || 0;

  const text =
    String(error.response || error.message || '').toLowerCase();

  return (
    code === 421 ||
    code === 460 ||
    /rate limit|sending limit|quota|daily message limit|daily user sending limit|user sending limit exceeded|too many (messages|requests|emails)/i.test(
      text
    )
  );
};

const sendEmail = async (to, subject, html) => {
  try {
    await transporter.sendMail({
      from: `"FamiPet" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return { ok: true };
  } catch (error) {
    if (isQuotaOrRateLimit(error)) {
      console.error(
        `[Email] Sending limit reached (${sanitizeError(
          error
        )}). Not retrying immediately to avoid exhausting the provider quota.`
      );
      return { ok: false, reason: 'quota' };
    }
    console.error(
      `[Email] Send failed: ${sanitizeError(error)}`
    );
    return { ok: false, reason: 'send_failed' };
  }
};

module.exports = { transporter, sendEmail };