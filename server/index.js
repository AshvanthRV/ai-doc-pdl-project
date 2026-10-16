const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:3001', 'http://localhost:3002', 'http://127.0.0.1:3001', 'http://127.0.0.1:3002', 'https://ai-doc-pdl-project-server.vercel.app'
],
  credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.url}`);
  next();
});

// Load environment variables from .env
const fs = require('fs');
[path.join(__dirname, '.env'), path.join(__dirname, '..', '.env')].forEach(envFile => {
  if (fs.existsSync(envFile)) {
    const lines = fs.readFileSync(envFile, 'utf8').split('\n');
    lines.forEach(line => {
      const parts = line.split('=');
      if (parts.length >= 2 && !process.env[parts[0].trim()]) {
        process.env[parts[0].trim()] = parts.slice(1).join('=').trim();
      }
    });
  }
});

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;

// Initialize database
getDb();

// Routes
app.use('/api/patients', require('./routes/patients'));
app.use('/api/doctors', require('./routes/doctors'));
app.use('/api/appointments', require('./routes/appointments'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/ai', require('./routes/ai'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Dashboard stats for doctor
const { authenticateToken } = require('./auth');
app.get('/api/dashboard/doctor', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const today = new Date().toISOString().split('T')[0];

    const todayAppointments = db.prepare(`
      SELECT a.*, p.name as patient_name, p.phone as patient_phone
      FROM appointments a
      JOIN patients p ON a.patient_id = p.id
      WHERE a.doctor_id = ? AND a.appointment_date = ?
      ORDER BY a.start_time ASC
    `).all(req.user.id, today);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM appointments WHERE doctor_id = ?
    `).get(req.user.id);

    const todayStats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending
      FROM appointments WHERE doctor_id = ? AND appointment_date = ?
    `).get(req.user.id, today);

    const recentPatients = db.prepare(`
      SELECT DISTINCT p.id, p.name, p.email, p.phone, p.gender, p.blood_group,
             MAX(a.appointment_date) as last_visit
      FROM patients p
      JOIN appointments a ON p.id = a.patient_id
      WHERE a.doctor_id = ? AND a.status = 'completed'
      GROUP BY p.id
      ORDER BY last_visit DESC
      LIMIT 5
    `).all(req.user.id);

    const weeklyData = db.prepare(`
      SELECT appointment_date, COUNT(*) as count
      FROM appointments
      WHERE doctor_id = ? AND appointment_date >= date('now', '-7 days')
      GROUP BY appointment_date
      ORDER BY appointment_date
    `).all(req.user.id);

    const revenue = db.prepare(`
      SELECT SUM(d.consultation_fee) as total_revenue
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.doctor_id = ? AND a.status = 'completed'
    `).get(req.user.id);

    res.json({
      today_appointments: todayAppointments,
      stats,
      today_stats: todayStats,
      recent_patients: recentPatients,
      weekly_data: weeklyData,
      total_revenue: revenue.total_revenue || 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Dashboard stats for patient
app.get('/api/dashboard/patient', authenticateToken, (req, res) => {
  try {
    const db = getDb();

    const upcomingAppointments = db.prepare(`
      SELECT a.*, d.name as doctor_name, d.specialty as doctor_specialty, d.avatar_url as doctor_avatar
      FROM appointments a
      JOIN doctors d ON a.doctor_id = d.id
      WHERE a.patient_id = ? AND a.appointment_date >= date('now') AND a.status IN ('pending', 'confirmed')
      ORDER BY a.appointment_date ASC, a.start_time ASC
      LIMIT 5
    `).all(req.user.id);

    const stats = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM appointments WHERE patient_id = ?
    `).get(req.user.id);

    const recentDoctors = db.prepare(`
      SELECT DISTINCT d.id, d.name, d.specialty, d.avatar_url, d.rating,
             MAX(a.appointment_date) as last_visit
      FROM doctors d
      JOIN appointments a ON d.id = a.doctor_id
      WHERE a.patient_id = ?
      GROUP BY d.id
      ORDER BY last_visit DESC
      LIMIT 5
    `).all(req.user.id);

    res.json({
      upcoming_appointments: upcomingAppointments,
      stats,
      recent_doctors: recentDoctors
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start server locally; Vercel will import the app directly.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🏥 Doctor Consultation API Server`);
    console.log(`   Running on: http://localhost:${PORT}`);
    console.log(`   Patient Portal: http://localhost:3001`);
    console.log(`   Doctor Dashboard: http://localhost:3002`);
    console.log(`   API Health: http://localhost:${PORT}/api/health\n`);
  });
}

module.exports = app;
