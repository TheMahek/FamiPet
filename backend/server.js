const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const User = require('./models/User');
const errorHandler = require('./middleware/errorHandler');
const reminderScheduler = require('./services/reminder-scheduler.service');

// Load .env from THIS directory (backend/.env). Loading it relative to
// process.cwd() would silently use different settings (including a different
// MongoDB database and JWT secret) depending on which folder the server is
// started from, making users/data appear to "change" across restarts.
require('dotenv').config({ path: path.join(__dirname, '.env') });

// Fail fast when the single persistent database is not configured. The app data
// (users, pets, profile, favorites, ...) lives in MONGODB_URI only; the app must
// never silently connect to a fallback database between restarts.
if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI is not set. Expected backend/.env to define it (e.g. mongodb://.../petDB).');
  console.error('   Aborting startup so the app can never switch databases and lose user identity.');
  process.exit(1);
}

// Production requires a JWT signing secret. Fail fast instead of silently
// issuing unsigned/unverifiable tokens. (Never print the actual secret.)
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('❌ JWT_SECRET must be set when NODE_ENV=production. Aborting startup.');
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');

// Requests arrive through the nginx reverse proxy with a single trusted hop
// (X-Forwarded-For). Trust that hop so req.ip and the rate-limit keys see the
// real client address instead of the proxy container's IP. Direct dev access
// without the proxy sends no X-Forwarded-For and falls back to the socket IP.
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  // Uploads (avatars, pet/community/lost-found images) must be embeddable
  // from the frontend origin (e.g. Live Server on 5502) as <img>, etc.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(compression());
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5502').split(',').map(v => v.trim()).filter(Boolean);
// The deployed frontend (FRONTEND_URL) is also allowed to call the API, so
// production verification / pages work from the public site. Both values stay
// fully environment-driven — never hard-coded.
[process.env.FRONTEND_URL, process.env.BACKEND_URL].forEach(u => {
  if (u && !allowedOrigins.includes(u)) allowedOrigins.push(u);
});
// Allow local development origins including LAN access (phone on same Wi-Fi).
const isDevOrigin = function (origin) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (/^https?:\/\/localhost(?::\d+)?$/.test(origin)) return true;
  if (/^https?:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin)) return true;
  // Private network ranges used by Live Server / Vite on a LAN.
  if (/^https?:\/\/(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(origin)) return true;
  return false;
};
app.use(cors({
  origin(origin, callback) {
    if (isDevOrigin(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// General API rate limiting (per IP) to prevent basic abuse / flooding.
// File uploads are matched by Multer before touching this limit; the same
// applies to /uploads static requests, which are intentionally not limited.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api', apiLimiter);

// Focused authentication rate limiting — stricter than the general /api
// limiter so /login, /register and /forgot-password resist brute-force and
// account-creation abuse without locking out normal users.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' },
});
app.use('/api/auth', authLimiter);

const strictAuthLimit = (limit, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message },
  });

app.use('/api/auth/login', strictAuthLimit(20, 'Too many login attempts, please try again later.'));
app.use('/api/auth/register', strictAuthLimit(20, 'Too many sign-up attempts, please try again later.'));
app.use('/api/auth/forgot-password', strictAuthLimit(10, 'Too many requests, please try again later.'));

// Database Connection — always the single configured database (MONGODB_URI).
// The connection target never depends on the working directory, server IP,
// container, or a fallback literal, so a restart can not change which database
// (and therefore which users) the API serves.
mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    console.log(`✅ MongoDB Connected (database: ${mongoose.connection.db.databaseName})`);

    // ---------------------------------------------------------
    // ONE-TIME CLEANUP: DEFAULT USER PROFILE PHOTOS
    // New users are never assigned a default avatar (the User model
    // defaults avatar to ""). Older records may still hold the old
    // default placeholder (user-profile.svg) from earlier frontend
    // builds that saved it. Clear those so no user shows a default
    // profile photo they never uploaded. Idempotent on every start.
    // ---------------------------------------------------------
    try {
      const result = await User.updateMany(
        { avatar: /user-profile\.svg/i },
        { $set: { avatar: "" } }
      );
      if (result.modifiedCount > 0) {
        console.log(`🧹 Cleared old default profile photos for ${result.modifiedCount} user(s).`);
      }
    } catch (cleanupErr) {
      console.error('⚠️ Could not clean up default avatars:', cleanupErr.message);
    }

    // ---------------------------------------------------------
    // START REMINDER SCHEDULER (Phase 7)
    // In-process poller for due reminders. Persistent state lives
    // in MongoDB (nextRunAt / claims), so restarts never lose a
    // due reminder. Started only after the DB is confirmed ready;
    // stopped on graceful shutdown.
    // ---------------------------------------------------------
    reminderScheduler.start();
  })
  .catch(err => console.error('❌ MongoDB Error:', err));

// Health Check (registered before the protected /api/health records router)
app.get('/api/status', (req, res) => {
  res.json({ status: 'OK', message: 'FamiPet API is running!' });
});

// Routes
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/user.routes'));
app.use('/api/pets', require('./routes/pet.routes'));
app.use('/api/breeds', require('./routes/breed.routes'));
app.use('/api/adoptions', require('./routes/adoption.routes'));
app.use('/api/lost-found', require('./routes/lostFound.routes'));
app.use('/api/health', require('./routes/health.routes'));
app.use('/api/vaccinations', require('./routes/vaccination.routes'));
app.use("/api/favorites", require("./routes/favorite.routes"));
app.use('/api/veterinarians', require('./routes/veterinarian.routes'));
app.use('/api/appointments', require('./routes/appointment.routes'));
app.use('/api/community', require('./routes/community.routes'));
app.use('/api/ai', require('./routes/ai.routes'));
app.use('/api/notifications', require('./routes/notification.routes'));
app.use('/api/push', require('./routes/push.routes'));
app.use('/api/reminders', require('./routes/reminder.routes'));
app.use('/api/admin', require('./routes/admin.routes'));


//home page 
app.get("/",(req,res)=>{
  res.status(200).json({
    success:true,
    message:"FamiPet backend is running successfully!"
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

// Centralized Error Handler
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

// ---------------------------------------------------------
// FRONTEND FALLBACK LISTENER
// ---------------------------------------------------------
// Serve the static frontend on the CLIENT_URL port too, so emailed
// verify-email / reset-password links resolve even when the Live
// Server extension is not running. If Live Server already owns the
// port (EADDRINUSE) the backend quietly skips this fallback.
// ---------------------------------------------------------
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

function startFrontendFallback() {
  let clientPort = 5502;
  try {
    const clientUrl = new URL(process.env.CLIENT_URL || 'http://localhost:5502');
    clientPort = Number(clientUrl.port) || 5502;
  } catch (e) { /* keep default */ }

  if (clientPort === PORT) return;

  const frontendApp = express();
  frontendApp.use(compression());
  frontendApp.use(express.static(FRONTEND_DIR));

  frontendApp.get('*', (req, res) => {
    res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
  });

  const server = frontendApp.listen(clientPort, '0.0.0.0', () => {
    console.log(`🌐 Frontend available at http://localhost:${clientPort} (fallback)`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE') {
      console.log(`⏭ Port ${clientPort} is already in use (Live Server). Skipping frontend fallback.`);
    } else {
      console.error('❌ Frontend fallback error:', err.message);
    }
  });
}

// The nginx reverse proxy serves the static frontend in Docker, so the built-in
// Express fallback listener is redundant there and is disabled via
// SERVE_FRONTEND_FALLBACK=false (set in docker-compose.yml). The host dev flow
// (npm start outside Docker) keeps it by default.
if (process.env.SERVE_FRONTEND_FALLBACK !== 'false') {
  startFrontendFallback();
}

// Graceful shutdown: stop the reminder poller so no in-flight pass is cut off
// mid-write (claims are lease-based, so even an abrupt stop self-heals).
const shutdown = () => {
  reminderScheduler.stop();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;
