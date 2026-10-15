const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { generateToken, authenticateToken } = require('../auth');

// Patient Registration
router.post('/register', (req, res) => {
  try {
    const { name, email, password, phone, date_of_birth, gender, blood_group, address } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM patients WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO patients (name, email, password, phone, date_of_birth, gender, blood_group, address)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, email, hashedPassword, phone || null, date_of_birth || null, gender || null, blood_group || null, address || null);

    const token = generateToken({ id: result.lastInsertRowid, email, role: 'patient' });

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: { id: result.lastInsertRowid, name, email, role: 'patient' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Patient Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const patient = db.prepare('SELECT * FROM patients WHERE email = ?').get(email);

    if (!patient || !bcrypt.compareSync(password, patient.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = generateToken({ id: patient.id, email: patient.email, role: 'patient' });

    const { password: _, ...patientData } = patient;
    res.json({
      message: 'Login successful',
      token,
      user: { ...patientData, role: 'patient' }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get patient profile
router.get('/profile', authenticateToken, (req, res) => {
  try {
    const db = getDb();
    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.user.id);
    if (!patient) return res.status(404).json({ error: 'Patient not found' });

    const { password: _, ...patientData } = patient;
    res.json(patientData);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update patient profile
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { name, phone, date_of_birth, gender, blood_group, address } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE patients SET name = COALESCE(?, name), phone = COALESCE(?, phone),
      date_of_birth = COALESCE(?, date_of_birth), gender = COALESCE(?, gender),
      blood_group = COALESCE(?, blood_group), address = COALESCE(?, address)
      WHERE id = ?
    `).run(name, phone, date_of_birth, gender, blood_group, address, req.user.id);

    const patient = db.prepare('SELECT * FROM patients WHERE id = ?').get(req.user.id);
    const { password: _, ...patientData } = patient;
    res.json({ message: 'Profile updated', user: patientData });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
