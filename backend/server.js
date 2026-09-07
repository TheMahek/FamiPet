const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(helmet());
app.use(compression());
const allowedOrigins = (process.env.CLIENT_URL || 'http://localhost:5173').split(',').map(v => v.trim()).filter(Boolean);
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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(morgan('dev'));

// Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/animal_planet')
  .then(() => console.log('✅ MongoDB Connected'))
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
app.use('/api/reminders', require('./routes/reminder.routes'));
app.use('/api/admin', require('./routes/admin.routes'));


//home page 
app.get("/",(req,res)=>{
  res.status(200).json({
    success:true,
    message:"FamiPet backend is running successfully!"
  });
});

// Error Handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error'
  });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Route not found' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

module.exports = app;
