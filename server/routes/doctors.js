const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken, authenticateToken } = require('../auth');

// Doctor Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const doctor = db.prepare('SELECT * FROM doctors WHERE email = ?').get(email);

    if (!doctor || !bcrypt.compareSync(password, doctor.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({ id: doctor.id, email: doctor.email, role: 'doctor' });
    const { password: _, ...doctorData } = doctor;

    res.json({
      message: 'Login successful',
      token,
      user: { ...doctorData, role: 'doctor' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all doctors (public)
router.get('/', (req, res) => {
  try {
    const db = getDb();
    const { specialty, search, sort } = req.query;

    let query = 'SELECT id, name, email, specialty, qualification, experience_years, consultation_fee, bio, avatar_url, rating, total_reviews, available_days FROM doctors';
    const conditions = [];
    const params = [];

    if (specialty) {
      conditions.push('specialty = ?');
      params.push(specialty);
    }

    if (search) {
      conditions.push('(name LIKE ? OR specialty LIKE ? OR qualification LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    if (sort === 'rating') {
      query += ' ORDER BY rating DESC';
    } else if (sort === 'experience') {
      query += ' ORDER BY experience_years DESC';
    } else if (sort === 'fee_low') {
      query += ' ORDER BY consultation_fee ASC';
    } else if (sort === 'fee_high') {
      query += ' ORDER BY consultation_fee DESC';
    } else {
      query += ' ORDER BY rating DESC';
    }

    const doctors = db.prepare(query).all(...params);
    res.json(doctors);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get specialties list
router.get('/specialties', (req, res) => {
  try {
    const db = getDb();
    const specialties = db.prepare('SELECT DISTINCT specialty FROM doctors ORDER BY specialty').all();
    res.json(specialties.map(s => s.specialty));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get doctor profile (authenticated)
router.get('/me/profile', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.user.id);
    if (!doctor) return res.status(404).json({ error: 'Doctor not found' });

    const { password: _, ...doctorData } = doctor;

    // Get stats
    const stats = db.prepare(`
      SELECT
        COUNT(*) as total_appointments,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM appointments WHERE doctor_id = ?
    `).get(req.user.id);

    res.json({ ...doctorData, stats, role: 'doctor' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update doctor profile
router.put('/me/profile', authenticateToken, (req, res) => {
  try {
    const { bio, consultation_fee, available_days, slot_duration } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE doctors SET
        bio = COALESCE(?, bio),
        consultation_fee = COALESCE(?, consultation_fee),
        available_days = COALESCE(?, available_days),
        slot_duration = COALESCE(?, slot_duration)
      WHERE id = ?
    `).run(bio, consultation_fee, available_days ? JSON.stringify(available_days) : null, slot_duration, req.user.id);

    const doctor = db.prepare('SELECT * FROM doctors WHERE id = ?').get(req.user.id);
    const { password: _, ...doctorData } = doctor;
    res.json({ message: 'Profile updated', user: doctorData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get doctor's current weekly slots and availability
router.get('/me/slots', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const slots = db.prepare('SELECT * FROM time_slots WHERE doctor_id = ? ORDER BY day_of_week, start_time').all(req.user.id);
    const doctor = db.prepare('SELECT available_days, slot_duration, consultation_fee FROM doctors WHERE id = ?').get(req.user.id);
    
    let days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    if (doctor && doctor.available_days) {
      try {
        days = JSON.parse(doctor.available_days);
      } catch (e) {}
    }

    res.json({
      slots,
      available_days: days,
      slot_duration: doctor ? doctor.slot_duration : 30,
      consultation_fee: doctor ? doctor.consultation_fee : 0
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manage time slots
router.put('/me/slots', authenticateToken, (req, res) => {
  try {
    const { slots, available_days } = req.body;
    const db = getDb();

    if (available_days) {
      db.prepare('UPDATE doctors SET available_days = ? WHERE id = ?').run(JSON.stringify(available_days), req.user.id);
    }

    if (Array.isArray(slots)) {
      // Delete existing slots
      db.prepare('DELETE FROM time_slots WHERE doctor_id = ?').run(req.user.id);

      // Insert new slots
      const insert = db.prepare('INSERT INTO time_slots (doctor_id, day_of_week, start_time, end_time) VALUES (?, ?, ?, ?)');
      const insertAll = db.transaction(() => {
        for (const slot of slots) {
          insert.run(req.user.id, slot.day_of_week, slot.start_time, slot.end_time);
        }
      });
      insertAll();
    }

    res.json({ message: 'Schedule updated successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get doctor's patients
router.get('/me/patients', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const patients = db.prepare(`
      SELECT p.id, p.name, p.email, p.phone, p.gender, p.date_of_birth, p.blood_group, p.address,
             COUNT(a.id) as total_appointments,
             MAX(a.appointment_date) as last_visit,
             MIN(a.appointment_date) as first_visit
      FROM patients p
      JOIN appointments a ON p.id = a.patient_id
      WHERE a.doctor_id = ?
      GROUP BY p.id
      ORDER BY last_visit DESC
    `).all(req.user.id);

    res.json(patients);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single doctor details
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const doctor = db.prepare('SELECT id, name, email, specialty, qualification, experience_years, consultation_fee, bio, avatar_url, rating, total_reviews, available_days FROM doctors WHERE id = ?').get(req.params.id);

    if (!doctor) {
      return res.status(404).json({ error: 'Doctor not found' });
    }

    // Get reviews
    const reviews = db.prepare(`
      SELECT r.*, p.name as patient_name
      FROM reviews r
      JOIN patients p ON r.patient_id = p.id
      WHERE r.doctor_id = ?
      ORDER BY r.created_at DESC
      LIMIT 10
    `).all(req.params.id);

    res.json({ ...doctor, reviews });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get doctor's available slots for a specific date
router.get('/:id/slots', (req, res) => {
  try {
    const { date } = req.query;
    if (!date) {
      return res.status(400).json({ error: 'Date parameter is required' });
    }

    const db = getDb();
    const requestedDate = new Date(date);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const dayOfWeek = dayNames[requestedDate.getUTCDay()];

    // Get all slots for this day
    const slots = db.prepare(`
      SELECT * FROM time_slots
      WHERE doctor_id = ? AND day_of_week = ? AND is_active = 1
      ORDER BY start_time
    `).all(req.params.id, dayOfWeek);

    // Get booked appointments for this date
    const booked = db.prepare(`
      SELECT start_time, end_time FROM appointments
      WHERE doctor_id = ? AND appointment_date = ? AND status IN ('pending', 'confirmed')
    `).all(req.params.id, date);

    const bookedTimes = new Set(booked.map(b => b.start_time));

    const availableSlots = slots.map(slot => ({
      ...slot,
      is_booked: bookedTimes.has(slot.start_time)
    }));

    res.json(availableSlots);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

